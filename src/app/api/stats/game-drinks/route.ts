import { NextResponse } from 'next/server'
import { withApiRoute } from '@/lib/api-route'
import { getGameById } from '@/lib/games'
import { isGameListed } from '@/lib/game-catalog'
import { getStaffHiddenGameIds } from '@/lib/game-catalog-server'
import { GAME_DRINK_RANKING_DAYS, GAME_DRINK_RANKING_MIN_PLAYS, gameDrinkRanking } from '@/lib/game-drinks-server'
import type { SiteDrinkRanking } from '@/lib/game-drinks'

export const dynamic = 'force-dynamic'

/**
 * « Quel jeu fait le plus boire ? » sur tout le site : PUBLIC, sans compte, et
 * rien que des compteurs anonymes par jeu (GameDrinkDaily). Les jeux cachés
 * par l'équipe disparaissent du classement comme du hub. Cache CDN de
 * quelques minutes : le classement bouge à l'échelle de la soirée, pas de la
 * seconde. Une base illisible lève → 500 server_error, la page l'affiche.
 */
export const GET = withApiRoute('stats/game-drinks GET', async () => {
  const [rows, hiddenIds] = await Promise.all([gameDrinkRanking(), getStaffHiddenGameIds()])
  const body: SiteDrinkRanking = {
    days: GAME_DRINK_RANKING_DAYS,
    minPlays: GAME_DRINK_RANKING_MIN_PLAYS,
    games: rows.filter((row) => {
      const game = getGameById(row.gameId)
      return game !== undefined && isGameListed(game, hiddenIds)
    }),
  }
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
  })
})
