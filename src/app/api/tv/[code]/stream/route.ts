import { prisma } from '@/lib/prisma'
import { subscribeRoom } from '@/lib/online/room-bus'

/**
 * Flux SSE des changements d'une salle pour l'écran TV — PUBLIC, indexé par CODE
 * (pas de check membre). Pousse un événement à chaque mutation d'état + un
 * keep-alive régulier. PAS d'abonnement RTC : la TV n'est qu'un afficheur.
 */
export const dynamic = 'force-dynamic'

const HEARTBEAT_MS = 25_000

type Params = { params: Promise<{ code: string }> }

export async function GET(request: Request, { params }: Params) {
  const { code } = await params
  const normalized = code.trim().toUpperCase()
  const room = await prisma.onlineRoom.findUnique({
    where: { code: normalized },
    select: { id: true },
  })
  if (!room) {
    return new Response('Not found', { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          closed = true
        }
      }

      safeEnqueue('event: ready\ndata: {}\n\n')

      const unsubscribe = subscribeRoom(room.id, (event) => {
        safeEnqueue(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      })

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`)
      }, HEARTBEAT_MS)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          /* déjà fermé */
        }
      }

      request.signal.addEventListener('abort', cleanup)
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
