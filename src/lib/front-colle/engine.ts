import { createRng, rngFromState, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'
import { FC_MODES, FC_THEMES, type FcMode, type FcTheme, type FcWord } from './data/types'

/**
 * Moteur pur de « Front Collé » (LOCAL : le téléphone passe de front en front).
 *
 * Le devineur colle le téléphone sur son front, la table lui fait deviner le
 * mot. Chaque joueur est devineur `rounds` fois. En équipes (A, B, A, B… dans
 * l'ordre de la table), les devineurs alternent A/B et les deux équipes ont
 * autant de tours : dans la plus petite, un joueur repasse.
 *
 * Le moteur ne compte que des ÉVÉNEMENTS neutres (mots trouvés, mots passés,
 * mots prononcés par un fautif) : gorgées et points se calculent à
 * l'affichage selon l'ambiance figée au lancement. Ni React, ni `window`, ni
 * horloge ni hasard implicites : la graine et `now` sont passés.
 */

export type { FcMode, FcTheme, FcWord } from './data/types'

export const FC_MIN_PLAYERS = 2

export const FC_TEAM_MODES = ['solo', 'teams'] as const
export type FcTeamMode = (typeof FC_TEAM_MODES)[number]

export const FC_DURATIONS = [45, 60, 90] as const
export type FcDuration = (typeof FC_DURATIONS)[number]

export const FC_ROUNDS = [1, 2] as const
export type FcRounds = (typeof FC_ROUNDS)[number]

/** 'mix' : la consigne suit le mot (décris, mime, fredonne) ; 'describe' : décris seulement. */
export const FC_INSTRUCTIONS = ['mix', 'describe'] as const
export type FcInstructions = (typeof FC_INSTRUCTIONS)[number]

export type FcSettings = {
  teamMode: FcTeamMode
  durationSec: FcDuration
  rounds: FcRounds
  instructions: FcInstructions
  /** Thèmes de la pioche, jamais vide : les neuf = « Tout mélanger ». */
  themes: FcTheme[]
}

export const FC_DEFAULT_SETTINGS: FcSettings = {
  teamMode: 'solo',
  durationSec: 60,
  rounds: 1,
  instructions: 'mix',
  themes: [...FC_THEMES],
}

/** Décompte 3-2-1 avant le premier mot : le temps de coller le téléphone sur son front. */
export const FC_COUNTDOWN_MS = 3_000

/** Poids de tirage de la consigne en mode Mélange, parmi celles que le mot autorise. */
export const FC_MODE_WEIGHTS: Readonly<Record<FcMode, number>> = { describe: 50, mime: 35, hum: 15 }

/** Mot prononcé en le décrivant : le fautif boit 2 (Sans alcool : −2 points). */
export const FC_SAID_COST = 2
/** Meilleur score de la partie : distribue 5 gorgées (Sans alcool : +5 points). */
export const FC_BEST_BONUS = 5

export type FcAmbiance = 'alcool' | 'soft'
export type FcRoundPhase = 'ready' | 'countdown' | 'playing' | 'recap' | 'finished'
export type FcResult = 'found' | 'passed'
export type FcTeamId = 'A' | 'B'

export type FcCurrent = { wordId: string; mode: FcMode }
export type FcLogEntry = { wordId: string; result: FcResult; mode: FcMode }
/** Cumul par joueur : `found`/`passed` comme devineur, `said` comme fautif. */
export type FcScore = { found: number; passed: number; said: number; turns: number }

export type FcState = {
  settings: FcSettings
  /** Table, dans l'ordre de la prop `players` (ordre du stockage). */
  playerIds: string[]
  /** Devineur de chaque tour, du premier au dernier : la partie finit après le dernier. */
  order: string[]
  turnIndex: number
  roundPhase: FcRoundPhase
  /** Échéance du décompte ou du chrono, sur l'horloge que le composant passe en `now`. */
  phaseEndsAt: number | null
  /** Mots déjà tirés : sans remise, la pioche ne se reforme qu'une fois épuisée. */
  deckUsed: string[]
  current: FcCurrent | null
  /** Mots du tour en cours (ou du tour qu'on récapitule). */
  turnLog: FcLogEntry[]
  /** Fautifs signalés au récapitulatif de ce tour, dans l'ordre (annulation du dernier). */
  turnSaid: string[]
  /** Cumul par joueur, crédité à la fin de chaque tour. */
  scores: Record<string, FcScore>
  rngState: RngState
}

const EMPTY_SCORE: FcScore = { found: 0, passed: 0, said: 0, turns: 0 }

function normalizeThemes(themes: readonly FcTheme[]): FcTheme[] {
  const picked = FC_THEMES.filter((theme) => themes.includes(theme))
  return picked.length > 0 ? picked : [...FC_THEMES]
}

/** Équipes en alternance dans l'ordre de la table : A, B, A, B… */
export function teamsOf(playerIds: readonly string[]): Record<FcTeamId, string[]> {
  return {
    A: playerIds.filter((_, index) => index % 2 === 0),
    B: playerIds.filter((_, index) => index % 2 === 1),
  }
}

export function teamOfPlayer(playerIds: readonly string[], playerId: string): FcTeamId | null {
  const index = playerIds.indexOf(playerId)
  if (index === -1) return null
  return index % 2 === 0 ? 'A' : 'B'
}

/** Tours de devineur de chaque équipe : autant pour les deux, réglés sur la plus grande. */
export function turnsPerTeam(playerIds: readonly string[], rounds: number): number {
  const { A, B } = teamsOf(playerIds)
  return Math.max(A.length, B.length) * Math.max(0, rounds)
}

/** Suite des devineurs : chacun `rounds` fois ; en équipes, A et B alternent à égalité de tours. */
export function guesserOrder(playerIds: readonly string[], teamMode: FcTeamMode, rounds: number): string[] {
  const order: string[] = []
  if (playerIds.length === 0 || rounds < 1) return order
  if (teamMode === 'solo') {
    for (let round = 0; round < rounds; round += 1) order.push(...playerIds)
    return order
  }
  const { A, B } = teamsOf(playerIds)
  const turns = turnsPerTeam(playerIds, rounds)
  for (let i = 0; i < turns; i += 1) {
    order.push(A[i % A.length])
    if (B.length > 0) order.push(B[i % B.length])
  }
  return order
}

/**
 * Joueurs qui devinent plus de `rounds` fois, dans l'ordre de la table. En
 * équipes inégales (nombre impair), la plus petite équipe joue autant de tours
 * que l'autre : un des siens repasse, et la pré-partie le dit.
 */
export function extraGuessers(
  playerIds: readonly string[],
  teamMode: FcTeamMode,
  rounds: number
): { playerId: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const id of guesserOrder(playerIds, teamMode, rounds)) counts.set(id, (counts.get(id) ?? 0) + 1)
  return playerIds.flatMap((playerId) => {
    const count = counts.get(playerId) ?? 0
    return count > rounds ? [{ playerId, count }] : []
  })
}

export function createGame(options: {
  settings: FcSettings
  playerIds: readonly string[]
  seed: string | number
  /** Mots de la partie précédente (« Rejouer ») : ils ne reviennent pas tout de suite. */
  deckUsed?: readonly string[]
}): FcState {
  const { playerIds, seed } = options
  const settings: FcSettings = { ...options.settings, themes: normalizeThemes(options.settings.themes) }
  const order = guesserOrder(playerIds, settings.teamMode, settings.rounds)
  return {
    settings,
    playerIds: [...playerIds],
    order,
    turnIndex: 0,
    roundPhase: order.length > 0 ? 'ready' : 'finished',
    phaseEndsAt: null,
    deckUsed: [...(options.deckUsed ?? [])],
    current: null,
    turnLog: [],
    turnSaid: [],
    scores: Object.fromEntries(playerIds.map((id) => [id, { ...EMPTY_SCORE }])),
    rngState: createRng(seed).getState(),
  }
}

/** Devineur du tour en cours (prêt, décompte, jeu ou récapitulatif) ; null une fois la partie finie. */
export function currentGuesserId(state: FcState): string | null {
  if (state.roundPhase === 'finished') return null
  return state.order[state.turnIndex] ?? null
}

/** Prochain devineur (« Au tour de … » au récapitulatif), null après le dernier tour. */
export function upcomingGuesserId(state: FcState): string | null {
  return state.order[state.turnIndex + 1] ?? null
}

/** Les mots des thèmes choisis. */
export function wordPool(words: readonly FcWord[], themes: readonly FcTheme[]): FcWord[] {
  return words.filter((word) => themes.includes(word.theme))
}

/** Consigne du mot : « Décris seulement » la force, sinon tirage pondéré parmi celles qu'il autorise. */
export function drawMode(word: FcWord, instructions: FcInstructions, rng: SeededRng): FcMode {
  if (instructions === 'describe') return 'describe'
  const allowed = FC_MODES.filter((mode) => word.modes.includes(mode))
  if (allowed.length === 0) return 'describe'
  if (allowed.length === 1) return allowed[0]
  return rng.weightedPick(allowed.map((mode) => ({ mode, weight: FC_MODE_WEIGHTS[mode] }))).mode
}

/**
 * Mot suivant, sans remise. Pioche épuisée : tout revient, sauf le mot qu'on
 * vient de voir (jamais deux fois de suite). Pioche vide : plus de mot courant.
 */
export function nextWord(state: FcState, words: readonly FcWord[]): FcState {
  if (state.roundPhase !== 'playing') return state
  const pool = wordPool(words, state.settings.themes)
  if (pool.length === 0) return { ...state, current: null }
  const rng = rngFromState(state.rngState)
  const previous = state.current?.wordId ?? null
  const used = new Set(state.deckUsed)
  let deckUsed = state.deckUsed
  let candidates = pool.filter((word) => !used.has(word.id) && word.id !== previous)
  if (candidates.length === 0) {
    deckUsed = []
    candidates = pool.filter((word) => word.id !== previous)
    if (candidates.length === 0) candidates = pool
  }
  const word = rng.pick(candidates)
  const mode = drawMode(word, state.settings.instructions, rng)
  return {
    ...state,
    current: { wordId: word.id, mode },
    deckUsed: [...deckUsed, word.id],
    rngState: rng.getState(),
  }
}

/** « Prêt » : le décompte démarre, le premier mot attend la fin du 3-2-1. */
export function startCountdown(state: FcState, now: number): FcState {
  if (state.roundPhase !== 'ready') return state
  return {
    ...state,
    roundPhase: 'countdown',
    phaseEndsAt: now + FC_COUNTDOWN_MS,
    current: null,
    turnLog: [],
    turnSaid: [],
  }
}

/** Fin du décompte : le chrono du tour part et le premier mot s'affiche. */
export function startPlaying(state: FcState, words: readonly FcWord[], now: number): FcState {
  if (state.roundPhase !== 'countdown') return state
  return nextWord(
    {
      ...state,
      roundPhase: 'playing',
      phaseEndsAt: now + state.settings.durationSec * 1000,
      current: null,
      turnLog: [],
    },
    words
  )
}

/**
 * « Arrêter ce tour ? » refusé : le chrono (ou le décompte) était gelé pendant
 * la question, on lui rend le temps passé dans la boîte.
 */
export function extendPhase(state: FcState, ms: number): FcState {
  if (state.roundPhase !== 'countdown' && state.roundPhase !== 'playing') return state
  if (state.phaseEndsAt === null || !(ms > 0)) return state
  return { ...state, phaseEndsAt: state.phaseEndsAt + ms }
}

/** Le décompte ou le chrono est écoulé à `now`. */
export function isPhaseOver(state: FcState, now: number): boolean {
  return (
    (state.roundPhase === 'countdown' || state.roundPhase === 'playing') &&
    state.phaseEndsAt !== null &&
    now >= state.phaseEndsAt
  )
}

function mark(state: FcState, words: readonly FcWord[], now: number, result: FcResult): FcState {
  if (state.roundPhase !== 'playing' || !state.current) return state
  // Geste arrivé après la sonnerie : le tour est déjà fini, il ne compte plus.
  if (state.phaseEndsAt !== null && now >= state.phaseEndsAt) return state
  const entry: FcLogEntry = { wordId: state.current.wordId, result, mode: state.current.mode }
  return nextWord({ ...state, turnLog: [...state.turnLog, entry] }, words)
}

/** Téléphone incliné vers le sol (ou toucher à droite) : trouvé, mot suivant. */
export function markFound(state: FcState, words: readonly FcWord[], now: number): FcState {
  return mark(state, words, now, 'found')
}

/** Téléphone incliné vers le plafond (ou toucher à gauche) : passé, mot suivant. */
export function markPassed(state: FcState, words: readonly FcWord[], now: number): FcState {
  return mark(state, words, now, 'passed')
}

export function summarizeLog(log: readonly FcLogEntry[]): { found: number; passed: number } {
  let found = 0
  let passed = 0
  for (const entry of log) {
    if (entry.result === 'found') found += 1
    else passed += 1
  }
  return { found, passed }
}

/**
 * Sonnerie : le tour est crédité au devineur. Le mot affiché à la sonnerie
 * n'est ni trouvé ni passé : il ne compte pas.
 */
export function endTurn(state: FcState): FcState {
  if (state.roundPhase !== 'playing') return state
  const guesserId = currentGuesserId(state)
  const scores = { ...state.scores }
  if (guesserId !== null) {
    const { found, passed } = summarizeLog(state.turnLog)
    const previous = scores[guesserId] ?? EMPTY_SCORE
    scores[guesserId] = {
      ...previous,
      found: previous.found + found,
      passed: previous.passed + passed,
      turns: previous.turns + 1,
    }
  }
  return { ...state, roundPhase: 'recap', phaseEndsAt: null, current: null, turnSaid: [], scores }
}

/** Tour interrompu (arrêté, onglet rechargé) : on le rejoue depuis « Prêt », rien n'est crédité. */
export function cancelTurn(state: FcState): FcState {
  if (state.roundPhase !== 'countdown' && state.roundPhase !== 'playing') return state
  return { ...state, roundPhase: 'ready', phaseEndsAt: null, current: null, turnLog: [], turnSaid: [] }
}

/**
 * Au récapitulatif : un joueur a prononcé le mot (ou sa racine) en le
 * décrivant. Le devineur n'est jamais fautif : dire le mot, c'est son but.
 */
export function flagSaid(state: FcState, playerId: string): FcState {
  if (state.roundPhase !== 'recap') return state
  if (!state.playerIds.includes(playerId) || playerId === currentGuesserId(state)) return state
  const previous = state.scores[playerId] ?? EMPTY_SCORE
  return {
    ...state,
    turnSaid: [...state.turnSaid, playerId],
    scores: { ...state.scores, [playerId]: { ...previous, said: previous.said + 1 } },
  }
}

/** Annule le dernier fautif signalé de ce tour. */
export function unflagSaid(state: FcState): FcState {
  if (state.roundPhase !== 'recap' || state.turnSaid.length === 0) return state
  const playerId = state.turnSaid[state.turnSaid.length - 1]
  const previous = state.scores[playerId] ?? EMPTY_SCORE
  return {
    ...state,
    turnSaid: state.turnSaid.slice(0, -1),
    scores: { ...state.scores, [playerId]: { ...previous, said: Math.max(0, previous.said - 1) } },
  }
}

/** Après le récapitulatif : au devineur suivant, ou fin de partie après le dernier tour. */
export function nextTurn(state: FcState): FcState {
  if (state.roundPhase !== 'recap') return state
  const turnIndex = state.turnIndex + 1
  if (turnIndex >= state.order.length) {
    return { ...state, turnIndex: state.order.length, roundPhase: 'finished', turnLog: [], turnSaid: [], current: null }
  }
  return { ...state, turnIndex, roundPhase: 'ready', turnLog: [], turnSaid: [], current: null }
}

export type FcTurnSummary = {
  guesserId: string | null
  found: number
  passed: number
  /** Fautifs du tour, dans l'ordre du premier signalement. */
  said: { playerId: string; count: number }[]
}

/** Bilan du tour récapitulé : mots du devineur et fautifs signalés. */
export function turnSummary(state: FcState): FcTurnSummary {
  const said: { playerId: string; count: number }[] = []
  for (const playerId of state.turnSaid) {
    const entry = said.find((item) => item.playerId === playerId)
    if (entry) entry.count += 1
    else said.push({ playerId, count: 1 })
  }
  return { guesserId: currentGuesserId(state), ...summarizeLog(state.turnLog), said }
}

// ─── Points, gorgées, classement ─────────────────────────────────────────────

type Tally = Pick<FcScore, 'found' | 'passed' | 'said'>

/**
 * Score d'un joueur ou d'une équipe. Alcool : les mots trouvés (les passés et
 * les mots prononcés se boivent) ; Sans alcool : +1 par mot trouvé, −1 par mot
 * passé, −2 par mot prononcé.
 */
export function scoreOf(tally: Tally, ambiance: FcAmbiance): number {
  if (ambiance === 'soft') return tally.found - tally.passed - FC_SAID_COST * tally.said
  return tally.found
}

/** Gorgées bues : 1 par mot passé comme devineur, 2 par mot prononcé comme fautif. */
export function drinksOf(tally: Pick<FcScore, 'passed' | 'said'>): number {
  return tally.passed + FC_SAID_COST * tally.said
}

export type FcRankEntry = {
  /** Identifiant du joueur, ou 'A' / 'B' en équipes. */
  id: string
  team: FcTeamId | null
  playerIds: string[]
  found: number
  passed: number
  said: number
  /** Score avant bonus (voir `scoreOf`). */
  score: number
  /** Meilleur score de la partie : distribue 5 (Sans alcool : +5 points). Personne si toute la table est à égalité. */
  best: boolean
  /** Score affiché : Sans alcool, le bonus du meilleur score compris. */
  total: number
  /** Gorgées bues (ambiance alcool). */
  drinks: number
  /** 1 = en tête ; les ex aequo partagent la place. */
  rank: number
}

export function ranking(state: FcState, ambiance: FcAmbiance): FcRankEntry[] {
  const groups: { id: string; team: FcTeamId | null; playerIds: string[] }[] =
    state.settings.teamMode === 'teams'
      ? (['A', 'B'] as const)
          .map((team) => ({ id: team, team, playerIds: teamsOf(state.playerIds)[team] }))
          .filter((group) => group.playerIds.length > 0)
      : state.playerIds.map((id) => ({ id, team: null, playerIds: [id] }))

  const tallied = groups.map((group, index) => {
    const tally: Tally = { found: 0, passed: 0, said: 0 }
    for (const id of group.playerIds) {
      const score = state.scores[id]
      if (!score) continue
      tally.found += score.found
      tally.passed += score.passed
      tally.said += score.said
    }
    return { ...group, ...tally, score: scoreOf(tally, ambiance), drinks: drinksOf(tally), index }
  })

  const top = tallied.reduce((max, entry) => Math.max(max, entry.score), Number.NEGATIVE_INFINITY)
  const allTied = tallied.every((entry) => entry.score === top)
  const scored = tallied.map((entry) => {
    const best = !allTied && entry.score === top
    return { ...entry, best, total: entry.score + (ambiance === 'soft' && best ? FC_BEST_BONUS : 0) }
  })
  scored.sort(
    (a, b) =>
      b.total - a.total || b.found - a.found || a.passed - b.passed || a.said - b.said || a.index - b.index
  )
  return scored.map(({ index: _index, ...entry }) => ({
    ...entry,
    rank: 1 + scored.filter((other) => other.total > entry.total).length,
  }))
}

/** Bilan par joueur pour les statistiques : victoire (joueur ou équipe en tête) et gorgées bues. */
export function playerResults(
  state: FcState,
  ambiance: FcAmbiance
): { playerId: string; won: boolean; drinks: number }[] {
  const winners = new Set(
    ranking(state, ambiance)
      .filter((entry) => entry.best)
      .flatMap((entry) => entry.playerIds)
  )
  return state.playerIds.map((playerId) => ({
    playerId,
    won: winners.has(playerId),
    drinks: ambiance === 'alcool' ? drinksOf(state.scores[playerId] ?? EMPTY_SCORE) : 0,
  }))
}

// ─── Reprise (useResumableLocalGame) ─────────────────────────────────────────

export const FC_SAVE_ID = 'front-colle'
/** À incrémenter dès que la forme de FcSave change : l'ancienne sauvegarde est jetée. */
export const FC_SAVE_VERSION = 1

export type FcSave = {
  settings: FcSettings
  playerIds: string[]
  order: string[]
  turnIndex: number
  /** Jamais un chrono en cours : un tour interrompu se rejoue depuis « Prêt ». */
  roundPhase: 'ready' | 'recap'
  deckUsed: string[]
  turnLog: FcLogEntry[]
  turnSaid: string[]
  scores: Record<string, FcScore>
  rngState: RngState
}

export function toFcSave(state: FcState): FcSave {
  const settled = cancelTurn(state)
  const recap = settled.roundPhase === 'recap'
  return {
    settings: settled.settings,
    playerIds: settled.playerIds,
    order: settled.order,
    turnIndex: settled.turnIndex,
    roundPhase: recap ? 'recap' : 'ready',
    deckUsed: settled.deckUsed,
    turnLog: recap ? settled.turnLog : [],
    turnSaid: recap ? settled.turnSaid : [],
    scores: settled.scores,
    rngState: settled.rngState,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

function includes<T>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value)
}

export function readFcSettings(value: unknown): FcSettings | null {
  if (!isRecord(value)) return null
  const { teamMode, durationSec, rounds, instructions, themes } = value
  if (!includes(FC_TEAM_MODES, teamMode)) return null
  if (!includes(FC_DURATIONS, durationSec)) return null
  if (!includes(FC_ROUNDS, rounds)) return null
  if (!includes(FC_INSTRUCTIONS, instructions)) return null
  if (!Array.isArray(themes) || themes.length === 0 || !themes.every((theme) => includes(FC_THEMES, theme))) {
    return null
  }
  return { teamMode, durationSec, rounds, instructions, themes: normalizeThemes(themes as FcTheme[]) }
}

/**
 * Sauvegarde → état pour la table ACTUELLE (mêmes joueurs, comparés comme
 * ensemble), avec les réglages de la SAUVEGARDE : après un rechargement, la
 * pré-partie est revenue aux valeurs par défaut. Null si illisible : partie
 * neuve plutôt qu'un écran planté. Mots absents de la banque chargée (autre
 * langue, contenu mis à jour) : la pioche les oublie, mais le journal du tour
 * récapitulé les garde, sinon son bilan contredirait les scores.
 */
export function restoreFcSave(save: unknown, playerIds: readonly string[], words: readonly FcWord[]): FcState | null {
  if (!isRecord(save)) return null
  const settings = readFcSettings(save.settings)
  if (!settings) return null

  const table = new Set(playerIds)
  const savedTable = save.playerIds
  if (!Array.isArray(savedTable) || savedTable.length !== table.size) return null
  if (new Set(savedTable).size !== savedTable.length || !savedTable.every((id) => typeof id === 'string' && table.has(id))) {
    return null
  }
  const tableOrder = savedTable as string[]

  const order = save.order
  if (!Array.isArray(order) || order.length === 0 || !order.every((id) => typeof id === 'string' && table.has(id))) {
    return null
  }
  const turnIndex = save.turnIndex
  if (!isCount(turnIndex) || turnIndex >= order.length) return null

  const roundPhase = save.roundPhase === 'recap' ? 'recap' : save.roundPhase === 'ready' ? 'ready' : null
  if (roundPhase === null) return null

  if (typeof save.rngState !== 'number' || !Number.isFinite(save.rngState)) return null

  const known = new Set(words.map((word) => word.id))
  const deckUsed = Array.isArray(save.deckUsed)
    ? save.deckUsed.filter((id): id is string => typeof id === 'string' && known.has(id))
    : []
  const turnLog = Array.isArray(save.turnLog)
    ? save.turnLog.flatMap((entry): FcLogEntry[] => {
        if (!isRecord(entry) || typeof entry.wordId !== 'string') return []
        if (entry.result !== 'found' && entry.result !== 'passed') return []
        const mode = includes(FC_MODES, entry.mode) ? entry.mode : 'describe'
        return [{ wordId: entry.wordId, result: entry.result, mode }]
      })
    : []
  const guesserId = (order as string[])[turnIndex]
  const turnSaid = Array.isArray(save.turnSaid)
    ? save.turnSaid.filter((id): id is string => typeof id === 'string' && table.has(id) && id !== guesserId)
    : []

  const savedScores = isRecord(save.scores) ? save.scores : {}
  const scores: Record<string, FcScore> = {}
  for (const id of tableOrder) {
    const score = savedScores[id]
    scores[id] =
      isRecord(score) && isCount(score.found) && isCount(score.passed) && isCount(score.said) && isCount(score.turns)
        ? { found: score.found, passed: score.passed, said: score.said, turns: score.turns }
        : { ...EMPTY_SCORE }
  }

  return {
    settings,
    playerIds: [...tableOrder],
    order: [...(order as string[])],
    turnIndex,
    roundPhase,
    phaseEndsAt: null,
    deckUsed,
    current: null,
    turnLog: roundPhase === 'recap' ? turnLog : [],
    turnSaid: roundPhase === 'recap' ? turnSaid : [],
    scores,
    rngState: save.rngState >>> 0,
  }
}
