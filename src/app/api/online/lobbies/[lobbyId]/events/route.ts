import { getLobbyState, heartbeat } from '@/lib/online/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lobbyId: string }> }
) {
  const { lobbyId } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get('token')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let closed = false

      const send = async () => {
        if (closed) return
        try {
          if (token) await heartbeat(lobbyId, token)
          const data = await getLobbyState(lobbyId)
          const payload = JSON.stringify({
            lobby: {
              id: data.lobby.id,
              status: data.lobby.status,
              hostUserId: data.lobby.hostUserId,
              visibility: data.lobby.visibility,
              difficulty: data.lobby.difficulty,
            },
            state: data.state,
            disconnectedPlayers: data.lobby.players
              .filter((p) => p.status === 'disconnected')
              .map((p) => ({
                id: p.id,
                name: p.displayName,
                disconnectedAt: p.disconnectedAt?.toISOString() ?? null,
              })),
          })
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
        } catch {
          controller.enqueue(encoder.encode(`event: error\ndata: {"error":"LOBBY_NOT_FOUND"}\n\n`))
        }
      }

      await send()
      const interval = setInterval(send, 1000)

      request.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
