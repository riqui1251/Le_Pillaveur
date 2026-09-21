import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { subscribeRoom, subscribeRtc } from '@/lib/online/room-bus'
import { acquireStream } from '@/lib/online/stream-registry'
import { rateLimitResponse } from '@/lib/rate-limit'
import { STREAM_HEARTBEAT_MS } from '@/hooks/online-room-polling'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Délai conseillé quand le compte est au plafond de flux. Le temps qu'un
 * onglet oublié se fasse ramasser par son propre ping : un plafond de flux ne
 * se libère pas au bout d'une fenêtre, il se libère quand une connexion meurt.
 */
const STREAM_RETRY_AFTER_SEC = 30

/**
 * Flux SSE des changements d'une salle. Pousse un événement `changed` à chaque
 * mutation d'état, plus un événement `ping` régulier — un VRAI événement, pas
 * un commentaire SSE : l'API EventSource ne remonte jamais un commentaire au
 * script, et le client s'en sert de chien de garde pour repérer un flux mort
 * en silence (cf. STREAM_WATCHDOG_MS, useOnlineRoom). Le client (EventSource)
 * se ré-abonne automatiquement en cas de coupure ; un polling de secours reste actif.
 */
export async function GET(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { roomId } = await params
  const member = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
    select: { id: true },
  })
  if (!member) {
    return new Response('Forbidden', { status: 403 })
  }

  // Une connexion ouverte en permanence par flux : c'est la ressource la plus
  // chère de la salle, et elle était offerte sans compteur (voir
  // stream-registry.ts pour le choix du plafond et du mode de comptage).
  const release = acquireStream(user.id)
  if (!release) {
    return rateLimitResponse(STREAM_RETRY_AFTER_SEC)
  }

  const encoder = new TextEncoder()

  // Assigné par `start` (appelé dès la construction du flux) : `cancel` doit
  // pouvoir nettoyer même si le consommateur lâche le flux avant.
  let dispose = release

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let disposed = false
      // Tout ce qui doit être relâché, dans l'ordre d'acquisition. Une liste
      // plutôt que des variables : le nettoyage peut partir AVANT que la
      // dernière ressource soit créée (un enqueue échoue dès l'événement
      // `ready`), et il ne doit jamais dépendre de ce qui existe déjà.
      const disposers: (() => void)[] = [release]

      /**
       * Nettoyage idempotent, appelé par l'abort de la requête, par un enqueue
       * qui échoue et par le `cancel` du flux. Avant, un flux fermé par erreur
       * posait `closed = true` et le nettoyage commençait par `if (closed)
       * return` : l'intervalle de ping et les abonnements au bus survivaient
       * jusqu'au redémarrage du conteneur.
       */
      const cleanup = () => {
        if (disposed) return
        disposed = true
        request.signal.removeEventListener('abort', cleanup)
        for (const off of disposers.splice(0)) {
          try {
            off()
          } catch {
            /* un désabonnement raté ne doit pas empêcher les suivants */
          }
        }
        try {
          controller.close()
        } catch {
          /* déjà fermé */
        }
      }
      dispose = cleanup

      const safeEnqueue = (chunk: string) => {
        if (disposed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Le client est parti sans qu'aucun `abort` ne nous parvienne : le
          // ping régulier ci-dessous est ce qui finit par s'en apercevoir.
          cleanup()
        }
      }

      // Évènement initial : le client sait qu'il est connecté.
      safeEnqueue('event: ready\ndata: {}\n\n')

      disposers.push(
        subscribeRoom(roomId, (event) => {
          safeEnqueue(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        })
      )

      // Signalisation vocale : uniquement les messages ADRESSÉS à ce membre.
      disposers.push(
        subscribeRtc(roomId, user.id, (signal) => {
          safeEnqueue(`event: rtc\ndata: ${JSON.stringify(signal)}\n\n`)
        })
      )

      const heartbeat = setInterval(() => {
        safeEnqueue('event: ping\ndata: {}\n\n')
      }, STREAM_HEARTBEAT_MS)
      disposers.push(() => clearInterval(heartbeat))

      request.signal.addEventListener('abort', cleanup)
      // Requête déjà annulée pendant les lectures ci-dessus : l'écouteur ne
      // se déclencherait plus jamais.
      if (request.signal.aborted) cleanup()
    },
    cancel() {
      dispose()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Empêche tout buffering intermédiaire (proxies/CDN) du flux SSE.
      'X-Accel-Buffering': 'no',
    },
  })
}
