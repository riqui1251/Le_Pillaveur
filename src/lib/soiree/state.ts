import { isSoireeGame } from './catalog'
import type { SoireeLength, SoireeVibe } from './program'

export type SoireeTally = { drinks: number; wins: number; played: number }

export type SoireeRoundStatus = 'pending' | 'playing' | 'done' | 'skipped'

export type SoireeRound = {
  gameId: string
  status: SoireeRoundStatus
  /** Joueurs de la manche, fixés à son lancement. */
  playerIds: string[]
  results: Record<string, SoireeTally>
  /** Corrigée à la main à l'entracte (gorgées dites à voix haute, jeu sans compteur). */
  edited?: boolean
  startedAt?: number
  endedAt?: number
  /** « Ce jeu vous a plu ? » : le vote de la table à l'entracte (1..5), déjà envoyé. */
  vote?: number
}

/** 'programme' : on compose ; 'playing' : une manche est lancée ; 'entracte' : entre deux ; 'finished' : l'addition. */
export type SoireePhase = 'programme' | 'playing' | 'entracte' | 'finished'

export type Soiree = {
  version: 1
  id: string
  createdAt: number
  bandeId: string | null
  bandeName: string
  playerIds: string[]
  /** Prénoms au lancement : l'addition reste lisible si un joueur est renommé ou supprimé. */
  playerNames: Record<string, string>
  vibe: SoireeVibe
  soft: boolean
  /** 'carte' : programme composé à la main. */
  length: SoireeLength | 'carte'
  rounds: SoireeRound[]
  /** Index de la manche en cours ou de la prochaine. */
  current: number
  phase: SoireePhase
  finishedAt?: number
  /** « La soirée vous a plu ? » : le vote de la table sur l'addition (1..5), déjà envoyé. */
  vote?: number
}

/** Ce que l'ardoise classe : les gorgées avec alcool, les manches gagnées sans. */
export type SoireeMetric = 'drinks' | 'wins'

export const SOIREE_STATE_VERSION = 1

const EMPTY_TALLY: SoireeTally = { drinks: 0, wins: 0, played: 0 }

export function soireeMetric(soiree: Pick<Soiree, 'soft'>): SoireeMetric {
  return soiree.soft ? 'wins' : 'drinks'
}

export function newRound(gameId: string): SoireeRound {
  return { gameId, status: 'pending', playerIds: [], results: {} }
}

export function createSoiree(input: {
  id: string
  now: number
  bandeId: string | null
  bandeName: string
  players: readonly { id: string; name: string }[]
  vibe: SoireeVibe
  soft: boolean
  length: SoireeLength | 'carte'
  program: readonly string[]
}): Soiree {
  return {
    version: SOIREE_STATE_VERSION,
    id: input.id,
    createdAt: input.now,
    bandeId: input.bandeId,
    bandeName: input.bandeName,
    playerIds: input.players.map((p) => p.id),
    playerNames: Object.fromEntries(input.players.map((p) => [p.id, p.name])),
    vibe: input.vibe,
    soft: input.soft,
    length: input.length,
    rounds: input.program.map(newRound),
    current: 0,
    phase: 'programme',
  }
}

function tallyOf(round: SoireeRound, playerId: string): SoireeTally {
  return round.results[playerId] ?? EMPTY_TALLY
}

function replaceAt(soiree: Soiree, index: number, round: SoireeRound): SoireeRound[] {
  return soiree.rounds.map((r, i) => (i === index ? round : r))
}

/** Totaux de chacun sur les manches terminées. */
export function soireeTotals(soiree: Soiree): Record<string, SoireeTally> {
  const totals: Record<string, SoireeTally> = {}
  for (const id of soiree.playerIds) totals[id] = { ...EMPTY_TALLY }
  for (const round of soiree.rounds) {
    if (round.status !== 'done') continue
    for (const [id, tally] of Object.entries(round.results)) {
      const t = totals[id] ?? (totals[id] = { ...EMPTY_TALLY })
      t.drinks += tally.drinks
      t.wins += tally.wins
      t.played += tally.played
    }
  }
  return totals
}

export type SoireeStanding = SoireeTally & { playerId: string }

/** L'ardoise, du plus chargé au plus sobre (sans alcool : du plus de victoires au moins). */
export function soireeStandings(soiree: Soiree): SoireeStanding[] {
  const totals = soireeTotals(soiree)
  const metric = soireeMetric(soiree)
  const other: SoireeMetric = metric === 'drinks' ? 'wins' : 'drinks'
  return soiree.playerIds
    .map((playerId, order) => ({ playerId, order, ...(totals[playerId] ?? EMPTY_TALLY) }))
    .sort((a, b) => b[metric] - a[metric] || b[other] - a[other] || a.order - b.order)
    .map(({ order: _order, ...standing }) => {
      void _order
      return standing
    })
}

/** Lance (ou relance) la manche courante avec toute la bande : son ardoise repart de zéro. */
export function startRound(soiree: Soiree, now: number): Soiree {
  const round = soiree.rounds[soiree.current]
  if (!round) return soiree
  const started: SoireeRound = {
    ...round,
    status: 'playing',
    playerIds: soiree.playerIds.slice(),
    results: {},
    edited: false,
    startedAt: now,
  }
  return { ...soiree, rounds: replaceAt(soiree, soiree.current, started), phase: 'playing' }
}

/**
 * Ce qu'un jeu local remonte à updatePlayerStats, compté dans la manche en
 * cours s'il s'agit de son jeu et d'un de ses joueurs. Null sinon : la
 * soirée ne change pas.
 */
export function recordRoundStats(
  soiree: Soiree,
  gameId: string,
  playerId: string,
  stats: { gamesPlayed?: number; wins?: number; totalDrinks?: number }
): Soiree | null {
  if (soiree.phase !== 'playing') return null
  const round = soiree.rounds[soiree.current]
  if (!round || round.status !== 'playing' || round.gameId !== gameId) return null
  if (!round.playerIds.includes(playerId)) return null
  const before = tallyOf(round, playerId)
  const tally: SoireeTally = {
    drinks: before.drinks + Math.max(0, Math.round(stats.totalDrinks ?? 0)),
    wins: before.wins + Math.max(0, Math.round(stats.wins ?? 0)),
    played: before.played + Math.max(0, Math.round(stats.gamesPlayed ?? 0)),
  }
  const next: SoireeRound = { ...round, results: { ...round.results, [playerId]: tally } }
  return { ...soiree, rounds: replaceAt(soiree, soiree.current, next) }
}

/** La manche qui se joue en ce moment sur ce jeu, ou null (pas de soirée, entracte, autre jeu). */
export function playingRoundOf(soiree: Soiree | null, gameId: string): SoireeRound | null {
  if (!soiree || soiree.phase !== 'playing') return null
  const round = soiree.rounds[soiree.current]
  return round && round.gameId === gameId && round.status === 'playing' ? round : null
}

/** Chaque joueur de la manche a fini au moins une partie. */
export function isRoundComplete(round: SoireeRound): boolean {
  return round.playerIds.length > 0 && round.playerIds.every((id) => tallyOf(round, id).played > 0)
}

export function roundHasData(round: SoireeRound): boolean {
  return Object.values(round.results).some((t) => t.played > 0 || t.drinks > 0 || t.wins > 0)
}

/** Clôt la manche courante et ouvre l'entracte (même après la dernière : l'ardoise s'y corrige). */
export function closeRound(soiree: Soiree, now: number): Soiree {
  const round = soiree.rounds[soiree.current]
  if (!round) return soiree
  const done: SoireeRound = { ...round, status: 'done', endedAt: now }
  return { ...soiree, rounds: replaceAt(soiree, soiree.current, done), current: soiree.current + 1, phase: 'entracte' }
}

export function skipRound(soiree: Soiree): Soiree {
  const round = soiree.rounds[soiree.current]
  if (!round) return soiree
  const skipped: SoireeRound = { ...round, status: 'skipped', results: {} }
  return { ...soiree, rounds: replaceAt(soiree, soiree.current, skipped), current: soiree.current + 1, phase: 'entracte' }
}

/** Une manche lancée et laissée là compte si elle a remonté quelque chose. */
export function finishSoiree(soiree: Soiree, now: number): Soiree {
  const rounds = soiree.rounds.map((round): SoireeRound => {
    if (round.status !== 'playing') return round
    return roundHasData(round) ? { ...round, status: 'done', endedAt: now } : { ...round, status: 'skipped' }
  })
  return { ...soiree, rounds, phase: 'finished', finishedAt: now }
}

/** Correction à la main d'une manche terminée (gorgées en alcool, victoires sans). */
export function setRoundTally(
  soiree: Soiree,
  index: number,
  playerId: string,
  metric: SoireeMetric,
  value: number
): Soiree {
  const round = soiree.rounds[index]
  if (!round || round.status !== 'done' || !round.playerIds.includes(playerId)) return soiree
  const before = tallyOf(round, playerId)
  const tally: SoireeTally = { ...before, [metric]: Math.max(0, Math.min(99, Math.round(value))) }
  return { ...soiree, rounds: replaceAt(soiree, index, { ...round, results: { ...round.results, [playerId]: tally }, edited: true }) }
}

function voteValue(rating: number): number {
  return Math.max(1, Math.min(5, Math.round(rating)))
}

/** Retient le vote de la table sur une manche jouée : l'entracte ne le redemande pas. */
export function setRoundVote(soiree: Soiree, index: number, rating: number): Soiree {
  const round = soiree.rounds[index]
  if (!round || round.status !== 'done') return soiree
  return { ...soiree, rounds: replaceAt(soiree, index, { ...round, vote: voteValue(rating) }) }
}

/** Retient le vote de la table sur la soirée entière : l'addition ne le redemande pas. */
export function setSoireeVote(soiree: Soiree, rating: number): Soiree {
  return { ...soiree, vote: voteValue(rating) }
}

/** Remplace les manches pas encore jouées par `program` (programme modifié à l'entracte). */
export function replaceUpcoming(soiree: Soiree, program: readonly string[]): Soiree {
  return { ...soiree, rounds: [...soiree.rounds.slice(0, soiree.current), ...program.map(newRound)] }
}

export function upcomingProgram(soiree: Soiree): string[] {
  return soiree.rounds.slice(soiree.current).map((r) => r.gameId)
}

/**
 * Une soirée enregistrée avant qu'un jeu sorte du catalogue (Dégaine, le
 * 22/11/2026) : ses manches de ce jeu pas encore lancées tombent du
 * programme ; celles jouées restent sur l'ardoise.
 */
export function withoutRetiredGames(soiree: Soiree): Soiree {
  const rounds = soiree.rounds.filter(
    (round, index) => index < soiree.current || round.status !== 'pending' || isSoireeGame(round.gameId)
  )
  return rounds.length === soiree.rounds.length ? soiree : { ...soiree, rounds }
}
