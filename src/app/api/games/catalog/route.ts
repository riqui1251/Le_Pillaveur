import { NextResponse } from 'next/server'
import { withApiRoute } from '@/lib/api-route'
import { EMPTY_GAME_CATALOG, type GameCatalogState } from '@/lib/game-catalog'
import { getGameCatalogState } from '@/lib/game-catalog-server'

export const dynamic = 'force-dynamic'

/**
 * Catalogue réglé par l'équipe : jeux cachés + jeux mis en avant (les plus
 * joués sur 30 jours). PUBLIC et sans donnée personnelle — le hub, le Mode
 * Soirée et le lobby le lisent, connectés ou non. Cache navigateur court : un
 * jeu caché doit disparaître vite, mais pas à chaque affichage de page.
 * Jamais d'erreur 500 : une lecture impossible rend l'état vide.
 */
export const GET = withApiRoute('games/catalog GET', async () => {
  let state: GameCatalogState = EMPTY_GAME_CATALOG
  try {
    state = await getGameCatalogState()
  } catch {
    // getGameCatalogState ne lève pas ; filet si un mock ou un futur changement le fait.
  }
  return NextResponse.json(state, {
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' },
  })
})
