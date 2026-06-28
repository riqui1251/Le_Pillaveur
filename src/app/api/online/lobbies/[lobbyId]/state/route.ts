import { NextResponse } from 'next/server'
import { getLobbyState, heartbeat } from '@/lib/online/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lobbyId: string }> }
) {
  const { lobbyId } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (token) {
    await heartbeat(lobbyId, token)
  }
  try {
    const data = await getLobbyState(lobbyId)
    return NextResponse.json({
      lobby: {
        id: data.lobby.id,
        status: data.lobby.status,
        visibility: data.lobby.visibility,
        difficulty: data.lobby.difficulty,
        hostUserId: data.lobby.hostUserId,
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
  } catch {
    return NextResponse.json({ error: 'LOBBY_NOT_FOUND' }, { status: 404 })
  }
}
