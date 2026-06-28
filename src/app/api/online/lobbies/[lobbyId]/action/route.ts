import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import {
  hostDecision,
  reconnectWithToken,
  runResolveChallenge,
  runRoll,
  updateLobbyDifficulty,
} from '@/lib/online/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lobbyId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Compte requis' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { lobbyId } = await params
  try {
    if (body.type === 'roll') {
      const state = await runRoll(lobbyId, body.playerId)
      return NextResponse.json({ state })
    }
    if (body.type === 'challenge') {
      const state = await runResolveChallenge(lobbyId, body.playerId, Boolean(body.completed))
      return NextResponse.json({ state })
    }
    if (body.type === 'reconnect') {
      await reconnectWithToken(lobbyId, String(body.token ?? ''), user.id)
      return NextResponse.json({ ok: true })
    }
    if (body.type === 'host-decision') {
      const result = await hostDecision(
        lobbyId,
        user.id,
        body.decision === 'end_game' ? 'end_game' : 'replace_bot'
      )
      return NextResponse.json(result)
    }
    if (body.type === 'set-difficulty') {
      const difficulty = ['facile', 'normal', 'difficile', 'extreme'].includes(body.difficulty)
        ? body.difficulty
        : 'normal'
      await updateLobbyDifficulty(lobbyId, user.id, difficulty)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ACTION_FAILED'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
