import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildLobbyOverview } from '@/lib/online-room'
import { listRecentLaunches } from '@/lib/online/game-sessions'
import { readLobbiesCached, type LobbiesResponse } from '@/lib/online/lobbies-cache'
import { onlineErrorBody } from '@/lib/online-errors'

/**
 * Ce que le guichet affiche, lu en base. `lobbies` reste en tête de la
 * réponse : c'est le contrat historique du guichet. `liveGames`/
 * `liveGamesTotal` s'y ajoutent pour montrer que le site est vivant même
 * quand aucune table n'attend de joueurs, et `recentLaunches` pour qu'il le
 * reste quand plus personne ne joue à l'instant : c'est le journal des
 * lancements, borné aux 10 derniers.
 */
async function loadLobbiesResponse(): Promise<LobbiesResponse> {
  const [{ lobbies, liveGames, liveGamesTotal }, recentLaunches] = await Promise.all([
    buildLobbyOverview(),
    listRecentLaunches(),
  ])
  return { lobbies, liveGames, liveGamesTotal, recentLaunches }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  // La réponse est la même pour tout le monde et sondée toutes les 4 s par
  // chaque visiteur du guichet (15 s depuis le lobby d'un jeu) : elle se lit
  // en cache (TTL 3 s, un seul chargement partagé), invalidé par les écritures
  // de salle — voir lobbies-cache.ts. L'authentification, elle, reste par appel.
  return NextResponse.json(await readLobbiesCached(loadLobbiesResponse))
}
