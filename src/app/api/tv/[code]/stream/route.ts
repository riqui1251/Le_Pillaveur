import { prisma } from '@/lib/prisma'
import { subscribeRoom, subscribeCastFrame } from '@/lib/online/room-bus'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Flux SSE des changements d'une salle pour l'écran TV — PUBLIC, indexé par CODE
 * (pas de check membre). Pousse un événement à chaque mutation d'état + un
 * keep-alive régulier. PAS d'abonnement RTC : la TV n'est qu'un afficheur.
 */
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 25_000

/**
 * Chaque connexion mobilise une requête ouverte en permanence : c'est la
 * ressource la plus chère de l'écran TV, et elle était offerte sans compteur.
 * Le plafond reste large parce qu'un EventSource se reconnecte tout seul
 * toutes les ~3 s en cas de coupure (Wi-Fi capricieux de salon) : trop serré,
 * on transformerait une micro-coupure en écran mort.
 */
const RATE_LIMIT = 60
const RATE_WINDOW_MS = 60_000

type Params = { params: Promise<{ code: string }> }

export async function GET(request: Request, { params }: Params) {
  const { code } = await params
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return new Response('Not found', { status: 404 })
  }

  const limit = checkRateLimit(rateLimitKey(request, 'tv-stream'), RATE_LIMIT, RATE_WINDOW_MS)
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSec)
  }

  const room = await prisma.onlineRoom.findUnique({
    where: { code: normalized },
    select: { id: true },
  })
  if (!room) {
    return new Response('Not found', { status: 404 })
  }

  const encoder = new TextEncoder()

  // Assigné par `start` (appelé dès la construction du flux) : `cancel` doit
  // pouvoir nettoyer même si le consommateur lâche le flux avant.
  let dispose = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let disposed = false
      // Tout ce qui doit être relâché, dans l'ordre d'acquisition — une liste
      // plutôt que des variables : le nettoyage peut partir AVANT que la
      // dernière ressource existe (un enqueue qui échoue dès `ready`).
      const disposers: (() => void)[] = []

      /**
       * Nettoyage idempotent, appelé par l'abort de la requête, par un enqueue
       * qui échoue et par le `cancel` du flux. Avant, un enqueue en échec
       * posait `closed = true` et le nettoyage commençait par `if (closed)
       * return` : le keep-alive et les abonnements au bus survivaient jusqu'au
       * redémarrage du conteneur — une TV débranchée coûtait pour toujours.
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
          // La TV a été éteinte sans qu'aucun `abort` ne nous parvienne : le
          // keep-alive ci-dessous est ce qui finit par s'en apercevoir.
          cleanup()
        }
      }

      safeEnqueue('event: ready\ndata: {}\n\n')

      disposers.push(
        subscribeRoom(room.id, (event) => {
          safeEnqueue(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        })
      )

      // Trames de bille (cast d'un jeu local) : relayées telles quelles.
      disposers.push(
        subscribeCastFrame(room.id, (frame) => {
          safeEnqueue(`event: castframe\ndata: ${JSON.stringify(frame)}\n\n`)
        })
      )

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`)
      }, HEARTBEAT_MS)
      disposers.push(() => clearInterval(heartbeat))

      request.signal.addEventListener('abort', cleanup)
      // Requête déjà annulée pendant la lecture de la salle : l'écouteur ne se
      // déclencherait plus jamais.
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
      'X-Accel-Buffering': 'no',
    },
  })
}
