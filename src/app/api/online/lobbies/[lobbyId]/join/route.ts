import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { joinLobby } from '@/lib/online/server'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ lobbyId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Compte requis' }, { status: 401 })
  const { lobbyId } = await params
  try {
    const joined = await joinLobby(lobbyId, user.id, user.onlineDisplayName ?? user.displayName)
    return NextResponse.json(joined)
  } catch (error) {
    const code = error instanceof Error ? error.message : 'JOIN_FAILED'
    return NextResponse.json({ error: code }, { status: 400 })
  }
}
