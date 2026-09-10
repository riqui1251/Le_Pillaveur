import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildLobbyOverview } from '@/lib/online-room'
import { onlineErrorBody } from '@/lib/online-errors'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  // `lobbies` reste en tête de la réponse : c'est le contrat historique du
  // guichet. `liveGames`/`liveGamesTotal` s'y ajoutent pour montrer que le
  // site est vivant même quand aucune table n'attend de joueurs.
  const { lobbies, liveGames, liveGamesTotal } = await buildLobbyOverview()
  return NextResponse.json({ lobbies, liveGames, liveGamesTotal })
}
