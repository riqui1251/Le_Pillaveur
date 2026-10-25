import { prisma } from '@/lib/prisma'
import { subscribeRoom, subscribeCastFrame } from '@/lib/online/room-bus'
import { acquireTvStream } from '@/lib/online/stream-registry'
import { apiError, withApiRoute } from '@/lib/api-route'
import { checkRateLimit, networkRateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { STREAM_HEARTBEAT_MS } from '@/hooks/online-room-polling'
import { lookupTvCode } from '@/app/api/tv/code-lookup'

/**
 * Flux SSE des changements d'une salle pour l'écran TV — PUBLIC, indexé par CODE
 * (pas de check membre). Pousse un événement à chaque mutation d'état + un
 * `event: ping` régulier (un VRAI événement, que le script peut surveiller,
 * pas un commentaire SSE). PAS d'abonnement RTC : la TV n'est qu'un afficheur.
 */
export const dynamic = 'force-dynamic'

/**
 * Quota d'OUVERTURES par réseau (IPv4 entière, IPv6 /64). Large parce qu'un
 * EventSource se reconnecte tout seul toutes les ~3 s en cas de coupure (Wi-Fi
 * capricieux de salon), et que plusieurs télés d'un même bar partagent ce
 * compteur : trop serré, on transformerait une micro-coupure en écran mort.
 * Ce qui borne la mémoire, c'est le plafond de flux VIVANTS (acquireTvStream).
 */
const RATE_LIMIT = 120
const RATE_WINDOW_MS = 60_000

/** Délai conseillé au plafond : une place se libère quand un flux meurt, pas au bout d'une fenêtre. */
const STREAM_RETRY_AFTER_SEC = 30

/**
 * Durée de vie maximale d'un flux : sans elle, une requête ouverte restait
 * ouverte pour toujours. La télé se reconnecte d'elle-même (une ouverture
 * toutes les trois heures, rien au regard du quota).
 */
const TV_STREAM_MAX_MS = 3 * 60 * 60 * 1000

/**
 * Cadence de vérification de la salle : supprimée (cast arrêté, table
 * purgée), elle ne publie plus rien, et le flux la survivait jusqu'au
 * plafond de durée.
 */
const ROOM_CHECK_MS = 60_000

type Params = { params: Promise<{ code: string }> }

export const GET = withApiRoute('tv/[code]/stream GET', async (request: Request, { params }: Params) => {
  const { code } = await params
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return apiError('room_not_found', 404)
  }

  const limit = checkRateLimit(networkRateLimitKey(request, 'tv-stream'), RATE_LIMIT, RATE_WINDOW_MS)
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSec)
  }

  const lookup = await lookupTvCode(request, normalized, () =>
    prisma.onlineRoom.findUnique({
      where: { code: normalized },
      select: { id: true },
    })
  )
  if (!lookup.ok) {
    return rateLimitResponse(lookup.retryAfterSec)
  }
  const room = lookup.value
  if (!room) {
    return apiError('room_not_found', 404)
  }

  const release = acquireTvStream(networkRateLimitKey(request, 'tv-stream-live'))
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
      // Tout ce qui doit être relâché, dans l'ordre d'acquisition — une liste
      // plutôt que des variables : le nettoyage peut partir AVANT que la
      // dernière ressource existe (un enqueue qui échoue dès `ready`).
      const disposers: (() => void)[] = [release]

      /**
       * Nettoyage idempotent, appelé par l'abort de la requête, par un enqueue
       * qui échoue, par le `cancel` du flux, au plafond de durée et quand la
       * salle disparaît. Avant, un enqueue en échec posait `closed = true` et
       * le nettoyage commençait par `if (closed) return` : le keep-alive et
       * les abonnements au bus survivaient jusqu'au redémarrage du conteneur.
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
          // ping ci-dessous est ce qui finit par s'en apercevoir.
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
        safeEnqueue('event: ping\ndata: {}\n\n')
      }, STREAM_HEARTBEAT_MS)
      disposers.push(() => clearInterval(heartbeat))

      const maxAge = setTimeout(cleanup, TV_STREAM_MAX_MS)
      disposers.push(() => clearTimeout(maxAge))

      let checking = false
      const roomCheck = setInterval(() => {
        if (checking) return
        checking = true
        prisma.onlineRoom
          .findUnique({ where: { id: room.id }, select: { id: true } })
          .then((still) => {
            if (!still) cleanup()
          })
          .catch(() => {
            /* panne passagère de la base : on revérifiera au tour suivant */
          })
          .finally(() => {
            checking = false
          })
      }, ROOM_CHECK_MS)
      disposers.push(() => clearInterval(roomCheck))

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
})
