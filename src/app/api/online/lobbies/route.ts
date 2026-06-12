import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildLobbyList } from '@/lib/online-room'

/** Liste des lobbies ouverts (en attente de joueurs), groupables par jeu côté client */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour voir les lobbies' }, { status: 401 })
  }

  const lobbies = await buildLobbyList()
  return NextResponse.json({ lobbies })
}
