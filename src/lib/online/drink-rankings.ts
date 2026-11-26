import type { PrismaClient } from '@prisma/client'
import { isGameListed } from '@/lib/game-catalog'
import { GAMES } from '@/lib/games'
import { parseOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'

/**
 * Classement des COMPTES par gorgées bues en ligne, jeu par jeu, agrégé à la
 * lecture depuis `OnlineDrinkResult` (une ligne par compte humain et par
 * partie terminée). Même principe que les podiums de rankings.ts : un top
 * par jeu, plus la ligne du demandeur avec sa vraie position.
 *
 * Aucun registre des jeux (GAME_ADAPTERS) ici : un jeu apparaît dès qu'il a
 * des lignes, tant qu'il existe encore et reste listé.
 */

export const DRINK_RANKING_TOP = 5

export type DrinkRankingRow = {
  userId: string
  /** null = pseudo masqué (visiteur sans session). */
  displayName: string | null
  /** Partiel : vide dans la variante anonyme, pour ne pas désigner un compte par son icône. */
  preferences: Partial<OnlinePreferences>
  drinks: number
  games: number
  /** Position dans le classement complet du jeu (1-based). */
  position: number
}

export type DrinkRankingBoard = {
  gameId: string
  rows: DrinkRankingRow[]
  /** Ma ligne (avec position réelle) si je suis classé — même dans le top. */
  me: DrinkRankingRow | null
  totalPlayers: number
}

export type DrinkRankingsResponse = {
  boards: DrinkRankingBoard[]
  signedIn: boolean
  top: number
}

type Tally = { userId: string; drinks: number; games: number }

/** Gorgées décroissantes, puis parties croissantes, puis id : deux appels rendent le même ordre. */
function compareTallies(a: Tally, b: Tally): number {
  if (b.drinks !== a.drinks) return b.drinks - a.drinks
  if (a.games !== b.games) return a.games - b.games
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
}

/**
 * Un tableau par jeu listé ayant au moins une ligne, dans l'ordre du
 * catalogue : top `DRINK_RANKING_TOP` + la ligne du demandeur. Une seule
 * agrégation, une seule lecture des comptes.
 */
export async function buildDrinkRankingsOverview(
  client: PrismaClient,
  viewerId: string | null,
  hiddenIds: readonly string[]
): Promise<DrinkRankingBoard[]> {
  const grouped = await client.onlineDrinkResult.groupBy({
    by: ['gameId', 'userId'],
    _sum: { drinks: true },
    _count: { _all: true },
  })

  const byGame = new Map<string, Tally[]>()
  for (const g of grouped) {
    const tallies = byGame.get(g.gameId) ?? []
    tallies.push({ userId: g.userId, drinks: g._sum.drinks ?? 0, games: g._count._all })
    byGame.set(g.gameId, tallies)
  }

  const sortedBoards: Array<{ gameId: string; sorted: Tally[] }> = []
  for (const game of GAMES) {
    const tallies = byGame.get(game.id)
    if (!tallies || !isGameListed(game, hiddenIds)) continue
    sortedBoards.push({ gameId: game.id, sorted: [...tallies].sort(compareTallies) })
  }
  if (sortedBoards.length === 0) return []

  const wantedIds = new Set<string>()
  for (const b of sortedBoards) {
    for (const e of b.sorted.slice(0, DRINK_RANKING_TOP)) wantedIds.add(e.userId)
    if (viewerId && b.sorted.some((e) => e.userId === viewerId)) wantedIds.add(viewerId)
  }

  const users = await client.user.findMany({
    where: { id: { in: [...wantedIds] } },
    select: {
      id: true,
      displayName: true,
      onlineDisplayName: true,
      onlinePreferencesJson: true,
    },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  const toRow = (entry: Tally, position: number): DrinkRankingRow => {
    const u = userById.get(entry.userId)
    return {
      userId: entry.userId,
      displayName: u?.onlineDisplayName ?? u?.displayName ?? '—',
      preferences: parseOnlinePreferences(u?.onlinePreferencesJson),
      drinks: entry.drinks,
      games: entry.games,
      position,
    }
  }

  return sortedBoards.map(({ gameId, sorted }) => {
    const meIdx = viewerId ? sorted.findIndex((e) => e.userId === viewerId) : -1
    return {
      gameId,
      rows: sorted.slice(0, DRINK_RANKING_TOP).map((e, i) => toRow(e, i + 1)),
      me: meIdx >= 0 ? toRow(sorted[meIdx], meIdx + 1) : null,
      totalPlayers: sorted.length,
    }
  })
}

/**
 * Variante des visiteurs : rangs et chiffres seulement. Un pseudo en ligne
 * n'est visible que des autres joueurs connectés (politique de
 * confidentialité, § compte) ; ni l'id, ni le pseudo, ni l'icône ne sortent.
 */
export function anonymizeDrinkBoards(boards: readonly DrinkRankingBoard[]): DrinkRankingBoard[] {
  return boards.map((board) => ({
    gameId: board.gameId,
    totalPlayers: board.totalPlayers,
    me: null,
    rows: board.rows.map((row) => ({
      // Une clé de rendu, pas un compte.
      userId: `${board.gameId}#${row.position}`,
      displayName: null,
      preferences: {},
      drinks: row.drinks,
      games: row.games,
      position: row.position,
    })),
  }))
}
