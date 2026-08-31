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

/**
 * Période du classement : 'all' = depuis toujours (historique), 'week' =
 * semaine en cours (lundi 00:00 heure de Paris → maintenant). Le hebdo
 * remet les compteurs à zéro chaque lundi — un nouveau joueur peut donc
 * apparaître dans le top sans rattraper des mois d'ancienneté.
 */
export type RankingPeriod = 'all' | 'week'

export function isRankingPeriod(value: string | null): value is RankingPeriod {
  return value === 'all' || value === 'week'
}

/** Décalage (ms) entre l'heure de Paris et l'UTC à l'instant donné (+1h ou +2h). */
function parisOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // « L'heure de Paris relue comme si c'était de l'UTC » moins l'instant réel
  // (tronqué à la seconde, formatToParts ne rend pas les millisecondes).
  const asUtc = Date.UTC(num('year'), num('month') - 1, num('day'), num('hour'), num('minute'), num('second'))
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/**
 * Instant UTC du lundi 00:00 heure de Paris de la semaine en cours.
 * Méthode 100 % JS (aucune lib de fuseau) :
 * 1. on lit la date calendaire « vue de Paris » de l'instant courant via
 *    `Intl.DateTimeFormat` (année/mois/jour + jour de semaine) ;
 * 2. on recule jusqu'au lundi via l'arithmétique de `Date.UTC` (qui absorbe
 *    proprement les bords de mois/année) ;
 * 3. minuit UTC de cette date n'est PAS minuit Paris : on soustrait l'offset
 *    Paris observé à cet instant, itéré 2 fois pour converger si un
 *    changement d'heure (été/hiver) tombe justement cette nuit-là.
 */
export function startOfCurrentParisWeek(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const daysSinceMonday: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  const back = daysSinceMonday[get('weekday')] ?? 0
  const monday = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) - back))
  const y = monday.getUTCFullYear()
  const m = monday.getUTCMonth()
  const d = monday.getUTCDate()
  let ts = Date.UTC(y, m, d) // candidat : minuit UTC du lundi
  for (let i = 0; i < 2; i++) {
    ts = Date.UTC(y, m, d) - parisOffsetMs(new Date(ts))
  }
  return new Date(ts)
}

/** Clause `where` Prisma correspondant à la période demandée. */
function periodWhere(period: RankingPeriod): { finishedAt?: { gte: Date } } {
  return period === 'week' ? { finishedAt: { gte: startOfCurrentParisWeek() } } : {}
}

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
  args: { gameId: string | null; viewerId: string | null; period?: RankingPeriod }
): Promise<{ rows: RankingRow[]; me: RankingRow | null; totalPlayers: number }> {
  const where = {
    ...(args.gameId ? { gameId: args.gameId } : {}),
    ...periodWhere(args.period ?? 'all'),
  }
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
  viewerId: string | null,
  period: RankingPeriod = 'all'
): Promise<{ general: RankingBoard; perGame: RankingBoard[] }> {
  const grouped = await client.onlineMatchResult.groupBy({
    by: ['gameId', 'userId', 'outcome'],
    where: periodWhere(period),
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
