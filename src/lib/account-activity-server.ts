import { prisma } from '@/lib/prisma'
import { ANALYTICS_CONSENT_GRANTED } from '@/lib/auth-cookies'
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
import { PARIS_TIME_ZONE, parisDayOffset, parisDayStartUtc, parisDayString } from '@/lib/paris-time'

/**
 * ACTIVITÉ D'UN COMPTE — lecture seule, pour la fiche compte de la
 * Supervision (admin et plus : canViewSupervisionAnalytics, la garde du
 * journal des parties). Rien n'est écrit ici : tout se lit dans le journal
 * des parties (OnlineGameSessionPlayer ⨝ OnlineGameSession, index userId),
 * OnlineGameHistory, OnlineMatchResult, IpSeenLog, SitePresence et, pour les
 * comptes qui ont accepté les statistiques, AccountVisit.
 *
 * Deux temps, jamais confondus :
 * - DURÉE DE TABLE (journal, tous les comptes) : les participants sont figés
 *   au lancement (game-sessions.ts), un joueur parti après 5 min compte pour
 *   toute la partie. Jamais un « temps de jeu » personnel, et l'écran le dit.
 * - VISITES (AccountVisit, consentement '2' seulement) : temps visible, actif
 *   et en partie crédités battement par battement. Couverture partielle : un
 *   compte sans visite est « non suivi », jamais « 0 visite ».
 *
 * RGPD : aucun pseudo n'est lu ni renvoyé hors des participants du journal,
 * résolus à la lecture par listGameSessions. Les navigateurs sont servis sans
 * visitorId ni adresse IP ; les visites, sans IP, URL ni pseudo (il n'y en a
 * pas en base).
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

/** Dernières visites servies à la chronologie de la fiche. */
export const RECENT_VISITS = 20

/**
 * Visites brutes lues pour la chronologie : le double des lignes servies, pour
 * que la fusion des créations simultanées en laisse toujours assez.
 */
const RECENT_VISITS_READ = RECENT_VISITS * 2

/**
 * Plafond des visites lues sur la fenêtre. Quelques-unes par jour en pratique ;
 * la borne ne sert, là encore, qu'à garder la requête bornée.
 */
const MAX_WINDOW_VISITS = 1000

/**
 * Fin d'une visite = dernier battement + 60 s (une cadence), calculée à la
 * lecture : la table n'a ni endedAt ni clôture.
 */
export const VISIT_END_TAIL_MS = 60 * 1000

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

/** Visite telle que stockée (AccountVisit), avant fusion. */
export type StoredAccountVisit = {
  startedAt: Date
  lastBeatAt: Date
  visibleSeconds: number
  activeSeconds: number
  gameSeconds: number
  device: string | null
}

/**
 * Tranche horaire du DÉBUT d'une visite, heure de Paris : nuit 0-6 h, matin
 * 6-12 h, après-midi 12-18 h, soir 18-24 h. La chronologie n'affiche que le
 * jour, la durée et cette tranche ; l'heure exacte reste au détail déplié.
 */
export type VisitSlot = 'night' | 'morning' | 'afternoon' | 'evening'

/** Visite servie à la fiche (après fusion des créations simultanées). */
export type AccountVisitRow = {
  /** Jour de Paris du début (AAAA-MM-JJ) : une visite à cheval sur minuit reste à son jour de début. */
  day: string
  slot: VisitSlot
  startedAt: string
  /** Dernier battement + 60 s. */
  endedAt: string
  /** endedAt − startedAt : les pauses de moins de 30 min y sont, sans être créditées. */
  durationSeconds: number
  visibleSeconds: number
  activeSeconds: number
  gameSeconds: number
  /** DeviceKind du premier battement, ou null. */
  device: string | null
  /**
   * gameId des parties du journal où le compte a un siège, lancées pendant la
   * visite, dans l'ordre de lancement : une entrée par partie, revanches
   * comprises (le nombre de parties est la longueur ; la fiche dédoublonne
   * les noms).
   */
  games: string[]
}

/** Cumuls des visites commencées dans une fenêtre de jours de Paris. */
export type AccountVisitTotals = {
  visits: number
  visibleSeconds: number
  activeSeconds: number
  gameSeconds: number
  /** Durée médiane d'une visite de la fenêtre ; 0 sans visite. */
  medianVisitSeconds: number
}

/**
 * Couverture des visites : navigateurs dont le DERNIER compte vu est celui-ci
 * (SitePresence.userId), et parmi eux ceux écrits sous l'accord courant ('2').
 * Un appareil qui n'a jamais accepté les statistiques n'a pas de présence : il
 * n'est compté nulle part, d'où « sur M vus », jamais « sur M appareils ».
 */
export type AccountVisitsCoverage = {
  /** Navigateurs liés au compte, présence écrite sous l'accord courant. */
  trackedBrowsers: number
  /** Tous les navigateurs liés au compte, anciens accords '1' compris. */
  seenBrowsers: number
}

export type AccountVisitsSummary = {
  /** Au moins une visite enregistrée (et encore conservée) pour ce compte. */
  tracked: boolean
  /** Jour de Paris de la première visite conservée ; null si aucune. */
  since: string | null
  totals: { d7: AccountVisitTotals; d30: AccountVisitTotals }
  /**
   * Les 20 visites CONSERVÉES les plus récentes (jusqu'à 6 mois), la plus
   * récente d'abord : un compte absent depuis plus de 30 jours garde sa
   * chronologie, et son dernier jour de visite se lit en tête.
   */
  recent: AccountVisitRow[]
  coverage: AccountVisitsCoverage
}

/** Résumé 7 jours d'un compte pour la liste Comptes (admin et plus). */
export type AccountVisitsDigest = { visits: number; activeSeconds: number }

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
  /** Visites du compte (statistiques acceptées seulement). */
  visits: AccountVisitsSummary
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

// ─── Visites (AccountVisit) ──────────────────────────────────────────────────

function visitEndMs(visit: StoredAccountVisit): number {
  return visit.lastBeatAt.getTime() + VISIT_END_TAIL_MS
}

/**
 * Fusionne les visites qui se chevauchent. L'écriture ne pose aucun verrou :
 * deux battements simultanés qui ne trouvent pas de visite ouverte en créent
 * chacun une, au même instant. Deux visites légitimes, elles, ne se touchent
 * jamais (la suivante s'ouvre plus de 30 min après le dernier battement).
 *
 * Les crédits s'additionnent (le doublon n'en a d'ordinaire aucun : les
 * battements suivants vont à la visite la plus fraîche), mais restent bornés
 * par l'écart entre premier et dernier battement : si deux battements
 * concurrents ont crédité chacun sa copie, la même minute ne compte pas
 * double. Actif et en partie restent inclus dans le visible. L'appareil est
 * celui du premier battement. Fonction pure ; ordre de sortie chronologique.
 */
export function mergeOverlappingVisits(visits: StoredAccountVisit[]): StoredAccountVisit[] {
  const sorted = [...visits].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
  const merged: StoredAccountVisit[] = []

  for (const visit of sorted) {
    const current = merged[merged.length - 1]
    if (!current || visit.startedAt.getTime() > visitEndMs(current)) {
      merged.push({ ...visit })
      continue
    }
    const lastBeatAt = visit.lastBeatAt > current.lastBeatAt ? visit.lastBeatAt : current.lastBeatAt
    const spanSeconds = Math.max(
      0,
      Math.round((lastBeatAt.getTime() - current.startedAt.getTime()) / 1000)
    )
    const visibleSeconds = Math.min(current.visibleSeconds + visit.visibleSeconds, spanSeconds)
    merged[merged.length - 1] = {
      startedAt: current.startedAt,
      lastBeatAt,
      visibleSeconds,
      activeSeconds: Math.min(current.activeSeconds + visit.activeSeconds, visibleSeconds),
      gameSeconds: Math.min(current.gameSeconds + visit.gameSeconds, visibleSeconds),
      device: current.device ?? visit.device,
    }
  }

  return merged
}

const PARIS_HOUR_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
})

/**
 * Tranche horaire de Paris d'un instant. L'heure est lue par Intl dans le
 * fuseau de Paris, jamais par getHours() (fuseau du PROCESSUS, UTC en
 * production) : la tranche suit donc les changements d'heure. `% 24` : des
 * moteurs anciens écrivent « 24 » pour minuit malgré h23.
 */
export function parisVisitSlot(date: Date): VisitSlot {
  const hourPart = PARIS_HOUR_FORMAT.formatToParts(date).find((part) => part.type === 'hour')
  const hour = Number(hourPart?.value ?? 0) % 24
  if (hour < 6) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/**
 * Lignes de la chronologie : fusion des chevauchements, jour et tranche de
 * Paris, durée, et parties du journal lancées pendant la visite (bornes
 * comprises, fin = dernier battement + 60 s). Les visites fusionnées ne se
 * chevauchant plus, une partie n'est rattachée qu'à une visite au plus.
 * Fonction pure ; la visite la plus récente d'abord.
 */
export function buildAccountVisitRows(
  visits: StoredAccountVisit[],
  games: Array<Pick<AccountPlayedGame, 'gameId' | 'startedAt'>>
): AccountVisitRow[] {
  const launches = [...games].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

  return mergeOverlappingVisits(visits)
    .map((visit) => {
      const startMs = visit.startedAt.getTime()
      const endMs = visitEndMs(visit)
      return {
        day: parisDayString(visit.startedAt),
        slot: parisVisitSlot(visit.startedAt),
        startedAt: visit.startedAt.toISOString(),
        endedAt: new Date(endMs).toISOString(),
        durationSeconds: Math.max(0, Math.round((endMs - startMs) / 1000)),
        visibleSeconds: visit.visibleSeconds,
        activeSeconds: visit.activeSeconds,
        gameSeconds: visit.gameSeconds,
        device: visit.device,
        games: launches
          .filter((game) => {
            const launchedMs = game.startedAt.getTime()
            return launchedMs >= startMs && launchedMs <= endMs
          })
          .map((game) => game.gameId),
      }
    })
    .reverse()
}

/** Médiane arrondie à la seconde ; 0 pour une liste vide. */
function medianSeconds(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/**
 * Cumuls des visites commencées depuis le jour de Paris `fromDay` (AAAA-MM-JJ,
 * inclus), une visite comptant pour son jour de début.
 */
export function computeVisitTotals(rows: AccountVisitRow[], fromDay: string): AccountVisitTotals {
  const inWindow = rows.filter((row) => row.day >= fromDay)
  return {
    visits: inWindow.length,
    visibleSeconds: inWindow.reduce((sum, row) => sum + row.visibleSeconds, 0),
    activeSeconds: inWindow.reduce((sum, row) => sum + row.activeSeconds, 0),
    gameSeconds: inWindow.reduce((sum, row) => sum + row.gameSeconds, 0),
    medianVisitSeconds: medianSeconds(inWindow.map((row) => row.durationSeconds)),
  }
}

/**
 * Bloc « Visites » de la fiche. Pure (`now` injectable).
 * - `windowRows` : visites commencées dans les 30 derniers jours de Paris,
 *   pour les cumuls ;
 * - `recentRows` : dernières visites conservées, sans borne de date, pour la
 *   chronologie (bornées ici à 20) ;
 * - `firstVisitStartedAt` : début de la plus ancienne visite CONSERVÉE (toutes
 *   dates) — il distingue « non suivi » (aucune visite) de « pas revenu depuis
 *   30 jours ».
 */
export function summarizeAccountVisits(
  input: {
    windowRows: AccountVisitRow[]
    recentRows: AccountVisitRow[]
    firstVisitStartedAt: Date | null
    coverage: AccountVisitsCoverage
  },
  now: Date = new Date()
): AccountVisitsSummary {
  const { windowRows, recentRows, firstVisitStartedAt, coverage } = input
  return {
    tracked: firstVisitStartedAt !== null,
    since: firstVisitStartedAt ? parisDayString(firstVisitStartedAt) : null,
    totals: {
      d7: computeVisitTotals(windowRows, parisDayOffset(ACTIVITY_WINDOW_DAYS.d7 - 1, now)),
      d30: computeVisitTotals(windowRows, parisDayOffset(ACTIVITY_WINDOW_DAYS.d30 - 1, now)),
    },
    recent: recentRows.slice(0, RECENT_VISITS),
    coverage,
  }
}

/**
 * Couverture à partir d'un groupBy de SitePresence par consentVersion (lignes
 * liées au compte). Pure.
 */
export function summarizeVisitsCoverage(
  rows: Array<{ consentVersion: string | null; count: number }>
): AccountVisitsCoverage {
  return rows.reduce<AccountVisitsCoverage>(
    (coverage, row) => ({
      trackedBrowsers:
        coverage.trackedBrowsers + (row.consentVersion === ANALYTICS_CONSENT_GRANTED ? row.count : 0),
      seenBrowsers: coverage.seenBrowsers + row.count,
    }),
    { trackedBrowsers: 0, seenBrowsers: 0 }
  )
}

/** Borne basse d'une fenêtre de `days` jours de Paris : minuit du premier jour. */
function parisWindowStart(days: number, now: Date): Date {
  return parisDayStartUtc(parisDayOffset(days - 1, now))
}

/**
 * Parties du journal où le compte a un siège, lancées depuis `since`, réduites
 * à ce que lisent séances, totaux et visites.
 */
async function readAccountGames(userId: string, since: Date): Promise<AccountPlayedGame[]> {
  const seats = await prisma.onlineGameSessionPlayer.findMany({
    where: { userId, session: { startedAt: { gte: since } } },
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
  })

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
  return games
}

const STORED_VISIT_SELECT = {
  startedAt: true,
  lastBeatAt: true,
  visibleSeconds: true,
  activeSeconds: true,
  gameSeconds: true,
  device: true,
} as const

/** Visites brutes du compte commencées depuis `since`. Index (userId, …). */
function readStoredVisits(userId: string, since: Date): Promise<StoredAccountVisit[]> {
  return prisma.accountVisit.findMany({
    where: { userId, startedAt: { gte: since } },
    orderBy: { startedAt: 'desc' },
    take: MAX_WINDOW_VISITS,
    select: STORED_VISIT_SELECT,
  })
}

/**
 * Dernières visites brutes du compte, sans borne de date (la purge à 6 mois
 * borne la table) : la chronologie ne s'arrête pas à la fenêtre des cumuls.
 */
function readRecentStoredVisits(userId: string): Promise<StoredAccountVisit[]> {
  return prisma.accountVisit.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: RECENT_VISITS_READ,
    select: STORED_VISIT_SELECT,
  })
}

/**
 * Visites d'un compte commencées dans les `days` derniers jours de Paris
 * (aujourd'hui compris), fusionnées, avec les parties du journal lancées
 * pendant chacune. La plus récente d'abord.
 */
export async function listAccountVisits(
  userId: string,
  days: number = ACTIVITY_WINDOW_DAYS.d30,
  now: Date = new Date()
): Promise<AccountVisitRow[]> {
  const since = parisWindowStart(days, now)
  const [visits, games] = await Promise.all([
    readStoredVisits(userId, since),
    readAccountGames(userId, since),
  ])
  return buildAccountVisitRows(visits, games)
}

/**
 * Résumé 7 jours de Paris (nombre de visites, temps actif) des comptes d'une
 * page de la liste Comptes : UN groupBy sur leurs identifiants. Réservé aux
 * admins et plus — c'est à la route de ne pas l'appeler pour un modérateur.
 * Compte brut, sans fusion : un doublon de création simultanée (rare) y
 * compte pour une visite de plus, sans temps ; la fiche, elle, fusionne.
 * Un compte sans visite dans la fenêtre est absent de la table.
 */
export async function summarizeRecentVisitsByUser(
  userIds: string[],
  now: Date = new Date()
): Promise<Map<string, AccountVisitsDigest>> {
  if (userIds.length === 0) return new Map()
  const rows = await prisma.accountVisit.groupBy({
    by: ['userId'],
    where: {
      userId: { in: userIds },
      startedAt: { gte: parisWindowStart(ACTIVITY_WINDOW_DAYS.d7, now) },
    },
    _count: { _all: true },
    _sum: { activeSeconds: true },
  })
  return new Map(
    rows.map((row) => [
      row.userId,
      { visits: row._count._all, activeSeconds: row._sum.activeSeconds ?? 0 },
    ])
  )
}

/**
 * Activité d'un compte, ou null s'il n'existe pas (ou s'il est hors du
 * périmètre de la Supervision : ni email ni invité, comme la fiche).
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
  // Parties et visites partagent la fenêtre : une partie lancée pendant une
  // visite de la fenêtre est forcément lue.
  const windowStart = parisWindowStart(ACTIVITY_WINDOW_DAYS.d30, now)
  const subjectKey = subjectKeyFor(userId, '')

  const [
    recent,
    games,
    historyRows,
    resultRows,
    ipMap,
    presences,
    storedVisits,
    recentStoredVisits,
    firstVisit,
    presenceVersions,
  ] = await Promise.all([
    listGameSessions({ skip: 0, take: RECENT_GAMES, userId }),
    readAccountGames(userId, windowStart),
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
    readStoredVisits(userId, windowStart),
    readRecentStoredVisits(userId),
    // Plus ancienne visite conservée (toutes dates) : « suivi depuis le … ».
    prisma.accountVisit.findFirst({
      where: { userId },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    }),
    // Couverture : navigateurs liés au compte, par version du consentement.
    prisma.sitePresence.groupBy({
      by: ['consentVersion'],
      where: { userId },
      _count: { _all: true },
    }),
  ])

  const { seances, totals } = summarizeAccountPlay(games, now)

  // Chronologie : ses visites peuvent précéder la fenêtre de 30 jours. Le
  // journal n'est relu, depuis la plus ancienne d'entre elles, que dans ce cas.
  const oldestRecentMs = Math.min(...recentStoredVisits.map((visit) => visit.startedAt.getTime()))
  const recentGames =
    oldestRecentMs < windowStart.getTime() ? await readAccountGames(userId, new Date(oldestRecentMs)) : games

  const visits = summarizeAccountVisits(
    {
      windowRows: buildAccountVisitRows(storedVisits, games),
      recentRows: buildAccountVisitRows(recentStoredVisits, recentGames),
      firstVisitStartedAt: firstVisit?.startedAt ?? null,
      coverage: summarizeVisitsCoverage(
        presenceVersions.map((row) => ({ consentVersion: row.consentVersion, count: row._count._all }))
      ),
    },
    now
  )

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
    visits,
  }
}
