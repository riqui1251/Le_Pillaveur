import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { subscribeRoom, subscribeRtc } from '@/lib/online/room-bus'
import { STREAM_HEARTBEAT_MS } from '@/hooks/online-room-polling'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ roomId: string }> }

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

      // Évènement initial : le client sait qu'il est connecté.
      safeEnqueue('event: ready\ndata: {}\n\n')

      const unsubscribe = subscribeRoom(roomId, (event) => {
        safeEnqueue(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      })

      // Signalisation vocale : uniquement les messages ADRESSÉS à ce membre.
      const unsubscribeRtc = subscribeRtc(roomId, user.id, (signal) => {
        safeEnqueue(`event: rtc\ndata: ${JSON.stringify(signal)}\n\n`)
      })

      const heartbeat = setInterval(() => {
        safeEnqueue('event: ping\ndata: {}\n\n')
      }, STREAM_HEARTBEAT_MS)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
        unsubscribeRtc()
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
      // Empêche tout buffering intermédiaire (proxies/CDN) du flux SSE.
      'X-Accel-Buffering': 'no',
    },
  })
}
