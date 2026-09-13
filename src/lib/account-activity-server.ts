import { prisma } from '@/lib/prisma'
import { getIpsBySubjectKeys, isPresenceConnectedHere, subjectKeyFor, type IpEntry } from '@/lib/ip-history-server'
import { groupIpsByNetwork, type IpFamily } from '@/lib/ip-network'
import {
  durationReliabilityOf,
  GAME_JOURNAL_SINCE,
  listGameSessions,
  parseEndReason,
  type DurationReliability,
  type GameSessionRow,
} from '@/lib/online/game-sessions'
import { parisDayOffset, parisDayStartUtc, parisDayString } from '@/lib/paris-time'

/**
 * ACTIVITÉ EN LIGNE D'UN COMPTE — lecture seule, pour la fiche compte de la
 * Supervision (admin et plus : canViewSupervisionAnalytics, la garde du
 * journal des parties). Aucune donnée nouvelle : tout se lit dans le journal
 * des parties (OnlineGameSessionPlayer ⨝ OnlineGameSession, index userId),
 * OnlineGameHistory, OnlineMatchResult, IpSeenLog et SitePresence.
 *
 * Le temps calculé ici est une DURÉE DE TABLE : les participants sont figés au
 * lancement (game-sessions.ts), un joueur parti après 5 min compte pour toute
 * la partie. Jamais un « temps de jeu » personnel, et l'écran le dit.
 *
 * RGPD : aucun pseudo n'est lu ni renvoyé hors des participants du journal,
 * résolus à la lecture par listGameSessions. Les navigateurs sont servis sans
 * visitorId ni adresse IP.
 */

/** Écart maximal (fin d'une partie → début de la suivante) au sein d'une séance. */
export const SEANCE_GAP_MS = 30 * 60 * 1000

/** Fenêtres des tuiles, en jours de Paris (aujourd'hui compris). */
export const ACTIVITY_WINDOW_DAYS = { d7: 7, d30: 30 } as const

/** Dernières parties servies avec leurs participants (la fiche en affiche 5). */
const RECENT_GAMES = 20

/** Séances renvoyées, la plus récente d'abord. */
const MAX_SEANCES = 10

/**
 * Plafond des parties lues sur 30 jours pour les séances et les totaux. Des
 * dizaines en pratique ; la borne ne sert qu'à garder la requête bornée.
 */
const MAX_WINDOW_GAMES = 1000

/** Navigateurs servis (SitePresence liées au compte). */
const MAX_BROWSERS = 10

/** Partie du compte, réduite à ce que lisent les séances et les totaux. */
export type AccountPlayedGame = {
  id: string
  gameId: string
  startedAt: Date
  /** Null = partie encore en cours. */
  endedAt: Date | null
  humanCount: number
  reliability: DurationReliability
}

/** Séance de jeu en ligne : parties consécutives séparées de moins de 30 min. */
export type AccountSeance = {
  startedAt: string
  /** Null tant qu'une partie de la séance est encore en cours. */
  endedAt: string | null
  /** Début de la première partie → fin de la dernière ; null si en cours. */
  durationSeconds: number | null
  /** La pire fiabilité des parties de la séance. */
  reliability: DurationReliability
  /** Jeux distincts, dans l'ordre où ils ont été lancés. */
  gameIds: string[]
  count: number
}

export type AccountPlayTotals = {
  /** Parties lancées où figure le compte. */
  games: number
  /** Dont parties solo contre des bots (un seul humain à table). */
  solo: number
  /** Durée de table des parties terminées normalement (fin ou revanche). */
  reliableSeconds: number
  /** Durée de table des parties à la fin estimée ; les durées inconnues sont exclues. */
  estimatedSeconds: number
}

/** Réseau IP du compte (ipNetworkKey), avec le détail de ses adresses. */
export type AccountNetworkSummary = {
  key: string
  family: IpFamily
  /** Nombre d'adresses vues dans ce réseau. */
  count: number
  firstSeenAt: string
  lastSeenAt: string
  countries: string[]
  /** Adresses du réseau, la plus récemment vue d'abord (détail dépliable). */
  entries: IpEntry[]
}

/**
 * Navigateur dont le DERNIER compte vu est celui-ci (SitePresence.userId).
 * Ni visitorId ni IP : la fiche dit « vu avec ce compte », rien de plus.
 */
export type AccountBrowser = {
  lastSeen: string
  device: string | null
  country: string | null
  /** Le dernier ping de ce navigateur portait une session valide. */
  connectedHere: boolean
}

export type AccountActivity = {
  /** Premier jour du journal des parties : rien n'existe avant. */
  journalSince: string
  games: GameSessionRow[]
  seances: AccountSeance[]
  totals: { d7: AccountPlayTotals; d30: AccountPlayTotals }
  history: Array<{ gameId: string; playCount: number; lastPlayedAt: string }>
  results: Array<{ gameId: string; wins: number; losses: number }>
  /** Pour information : XP et série ne mesurent pas l'activité (instantanés). */
  progression: { onlineXp: number; streakCount: number; streakLastDay: string | null }
  networks: AccountNetworkSummary[]
  browsers: AccountBrowser[]
}

/** Du plus sûr au moins sûr : la séance prend le rang le plus haut de ses parties. */
const RELIABILITY_RANK: Record<DurationReliability, number> = {
  reliable: 0,
  estimated: 1,
  unknown: 2,
}

function worstReliability(a: DurationReliability, b: DurationReliability): DurationReliability {
  return RELIABILITY_RANK[b] > RELIABILITY_RANK[a] ? b : a
}

/**
 * Regroupe les parties d'un compte en séances. Deux parties consécutives (par
 * début) appartiennent à la même séance quand la seconde commence moins de
 * `gapMs` après la fin la plus tardive déjà vue — des tables qui se
 * chevauchent restent donc ensemble. Une partie sans fin connue (encore en
 * cours) compte pour son début dans ce calcul et rend la séance « en cours ».
 * Fonction pure ; séances renvoyées de la plus récente à la plus ancienne.
 */
export function groupSeances(
  games: AccountPlayedGame[],
  gapMs: number = SEANCE_GAP_MS
): AccountSeance[] {
  const sorted = [...games].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  const groups: Array<{
    startMs: number
    lastEndMs: number
    ongoing: boolean
    reliability: DurationReliability
    gameIds: string[]
    count: number
  }> = []

  for (const game of sorted) {
    const startMs = game.startedAt.getTime()
    const endMs = Math.max(startMs, game.endedAt?.getTime() ?? startMs)
    const current = groups[groups.length - 1]
    if (current && startMs - current.lastEndMs < gapMs) {
      current.lastEndMs = Math.max(current.lastEndMs, endMs)
      current.ongoing = current.ongoing || game.endedAt === null
      current.reliability = worstReliability(current.reliability, game.reliability)
      if (!current.gameIds.includes(game.gameId)) current.gameIds.push(game.gameId)
      current.count += 1
      continue
    }
    groups.push({
      startMs,
      lastEndMs: endMs,
      ongoing: game.endedAt === null,
      reliability: game.reliability,
      gameIds: [game.gameId],
      count: 1,
    })
  }

  return groups
    .map((g) => ({
      startedAt: new Date(g.startMs).toISOString(),
      endedAt: g.ongoing ? null : new Date(g.lastEndMs).toISOString(),
      durationSeconds: g.ongoing ? null : Math.round((g.lastEndMs - g.startMs) / 1000),
      reliability: g.reliability,
      gameIds: g.gameIds,
      count: g.count,
    }))
    .reverse()
}

/**
 * Totaux d'une fenêtre : parties lancées depuis le jour de Paris `fromDay`
 * (AAAA-MM-JJ, inclus), une partie comptant pour le jour de son lancement.
 * Les durées ne gardent que les parties terminées dont la fin est sûre ou
 * estimée, séparément ; une durée inconnue n'est jamais additionnée.
 */
export function computePlayTotals(games: AccountPlayedGame[], fromDay: string): AccountPlayTotals {
  const totals: AccountPlayTotals = { games: 0, solo: 0, reliableSeconds: 0, estimatedSeconds: 0 }
  for (const game of games) {
    if (parisDayString(game.startedAt) < fromDay) continue
    totals.games += 1
    if (game.humanCount <= 1) totals.solo += 1
    if (!game.endedAt) continue
    const seconds = Math.max(0, Math.round((game.endedAt.getTime() - game.startedAt.getTime()) / 1000))
    if (game.reliability === 'reliable') totals.reliableSeconds += seconds
    else if (game.reliability === 'estimated') totals.estimatedSeconds += seconds
  }
  return totals
}

/** Séances et tuiles 7 j / 30 j d'un compte. Pure (`now` injectable). */
export function summarizeAccountPlay(
  games: AccountPlayedGame[],
  now: Date = new Date()
): { seances: AccountSeance[]; totals: { d7: AccountPlayTotals; d30: AccountPlayTotals } } {
  return {
    seances: groupSeances(games).slice(0, MAX_SEANCES),
    totals: {
      d7: computePlayTotals(games, parisDayOffset(ACTIVITY_WINDOW_DAYS.d7 - 1, now)),
      d30: computePlayTotals(games, parisDayOffset(ACTIVITY_WINDOW_DAYS.d30 - 1, now)),
    },
  }
}

/**
 * Bilan victoires / défaites par jeu, à partir d'un groupBy (gameId, outcome).
 * Tout résultat autre que 'win' est une défaite (le modèle n'en connaît que
 * deux). Jeux triés par nombre de résultats décroissant.
 */
export function summarizeMatchResults(
  rows: Array<{ gameId: string; outcome: string; count: number }>
): Array<{ gameId: string; wins: number; losses: number }> {
  const byGame = new Map<string, { gameId: string; wins: number; losses: number }>()
  for (const row of rows) {
    const entry = byGame.get(row.gameId) ?? { gameId: row.gameId, wins: 0, losses: 0 }
    if (row.outcome === 'win') entry.wins += row.count
    else entry.losses += row.count
    byGame.set(row.gameId, entry)
  }
  return [...byGame.values()].sort(
    (a, b) => b.wins + b.losses - (a.wins + a.losses) || a.gameId.localeCompare(b.gameId)
  )
}

/**
 * Activité en ligne d'un compte, ou null s'il n'existe pas (ou s'il est hors
 * du périmètre de la Supervision : ni email ni invité, comme la fiche).
 * Requêtes bornées et indexées, lancées en parallèle.
 */
export async function getAccountActivity(
  userId: string,
  now: Date = new Date()
): Promise<AccountActivity | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, isGuest: true, onlineXp: true, streakCount: true, streakLastDay: true },
  })
  if (!user || (!user.email && !user.isGuest)) return null

  // Borne basse : minuit de Paris du premier jour de la fenêtre de 30 jours.
  const windowStart = parisDayStartUtc(parisDayOffset(ACTIVITY_WINDOW_DAYS.d30 - 1, now))
  const subjectKey = subjectKeyFor(userId, '')

  const [recent, seats, historyRows, resultRows, ipMap, presences] = await Promise.all([
    listGameSessions({ skip: 0, take: RECENT_GAMES, userId }),
    prisma.onlineGameSessionPlayer.findMany({
      where: { userId, session: { startedAt: { gte: windowStart } } },
      orderBy: { session: { startedAt: 'desc' } },
      take: MAX_WINDOW_GAMES,
      select: {
        session: {
          select: {
            id: true,
            gameId: true,
            startedAt: true,
            endedAt: true,
            endReason: true,
            humanCount: true,
          },
        },
      },
    }),
    prisma.onlineGameHistory.findMany({
      where: { userId },
      orderBy: { lastPlayedAt: 'desc' },
      select: { gameId: true, playCount: true, lastPlayedAt: true },
    }),
    prisma.onlineMatchResult.groupBy({
      by: ['gameId', 'outcome'],
      where: { userId },
      _count: { _all: true },
    }),
    getIpsBySubjectKeys([subjectKey]),
    prisma.sitePresence.findMany({
      where: { userId },
      orderBy: { lastSeen: 'desc' },
      take: MAX_BROWSERS,
      select: { userId: true, userSeenAt: true, lastSeen: true, lastDevice: true, country: true },
    }),
  ])

  // Un même compte n'occupe qu'un siège par partie ; on dédoublonne quand même
  // (humain rattaché deux fois par un moteur), sans quoi la durée compterait double.
  const seen = new Set<string>()
  const games: AccountPlayedGame[] = []
  for (const { session } of seats) {
    if (seen.has(session.id)) continue
    seen.add(session.id)
    games.push({
      id: session.id,
      gameId: session.gameId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      humanCount: session.humanCount,
      reliability: durationReliabilityOf(parseEndReason(session.endReason)),
    })
  }

  const { seances, totals } = summarizeAccountPlay(games, now)

  const networks = groupIpsByNetwork(ipMap.get(subjectKey) ?? []).map((group) => ({
    key: group.key,
    family: group.family,
    count: group.entries.length,
    firstSeenAt: group.firstSeenAt,
    lastSeenAt: group.lastSeenAt,
    countries: group.countries,
    entries: group.entries,
  }))

  return {
    journalSince: GAME_JOURNAL_SINCE,
    games: recent.sessions,
    seances,
    totals,
    history: historyRows.map((row) => ({
      gameId: row.gameId,
      playCount: row.playCount,
      lastPlayedAt: row.lastPlayedAt.toISOString(),
    })),
    results: summarizeMatchResults(
      resultRows.map((row) => ({ gameId: row.gameId, outcome: row.outcome, count: row._count._all }))
    ),
    progression: {
      onlineXp: user.onlineXp,
      streakCount: user.streakCount,
      streakLastDay: user.streakLastDay,
    },
    networks,
    browsers: presences.map((p) => ({
      lastSeen: p.lastSeen.toISOString(),
      device: p.lastDevice,
      country: p.country,
      connectedHere: isPresenceConnectedHere(p),
    })),
  }
}
