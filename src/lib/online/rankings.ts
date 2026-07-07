import type { PrismaClient } from '@prisma/client'
import { parseOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'
import { GAME_ADAPTERS } from '@/lib/online/game-adapters'

/**
 * Classement des jeux EN LIGNE — agrégé à la lecture depuis l'historique
 * `OnlineMatchResult` (victoires / défaites / parties / % ; jamais les
 * gorgées). Tri : victoires, puis % de victoires, puis nombre de parties.
 * Le % n'est CLASSANT qu'à titre de départage — l'UI le grise sous
 * `RANKING_MIN_GAMES` parties pour éviter les 100 % en 1 partie.
 */

export const RANKING_MIN_GAMES = 5
export const RANKING_TOP_LIMIT = 50
/** Taille des podiums de la page classement (général + par jeu). */
export const RANKING_OVERVIEW_TOP = 5

export type RankingRow = {
  userId: string
  displayName: string
  preferences: OnlinePreferences
  wins: number
  losses: number
  games: number
  /** 0-100, arrondi. */
  winRate: number
  /** Position dans le classement complet (1-based). */
  position: number
}

export type GameStatLine = {
  gameId: string
  wins: number
  losses: number
  games: number
  winRate: number
}

export function isRankableGameId(gameId: string): boolean {
  return gameId in GAME_ADAPTERS
}

type Tally = { wins: number; losses: number }

function toSorted(tallies: Map<string, Tally>): Array<{ userId: string } & Tally> {
  return [...tallies.entries()]
    .map(([userId, t]) => ({ userId, ...t }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      const rateA = a.wins / Math.max(1, a.wins + a.losses)
      const rateB = b.wins / Math.max(1, b.wins + b.losses)
      if (rateB !== rateA) return rateB - rateA
      return b.wins + b.losses - (a.wins + a.losses)
    })
}

/** Classement complet d'un jeu (ou de tous), top N + la ligne du demandeur. */
export async function buildRankings(
  client: PrismaClient,
  args: { gameId: string | null; viewerId: string | null }
): Promise<{ rows: RankingRow[]; me: RankingRow | null; totalPlayers: number }> {
  const where = args.gameId ? { gameId: args.gameId } : {}
  const grouped = await client.onlineMatchResult.groupBy({
    by: ['userId', 'outcome'],
    where,
    _count: { _all: true },
  })

  const tallies = new Map<string, Tally>()
  for (const g of grouped) {
    const t = tallies.get(g.userId) ?? { wins: 0, losses: 0 }
    if (g.outcome === 'win') t.wins += g._count._all
    else t.losses += g._count._all
    tallies.set(g.userId, t)
  }

  const sorted = toSorted(tallies)
  const topIds = sorted.slice(0, RANKING_TOP_LIMIT).map((r) => r.userId)
  const meIdx = args.viewerId ? sorted.findIndex((r) => r.userId === args.viewerId) : -1
  const wantedIds = new Set(topIds)
  if (meIdx >= 0) wantedIds.add(args.viewerId!)

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

  const toRow = (entry: { userId: string } & Tally, position: number): RankingRow => {
    const u = userById.get(entry.userId)
    const games = entry.wins + entry.losses
    return {
      userId: entry.userId,
      displayName: u?.onlineDisplayName ?? u?.displayName ?? '—',
      preferences: parseOnlinePreferences(u?.onlinePreferencesJson),
      wins: entry.wins,
      losses: entry.losses,
      games,
      winRate: games > 0 ? Math.round((entry.wins / games) * 100) : 0,
      position,
    }
  }

  return {
    rows: sorted.slice(0, RANKING_TOP_LIMIT).map((entry, i) => toRow(entry, i + 1)),
    me: meIdx >= 0 ? toRow(sorted[meIdx], meIdx + 1) : null,
    totalPlayers: sorted.length,
  }
}

export type RankingBoard = {
  /** null = classement général (tous jeux confondus). */
  gameId: string | null
  rows: RankingRow[]
  /** Ma ligne (avec position réelle) si je suis classé — même hors du top. */
  me: RankingRow | null
  totalPlayers: number
}

/**
 * Vue d'ensemble de la page classement : le général + un podium par jeu,
 * chacun limité à `RANKING_OVERVIEW_TOP`, en UNE requête d'agrégation.
 * Un joueur hors podium reçoit quand même sa ligne avec sa position.
 */
export async function buildRankingsOverview(
  client: PrismaClient,
  viewerId: string | null
): Promise<{ general: RankingBoard; perGame: RankingBoard[] }> {
  const grouped = await client.onlineMatchResult.groupBy({
    by: ['gameId', 'userId', 'outcome'],
    _count: { _all: true },
  })

  const generalTallies = new Map<string, Tally>()
  const byGame = new Map<string, Map<string, Tally>>()
  for (const g of grouped) {
    const general = generalTallies.get(g.userId) ?? { wins: 0, losses: 0 }
    const gameMap = byGame.get(g.gameId) ?? new Map<string, Tally>()
    const game = gameMap.get(g.userId) ?? { wins: 0, losses: 0 }
    if (g.outcome === 'win') {
      general.wins += g._count._all
      game.wins += g._count._all
    } else {
      general.losses += g._count._all
      game.losses += g._count._all
    }
    generalTallies.set(g.userId, general)
    gameMap.set(g.userId, game)
    byGame.set(g.gameId, gameMap)
  }

  // Ids nécessaires : les tops de chaque tableau + le demandeur.
  const boardsSorted: Array<{ gameId: string | null; sorted: Array<{ userId: string } & Tally> }> =
    [
      { gameId: null, sorted: toSorted(generalTallies) },
      ...[...byGame.entries()].map(([gameId, tallies]) => ({
        gameId,
        sorted: toSorted(tallies),
      })),
    ]
  const wantedIds = new Set<string>()
  for (const b of boardsSorted) {
    for (const e of b.sorted.slice(0, RANKING_OVERVIEW_TOP)) wantedIds.add(e.userId)
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

  const toRow = (entry: { userId: string } & Tally, position: number): RankingRow => {
    const u = userById.get(entry.userId)
    const games = entry.wins + entry.losses
    return {
      userId: entry.userId,
      displayName: u?.onlineDisplayName ?? u?.displayName ?? '—',
      preferences: parseOnlinePreferences(u?.onlinePreferencesJson),
      wins: entry.wins,
      losses: entry.losses,
      games,
      winRate: games > 0 ? Math.round((entry.wins / games) * 100) : 0,
      position,
    }
  }

  const toBoard = (b: { gameId: string | null; sorted: Array<{ userId: string } & Tally> }): RankingBoard => {
    const meIdx = viewerId ? b.sorted.findIndex((e) => e.userId === viewerId) : -1
    return {
      gameId: b.gameId,
      rows: b.sorted.slice(0, RANKING_OVERVIEW_TOP).map((e, i) => toRow(e, i + 1)),
      me: meIdx >= 0 ? toRow(b.sorted[meIdx], meIdx + 1) : null,
      totalPlayers: b.sorted.length,
    }
  }

  const [general, ...perGame] = boardsSorted.map(toBoard)
  return { general, perGame }
}

/** Stats personnelles par jeu (page compte). */
export async function buildMyGameStats(
  client: PrismaClient,
  userId: string
): Promise<GameStatLine[]> {
  const grouped = await client.onlineMatchResult.groupBy({
    by: ['gameId', 'outcome'],
    where: { userId },
    _count: { _all: true },
  })
  const byGame = new Map<string, Tally>()
  for (const g of grouped) {
    const t = byGame.get(g.gameId) ?? { wins: 0, losses: 0 }
    if (g.outcome === 'win') t.wins += g._count._all
    else t.losses += g._count._all
    byGame.set(g.gameId, t)
  }
  return [...byGame.entries()]
    .map(([gameId, t]) => {
      const games = t.wins + t.losses
      return {
        gameId,
        wins: t.wins,
        losses: t.losses,
        games,
        winRate: games > 0 ? Math.round((t.wins / games) * 100) : 0,
      }
    })
    .sort((a, b) => b.games - a.games)
}
