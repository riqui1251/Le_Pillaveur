/**
 * Moteur pur de « Dégaine ! » (LOCAL : un téléphone posé à plat entre deux duellistes).
 *
 * - Tournoi : toute la table, tableau à élimination tiré au sort. Quand le nombre de joueurs
 *   n'est pas une puissance de 2, des exempts tirés au sort passent directement au tour suivant.
 * - Duel libre : la table choisit les deux duellistes, revanches à volonté.
 * - Une manche : les deux duellistes touchent « Prêt », puis « Attention… », attente de 2 à 8 s
 *   (0 à 2 leurres de 700 ms si activés), puis « FEU ! ». Le premier qui touche SA moitié gagne.
 *   Toucher avant le signal (pendant l'attente ou sur un leurre) : faux départ, manche perdue ;
 *   les deux à moins de 150 ms d'écart : double faux départ, chacun paie et la manche se rejoue.
 * - Au meilleur des 3 : deux manches gagnées remportent le duel.
 * - Barème (événements neutres, chiffrés à l'affichage) : chaque faux départ coûte (3), le duel
 *   perdu coûte (2, ou 3 en finale) quand il se décide ; perdu sur un faux départ, seul le faux
 *   départ compte — en une manche, « Faux départ · boit 3 » et non 3 + 2.
 *
 * Horloge : celle de `performance.now()`, côté composant (`e.timeStamp` des touchers, horodatage
 * du requestAnimationFrame qui peint le signal). Le moteur ne lit aucune horloge : chaque instant
 * est un paramètre. Aléatoire : `@/lib/petit-buveur/rng`, son état vit dans `rngState`.
 * Le moteur compte des ÉVÉNEMENTS neutres (duels perdus, faux départs…) : gorgées et points se
 * calculent à l'affichage selon l'ambiance figée au lancement.
 */

import { createRng, rngFromState, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'

export type DegaineFormat = 'tournament' | 'free'
export type DegaineRoundsPerDuel = 1 | 3

export const DEGAINE_FORMATS: readonly DegaineFormat[] = ['tournament', 'free']
export const DEGAINE_ROUND_OPTIONS: readonly DegaineRoundsPerDuel[] = [1, 3]

export type DegaineSettings = {
  format: DegaineFormat
  decoys: boolean
  roundsPerDuel: DegaineRoundsPerDuel
}

export const DEGAINE_DEFAULT_SETTINGS: DegaineSettings = { format: 'tournament', decoys: true, roundsPerDuel: 1 }

/** Attente tirée au sort entre « Attention… » et « FEU ! ». */
export const DEGAINE_MIN_DELAY_MS = 2_000
export const DEGAINE_MAX_DELAY_MS = 8_000
/** Durée d'affichage d'un leurre. */
export const DEGAINE_DECOY_MS = 700
export const DEGAINE_MAX_DECOYS = 2
/** « Attention… » doit d'abord se lire : aucun leurre dans les premiers instants de l'attente. */
export const DEGAINE_DECOY_LEAD_MS = 800
/** Écart minimal entre la fin d'un leurre et le signal suivant (leurre ou « FEU ! »). */
export const DEGAINE_DECOY_GAP_MS = 500
/** Identifiants neutres des leurres : chaque langue a ses propres mots (games.degaine.decoys.*). */
export const DEGAINE_DECOY_IDS = ['decoy1', 'decoy2', 'decoy3', 'decoy4', 'decoy5', 'decoy6'] as const
export type DegaineDecoyId = (typeof DEGAINE_DECOY_IDS)[number]

/** Le doigt qui rebondit sur « Prêt » au lancement de l'attente ne vaut pas faux départ. */
export const DEGAINE_ARM_GRACE_MS = 500
/** Sous 100 ms après l'affichage, personne n'a pu voir le signal : anticipation, donc faux départ. */
export const DEGAINE_ANTICIPATION_MS = 100
/**
 * Un toucher non valide qui suit de moins de 150 ms le faux départ adverse ne répond pas au verdict
 * affiché (une image, puis 100 ms de réflexe au mieux) : double faux départ. Plus tard, il peut y
 * répondre : il ne compte pas.
 */
export const DEGAINE_DOUBLE_FALSE_START_MS = 150
/** Après le tir gagnant, le perdant a 1,5 s pour que son propre temps s'affiche. */
export const DEGAINE_LOSER_WINDOW_MS = 1_500
/** Personne n'a tiré 5 s après « FEU ! » : la manche se rejoue. */
export const DEGAINE_NO_SHOT_MS = 5_000

/** Barème, appliqué à l'affichage selon l'ambiance. */
export const DEGAINE_DRINKS = { lost: 2, finalLost: 3, falseStart: 3, championGives: 5 } as const
export const DEGAINE_SOFT_POINTS = { freeLost: 2, falseStart: 3 } as const

export type DuelSide = 'a' | 'b'
export const DUEL_SIDES: readonly DuelSide[] = ['a', 'b']
export type DuelPhase = 'ready' | 'waiting' | 'decoy' | 'fire' | 'result'
/** `tie`, `double-false-start` et `no-shot` font rejouer la manche. */
export type DuelOutcome = 'win' | 'tie' | 'double-false-start' | 'no-shot'
export type TapKind = 'valid' | 'early' | 'decoy'
export type DegainePenalty = 'none' | 'lost' | 'finalLost' | 'falseStart'
export type DegaineRoundKind = 'final' | 'semi' | 'quarter' | 'eighth' | 'other'

export type DegaineMatch = {
  id: string
  /** Tour du tableau (0 = premier tour) ; 0 en duel libre. */
  round: number
  a: string | null
  b: string | null
  /** Manches gagnées par chaque côté. */
  wins: { a: number; b: number }
  winner: string | null
  /** Exempt : un seul joueur, qualifié d'office. */
  bye: boolean
}

export type DuelPlan = {
  delayMs: number
  /** Décalages depuis le début de l'attente, triés. */
  decoys: { offsetMs: number; word: DegaineDecoyId }[]
}

export type DegaineDuel = {
  matchId: string
  a: string
  b: string
  ready: { a: boolean; b: boolean }
  phase: DuelPhase
  armedAt: number | null
  fireAt: number | null
  decoys: { at: number; word: DegaineDecoyId }[]
  /** Leurre à l'écran (phase `decoy`). */
  decoyIndex: number | null
  /** Instant où « FEU ! » a été peint. */
  shownAt: number | null
  taps: { a: number | null; b: number | null }
  outcome: DuelOutcome | null
  winner: DuelSide | null
  /** Celui qui a perdu la manche sur un faux départ. */
  falseStart: DuelSide | null
  settled: boolean
  /** Attente abandonnée (écran quitté) : on attend de nouveau les deux « Prêt ». */
  interrupted: boolean
}

export type DegaineRoundRecord = {
  matchId: string
  a: string
  b: string
  final: boolean
  /** Cette manche a donné le duel à son vainqueur. */
  decided: boolean
  outcome: DuelOutcome
  winner: DuelSide | null
  kinds: { a: TapKind | null; b: TapKind | null }
  /** Temps de réaction des touchers valides, en ms arrondies. */
  reactionMs: { a: number | null; b: number | null }
}

export type DegaineState = {
  settings: DegaineSettings
  /** Table, dans l'ordre de la prop `players`. */
  playerIds: string[]
  rngState: RngState
  /** Tournoi : tours du tableau ; vide en duel libre. */
  bracket: DegaineMatch[][]
  /** Duel libre : duels dans l'ordre où ils ont été lancés ; vide en tournoi. */
  freeMatches: DegaineMatch[]
  currentMatch: string | null
  /** Manche à l'écran (arène ouverte), null sur le tableau. */
  duel: DegaineDuel | null
  /** +1 à chaque manche ouverte : clé d'affichage propre à chaque manche. */
  duelSeq: number
  log: DegaineRoundRecord[]
  finished: boolean
}

export type DuelSignal = { kind: 'waiting' } | { kind: 'decoy'; index: number } | { kind: 'fire' }

export function otherSide(side: DuelSide): DuelSide {
  return side === 'a' ? 'b' : 'a'
}

export function roundsToWin(settings: Pick<DegaineSettings, 'roundsPerDuel'>): number {
  return settings.roundsPerDuel === 3 ? 2 : 1
}

/**
 * Horodatage d'un toucher ou d'une image sur l'horloge de `performance.now()`. Les vieux
 * navigateurs donnent `e.timeStamp` en ms depuis 1970, ou 0 : on retombe alors sur l'instant présent.
 */
export function stampFrom(eventTimeStamp: number, now: number): number {
  if (!Number.isFinite(eventTimeStamp) || eventTimeStamp <= 0 || eventTimeStamp > now) return now
  return eventTimeStamp
}

// ─── Tableau ──────────────────────────────────────────────────────────────────

/** Plus petite puissance de 2 qui loge tout le monde. */
export function bracketSize(players: number): number {
  let size = 1
  while (size < players) size *= 2
  return size
}

function emptyMatch(id: string, round: number): DegaineMatch {
  return { id, round, a: null, b: null, wins: { a: 0, b: 0 }, winner: null, bye: false }
}

function locate(bracket: DegaineMatch[][], matchId: string): { round: number; index: number } | null {
  for (let round = 0; round < bracket.length; round += 1) {
    const index = bracket[round].findIndex(m => m.id === matchId)
    if (index >= 0) return { round, index }
  }
  return null
}

/** Le vainqueur d'un duel est inscrit puis monte au tour suivant (case a si index pair, b sinon). */
export function advanceBracket(bracket: DegaineMatch[][], matchId: string, winnerId: string): DegaineMatch[][] {
  const at = locate(bracket, matchId)
  if (!at) return bracket
  const match = bracket[at.round][at.index]
  if (winnerId !== match.a && winnerId !== match.b) return bracket
  const next = bracket.map(round => round.slice())
  next[at.round][at.index] = { ...match, winner: winnerId }
  const following = next[at.round + 1]
  if (following) {
    const slot = Math.floor(at.index / 2)
    const target = following[slot]
    following[slot] = at.index % 2 === 0 ? { ...target, a: winnerId } : { ...target, b: winnerId }
  }
  return next
}

/**
 * Tableau tiré au sort. Ordre des tirages : un seul mélange de la table ; ses premiers sont exempts.
 * Duels et exempts s'alternent au premier tour : un exempt retrouve en général le vainqueur d'un vrai duel.
 */
export function createTournament(playerIds: readonly string[], rng: SeededRng): DegaineMatch[][] {
  if (playerIds.length < 2) return []
  const size = bracketSize(playerIds.length)
  const byeCount = size - playerIds.length
  const order = rng.shuffle(playerIds)
  const byePlayers = order.slice(0, byeCount)
  const fighters = order.slice(byeCount)
  const pairs: [string, string][] = []
  for (let i = 0; i + 1 < fighters.length; i += 2) pairs.push([fighters[i], fighters[i + 1]])

  const firstRound: DegaineMatch[] = []
  let p = 0
  let y = 0
  while (p < pairs.length || y < byePlayers.length) {
    if (p < pairs.length) {
      firstRound.push({ ...emptyMatch(`r0m${firstRound.length}`, 0), a: pairs[p][0], b: pairs[p][1] })
      p += 1
    }
    if (y < byePlayers.length) {
      firstRound.push({ ...emptyMatch(`r0m${firstRound.length}`, 0), a: byePlayers[y], bye: true })
      y += 1
    }
  }

  let bracket: DegaineMatch[][] = [firstRound]
  for (let count = firstRound.length / 2, round = 1; count >= 1; count /= 2, round += 1) {
    bracket.push(Array.from({ length: count }, (_, i) => emptyMatch(`r${round}m${i}`, round)))
  }
  for (const match of firstRound) {
    if (match.bye && match.a) bracket = advanceBracket(bracket, match.id, match.a)
  }
  return bracket
}

/** Prochain duel à jouer : tour après tour, dans l'ordre du tableau. */
export function nextBracketMatch(bracket: DegaineMatch[][]): DegaineMatch | null {
  for (const round of bracket) {
    for (const match of round) {
      if (!match.bye && match.a && match.b && !match.winner) return match
    }
  }
  return null
}

export function champion(bracket: DegaineMatch[][]): string | null {
  if (bracket.length === 0) return null
  return bracket[bracket.length - 1][0]?.winner ?? null
}

export function roundKind(totalRounds: number, round: number): DegaineRoundKind {
  const fromEnd = totalRounds - 1 - round
  if (fromEnd === 0) return 'final'
  if (fromEnd === 1) return 'semi'
  if (fromEnd === 2) return 'quarter'
  if (fromEnd === 3) return 'eighth'
  return 'other'
}

/** « Demi-finale · duel 1 sur 2 » : rang du duel parmi les vrais duels (exempts exclus) de son tour. */
export function matchPosition(bracket: DegaineMatch[][], matchId: string): { round: number; number: number; total: number } | null {
  const at = locate(bracket, matchId)
  if (!at) return null
  const real = bracket[at.round].filter(m => !m.bye)
  return { round: at.round, number: real.findIndex(m => m.id === matchId) + 1, total: real.length }
}

// ─── Une manche ───────────────────────────────────────────────────────────────

/**
 * Attente et leurres d'une manche. Ordre des tirages : le délai, puis (leurres activés) leur
 * nombre, la place de chacun, puis les mots. Les leurres ne se chevauchent pas et finissent au
 * moins 500 ms avant « FEU ! » ; une attente trop courte en loge moins que tiré.
 */
export function planDuel(rng: SeededRng, decoysOn: boolean): DuelPlan {
  const delayMs = rng.int(DEGAINE_MIN_DELAY_MS, DEGAINE_MAX_DELAY_MS)
  if (!decoysOn) return { delayMs, decoys: [] }
  const wanted = rng.int(0, DEGAINE_MAX_DECOYS)
  const step = DEGAINE_DECOY_MS + DEGAINE_DECOY_GAP_MS
  const room = delayMs - DEGAINE_DECOY_LEAD_MS
  const count = Math.max(0, Math.min(wanted, Math.floor(room / step)))
  if (count === 0) return { delayMs, decoys: [] }
  const slack = room - count * step
  const offsets: number[] = []
  for (let i = 0; i < count; i += 1) offsets.push(rng.int(0, slack))
  offsets.sort((x, y) => x - y)
  const words = rng.shuffle(DEGAINE_DECOY_IDS).slice(0, count)
  return {
    delayMs,
    decoys: offsets.map((offset, i) => ({ offsetMs: DEGAINE_DECOY_LEAD_MS + offset + i * step, word: words[i] })),
  }
}

export function createDuel(match: DegaineMatch): DegaineDuel | null {
  if (!match.a || !match.b || match.winner) return null
  return {
    matchId: match.id,
    a: match.a,
    b: match.b,
    ready: { a: false, b: false },
    phase: 'ready',
    armedAt: null,
    fireAt: null,
    decoys: [],
    decoyIndex: null,
    shownAt: null,
    taps: { a: null, b: null },
    outcome: null,
    winner: null,
    falseStart: null,
    settled: false,
    interrupted: false,
  }
}

/** Les deux sont prêts : l'attente commence à `now`, signal et leurres en instants absolus. */
export function armDuel(duel: DegaineDuel, plan: DuelPlan, now: number): DegaineDuel {
  return {
    ...duel,
    ready: { a: true, b: true },
    phase: 'waiting',
    armedAt: now,
    fireAt: now + plan.delayMs,
    decoys: plan.decoys.map(d => ({ at: now + d.offsetMs, word: d.word })),
    decoyIndex: null,
    shownAt: null,
    taps: { a: null, b: null },
    outcome: null,
    winner: null,
    falseStart: null,
    settled: false,
    interrupted: false,
  }
}

/** Ce que l'écran doit montrer à l'instant `now` d'une attente. */
export function duelSignalAt(duel: DegaineDuel, now: number): DuelSignal {
  if (duel.fireAt !== null && now >= duel.fireAt) return { kind: 'fire' }
  const index = duel.decoys.findIndex(d => now >= d.at && now < d.at + DEGAINE_DECOY_MS)
  return index >= 0 ? { kind: 'decoy', index } : { kind: 'waiting' }
}

/** Le composant a peint `signal` à l'instant `at` (pour « FEU ! », c'est l'origine des temps de réaction). */
export function applySignal(duel: DegaineDuel, signal: DuelSignal, at: number): DegaineDuel {
  if (duel.phase !== 'waiting' && duel.phase !== 'decoy') return duel
  if (signal.kind === 'fire') return { ...duel, phase: 'fire', decoyIndex: null, shownAt: at }
  if (signal.kind === 'decoy') {
    if (duel.phase === 'decoy' && duel.decoyIndex === signal.index) return duel
    return { ...duel, phase: 'decoy', decoyIndex: signal.index }
  }
  return duel.phase === 'waiting' ? duel : { ...duel, phase: 'waiting', decoyIndex: null }
}

/** Nature d'un toucher, d'après les instants seuls (l'ordre de traitement des événements n'y fait rien). */
export function classifyTap(duel: DegaineDuel, at: number): TapKind {
  if (duel.shownAt !== null && at >= duel.shownAt + DEGAINE_ANTICIPATION_MS) return 'valid'
  return duel.decoys.some(d => at >= d.at && at < d.at + DEGAINE_DECOY_MS) ? 'decoy' : 'early'
}

/** Temps de réaction d'un toucher à l'instant `at`, null s'il n'est pas valide. */
function reactionAt(duel: DegaineDuel, at: number): number | null {
  if (duel.shownAt === null || classifyTap(duel, at) !== 'valid') return null
  return Math.round(at - duel.shownAt)
}

export function reactionMs(duel: DegaineDuel, side: DuelSide): number | null {
  const at = duel.taps[side]
  return at === null ? null : reactionAt(duel, at)
}

function firstTapAt(duel: DegaineDuel): number | null {
  const { a, b } = duel.taps
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}

type DuelVerdict = Pick<DegaineDuel, 'taps' | 'outcome' | 'winner' | 'falseStart'>

/** Verdict quand le toucher de `first` (à `firstAt`) est le plus ancien ; `secondAt` est celui de l'autre. */
function judgeFrom(
  duel: DegaineDuel,
  taps: DegaineDuel['taps'],
  first: DuelSide,
  firstAt: number,
  secondAt: number | null
): DuelVerdict {
  const second = otherSide(first)
  const firstMs = reactionAt(duel, firstAt)
  if (firstMs !== null) {
    return secondAt !== null && reactionAt(duel, secondAt) === firstMs
      ? { taps, outcome: 'tie', winner: null, falseStart: null }
      : { taps, outcome: 'win', winner: first, falseStart: null }
  }
  if (secondAt === null || reactionAt(duel, secondAt) !== null) {
    return { taps, outcome: 'win', winner: second, falseStart: first }
  }
  if (secondAt - firstAt < DEGAINE_DOUBLE_FALSE_START_MS) {
    return { taps, outcome: 'double-false-start', winner: null, falseStart: null }
  }
  const counted = second === 'a' ? { ...taps, a: null } : { ...taps, b: null }
  return { taps: counted, outcome: 'win', winner: second, falseStart: first }
}

/**
 * Verdict d'après les instants seuls (l'ordre de traitement des événements n'y fait rien) : le
 * toucher le plus ancien décide. Valide, il gagne, sauf même temps affiché (en ms) que l'autre :
 * égalité. Faux départ, l'autre gagne ; s'il a lui aussi touché trop tôt moins de 150 ms plus tard,
 * double faux départ ; plus tard encore, son toucher peut répondre au verdict affiché et ne compte pas.
 */
function judge(duel: DegaineDuel, taps: DegaineDuel['taps']): DuelVerdict {
  const { a, b } = taps
  if (a === null) {
    return b === null ? { taps, outcome: null, winner: null, falseStart: null } : judgeFrom(duel, taps, 'b', b, null)
  }
  return b === null || a <= b ? judgeFrom(duel, taps, 'a', a, b) : judgeFrom(duel, taps, 'b', b, a)
}

/**
 * Un duelliste touche sa moitié à l'instant `tAt`. Avant « FEU ! » : faux départ, la manche est
 * jouée sur-le-champ. Le premier toucher ouvre le résultat ; le second reste attendu 1,5 s (son temps
 * s'affiche, et un toucher plus ancien traité en retard corrige le verdict). Un toucher venu après
 * ces 1,5 s, traité avant le minuteur qui les clôt, fige la manche sans compter.
 */
export function resolveTap(duel: DegaineDuel, side: DuelSide, tAt: number): DegaineDuel {
  if (duel.settled || duel.phase === 'ready' || duel.taps[side] !== null) return duel
  if (duel.armedAt !== null && tAt < duel.armedAt + DEGAINE_ARM_GRACE_MS) return duel
  const first = firstTapAt(duel)
  if (first !== null && tAt >= first + DEGAINE_LOSER_WINDOW_MS) return { ...duel, settled: true }
  const taps = side === 'a' ? { ...duel.taps, a: tAt } : { ...duel.taps, b: tAt }
  return {
    ...duel,
    ...judge(duel, taps),
    phase: 'result',
    decoyIndex: null,
    settled: taps.a !== null && taps.b !== null,
  }
}

/** Échéances d'une manche : personne n'a tiré 5 s après « FEU ! », ou fenêtre du perdant écoulée. */
export function resolveTimeout(duel: DegaineDuel, now: number): DegaineDuel {
  if (duel.settled) return duel
  if (duel.phase === 'fire' && duel.shownAt !== null && now >= duel.shownAt + DEGAINE_NO_SHOT_MS) {
    return { ...duel, phase: 'result', outcome: 'no-shot', winner: null, falseStart: null, settled: true }
  }
  if (duel.phase === 'result') {
    const first = firstTapAt(duel)
    if (first !== null && now >= first + DEGAINE_LOSER_WINDOW_MS) return { ...duel, settled: true }
  }
  return duel
}

/** Prochain instant où `resolveTimeout` changera quelque chose (null : rien à attendre). */
export function duelDeadline(duel: DegaineDuel): number | null {
  if (duel.settled) return null
  if (duel.phase === 'fire' && duel.shownAt !== null) return duel.shownAt + DEGAINE_NO_SHOT_MS
  if (duel.phase === 'result') {
    const first = firstTapAt(duel)
    return first === null ? null : first + DEGAINE_LOSER_WINDOW_MS
  }
  return null
}

/** La manche telle qu'elle sera inscrite (null tant qu'elle n'a pas de verdict). */
export function duelRecord(duel: DegaineDuel, final: boolean, decided: boolean): DegaineRoundRecord | null {
  if (duel.outcome === null) return null
  return {
    matchId: duel.matchId,
    a: duel.a,
    b: duel.b,
    final,
    decided: decided && duel.outcome === 'win',
    outcome: duel.outcome,
    winner: duel.winner,
    kinds: {
      a: duel.taps.a === null ? null : classifyTap(duel, duel.taps.a),
      b: duel.taps.b === null ? null : classifyTap(duel, duel.taps.b),
    },
    reactionMs: { a: reactionMs(duel, 'a'), b: reactionMs(duel, 'b') },
  }
}

/**
 * Ce que coûte une manche à un duelliste (événement neutre, chiffré à l'affichage) : un faux
 * départ coûte toujours ; une manche perdue « trop lent » ne coûte que si elle donne le duel.
 */
export function penaltyFor(
  round: Pick<DegaineRoundRecord, 'outcome' | 'winner' | 'kinds' | 'final' | 'decided'>,
  side: DuelSide
): DegainePenalty {
  if (round.outcome === 'double-false-start') return 'falseStart'
  if (round.outcome !== 'win' || round.winner === null || round.winner === side) return 'none'
  const kind = round.kinds[side]
  if (kind === 'early' || kind === 'decoy') return 'falseStart'
  if (!round.decided) return 'none'
  return round.final ? 'finalLost' : 'lost'
}

export function penaltyDrinks(penalty: DegainePenalty): number {
  if (penalty === 'lost') return DEGAINE_DRINKS.lost
  if (penalty === 'finalLost') return DEGAINE_DRINKS.finalLost
  if (penalty === 'falseStart') return DEGAINE_DRINKS.falseStart
  return 0
}

/** Sans alcool, points PERDUS : un duel perdu élimine en tournoi (0 point) et coûte 2 points en duel libre. */
export function penaltySoftPoints(penalty: DegainePenalty, format: DegaineFormat): number {
  if (penalty === 'falseStart') return DEGAINE_SOFT_POINTS.falseStart
  if ((penalty === 'lost' || penalty === 'finalLost') && format === 'free') return DEGAINE_SOFT_POINTS.freeLost
  return 0
}

// ─── Partie ───────────────────────────────────────────────────────────────────

export function createDegaineGame(options: {
  playerIds: string[]
  settings: DegaineSettings
  seed: number | string
}): DegaineState {
  const rng = createRng(options.seed)
  const settings = { ...options.settings }
  const bracket = settings.format === 'tournament' ? createTournament(options.playerIds, rng) : []
  return {
    settings,
    playerIds: [...options.playerIds],
    rngState: rng.getState(),
    bracket,
    freeMatches: [],
    currentMatch: nextBracketMatch(bracket)?.id ?? null,
    duel: null,
    duelSeq: 0,
    log: [],
    finished: false,
  }
}

function allMatches(state: Pick<DegaineState, 'bracket' | 'freeMatches'>): DegaineMatch[] {
  const out: DegaineMatch[] = []
  for (const round of state.bracket) for (const match of round) out.push(match)
  for (const match of state.freeMatches) out.push(match)
  return out
}

export function findMatch(state: Pick<DegaineState, 'bracket' | 'freeMatches'>, id: string): DegaineMatch | null {
  return allMatches(state).find(m => m.id === id) ?? null
}

function replaceMatch(state: DegaineState, match: DegaineMatch): DegaineState {
  if (state.settings.format === 'tournament') {
    return { ...state, bracket: state.bracket.map(round => round.map(m => (m.id === match.id ? match : m))) }
  }
  return { ...state, freeMatches: state.freeMatches.map(m => (m.id === match.id ? match : m)) }
}

export function isFinalMatch(state: Pick<DegaineState, 'settings' | 'bracket'>, match: DegaineMatch): boolean {
  return state.settings.format === 'tournament' && match.round === state.bracket.length - 1
}

/** Ouvre l'arène sur le duel courant : les deux duellistes ont à toucher « Prêt ». */
export function openDuel(state: DegaineState): DegaineState {
  if (state.finished || state.duel || state.currentMatch === null) return state
  const match = findMatch(state, state.currentMatch)
  const duel = match ? createDuel(match) : null
  return duel ? { ...state, duel, duelSeq: state.duelSeq + 1 } : state
}

/** « Prêt » d'un côté ; le second « Prêt » tire l'attente et les leurres et lance le compte à `now`. */
export function markReady(state: DegaineState, side: DuelSide, now: number): DegaineState {
  const duel = state.duel
  if (!duel || duel.phase !== 'ready' || duel.ready[side]) return state
  const ready = side === 'a' ? { ...duel.ready, a: true } : { ...duel.ready, b: true }
  if (!ready.a || !ready.b) return { ...state, duel: { ...duel, ready, interrupted: false } }
  const rng = rngFromState(state.rngState)
  const plan = planDuel(rng, state.settings.decoys)
  return { ...state, rngState: rng.getState(), duel: armDuel(duel, plan, now) }
}

export function showSignal(state: DegaineState, signal: DuelSignal, at: number): DegaineState {
  if (!state.duel) return state
  const duel = applySignal(state.duel, signal, at)
  return duel === state.duel ? state : { ...state, duel }
}

/** Score du duel une fois la manche comptée (une manche gagnée ajoute 1 au vainqueur). */
function winsAfter(match: DegaineMatch, duel: Pick<DegaineDuel, 'outcome' | 'winner'>): { a: number; b: number } {
  if (duel.outcome !== 'win' || duel.winner === null || match.winner) return match.wins
  return duel.winner === 'a' ? { ...match.wins, a: match.wins.a + 1 } : { ...match.wins, b: match.wins.b + 1 }
}

function decides(state: Pick<DegaineState, 'settings'>, match: DegaineMatch, duel: Pick<DegaineDuel, 'outcome' | 'winner'>): boolean {
  if (duel.outcome !== 'win' || duel.winner === null || match.winner) return false
  return winsAfter(match, duel)[duel.winner] >= roundsToWin(state.settings)
}

/** Manche jouée : inscrite au journal ; une manche gagnée compte au score, le duel gagné fait avancer le tableau. */
function commitRound(state: DegaineState): DegaineState {
  const duel = state.duel
  const match = duel ? findMatch(state, duel.matchId) : null
  if (!duel || !match) return state
  const decided = decides(state, match, duel)
  const record = duelRecord(duel, isFinalMatch(state, match), decided)
  if (!record) return state
  const logged: DegaineState = { ...state, log: [...state.log, record] }
  if (record.outcome !== 'win' || record.winner === null || match.winner) return logged

  const wins = winsAfter(match, duel)
  const winnerId = record.winner === 'a' ? match.a : match.b
  const scored = replaceMatch(logged, { ...match, wins })
  if (!decided || !winnerId) return scored
  if (state.settings.format === 'free') return replaceMatch(scored, { ...match, wins, winner: winnerId })

  const bracket = advanceBracket(scored.bracket, match.id, winnerId)
  return {
    ...scored,
    bracket,
    currentMatch: nextBracketMatch(bracket)?.id ?? null,
    finished: champion(bracket) !== null,
  }
}

/**
 * La manche à l'écran telle qu'elle est (ou sera) inscrite : le verdict s'affiche dès le premier
 * tir, avant que la fenêtre du perdant ne la fige au journal.
 */
export function currentRoundRecord(state: DegaineState): DegaineRoundRecord | null {
  const duel = state.duel
  if (!duel || duel.outcome === null) return null
  if (duel.settled) {
    const last = state.log[state.log.length - 1]
    return last && last.matchId === duel.matchId ? last : null
  }
  const match = findMatch(state, duel.matchId)
  return match ? duelRecord(duel, isFinalMatch(state, match), decides(state, match, duel)) : null
}

/** Score du duel à l'écran, la manche en cours comprise même avant qu'elle ne soit figée. */
export function currentScore(state: DegaineState): { a: number; b: number } | null {
  const duel = state.duel
  const match = duel ? findMatch(state, duel.matchId) : null
  if (!duel || !match) return null
  return duel.settled ? match.wins : winsAfter(match, duel)
}

/** Tour où file le vainqueur d'un duel du tableau ; null pour la finale (et en duel libre). */
export function nextStageKind(state: Pick<DegaineState, 'settings' | 'bracket'>, match: DegaineMatch): DegaineRoundKind | null {
  if (state.settings.format !== 'tournament' || isFinalMatch(state, match)) return null
  return roundKind(state.bracket.length, match.round + 1)
}

function withDuel(state: DegaineState, before: DegaineDuel, after: DegaineDuel): DegaineState {
  if (after === before) return state
  const next = { ...state, duel: after }
  return !before.settled && after.settled ? commitRound(next) : next
}

export function tapDuel(state: DegaineState, side: DuelSide, tAt: number): DegaineState {
  return state.duel ? withDuel(state, state.duel, resolveTap(state.duel, side, tAt)) : state
}

export function timeoutDuel(state: DegaineState, now: number): DegaineState {
  return state.duel ? withDuel(state, state.duel, resolveTimeout(state.duel, now)) : state
}

/**
 * L'écran a été quitté pendant la manche (appel, verrouillage) : une attente ou un « FEU ! » sans
 * toucher n'a plus de sens, la manche repart des deux « Prêt » ; un résultat en cours est arrêté là.
 */
export function interruptDuel(state: DegaineState): DegaineState {
  const duel = state.duel
  if (!duel || duel.settled || duel.phase === 'ready') return state
  if (duel.phase === 'result') return withDuel(state, duel, { ...duel, settled: true })
  const match = findMatch(state, duel.matchId)
  const fresh = match ? createDuel(match) : null
  return fresh ? { ...state, duel: { ...fresh, interrupted: true } } : state
}

/** Ferme l'arène. Une manche sans verdict est annulée, rien n'est inscrit. */
export function closeDuel(state: DegaineState): DegaineState {
  return state.duel ? { ...state, duel: null } : state
}

/** Manche suivante du même duel (au meilleur des 3, ou manche à rejouer). */
export function nextRound(state: DegaineState): DegaineState {
  const duel = state.duel
  if (!duel || !duel.settled) return state
  const match = findMatch(state, duel.matchId)
  const fresh = match ? createDuel(match) : null
  return fresh ? { ...state, duel: fresh, duelSeq: state.duelSeq + 1 } : state
}

function newFreeMatch(state: DegaineState, a: string, b: string): DegaineMatch {
  return { ...emptyMatch(`f${state.freeMatches.length}`, 0), a, b }
}

/** Duel libre : la table désigne les duellistes. Le même duo garde son duel en cours. */
export function chooseDuellists(state: DegaineState, aId: string, bId: string): DegaineState {
  if (state.settings.format !== 'free' || state.finished || state.duel) return state
  if (aId === bId || !state.playerIds.includes(aId) || !state.playerIds.includes(bId)) return state
  const current = state.currentMatch === null ? null : findMatch(state, state.currentMatch)
  const samePair = current !== null && ((current.a === aId && current.b === bId) || (current.a === bId && current.b === aId))
  if (current && samePair && !current.winner) return state
  const match = newFreeMatch(state, aId, bId)
  return { ...state, freeMatches: [...state.freeMatches, match], currentMatch: match.id }
}

/** Duel libre : revanche du duel qui vient de se jouer, arène rouverte aussitôt. */
export function rematch(state: DegaineState): DegaineState {
  if (state.settings.format !== 'free' || state.finished) return state
  const current = state.currentMatch === null ? null : findMatch(state, state.currentMatch)
  if (!current || !current.winner || !current.a || !current.b) return state
  const match = newFreeMatch(state, current.a, current.b)
  return openDuel({ ...state, duel: null, freeMatches: [...state.freeMatches, match], currentMatch: match.id })
}

/** Duel libre : la table s'arrête, place au bilan. */
export function finishFreePlay(state: DegaineState): DegaineState {
  if (state.settings.format !== 'free' || state.finished) return state
  return { ...state, duel: null, finished: true }
}

// ─── Bilan ────────────────────────────────────────────────────────────────────

export type DegaineTally = {
  roundsPlayed: number
  roundsWon: number
  /** Duels perdus « trop lent » (hors finale) : le coût d'un duel perdu. */
  duelsLost: number
  /** Finale perdue « trop lent ». */
  finalsLost: number
  falseStarts: number
  decoysHit: number
  matchesPlayed: number
  matchesWon: number
  bestReactionMs: number | null
}

function emptyTally(): DegaineTally {
  return {
    roundsPlayed: 0,
    roundsWon: 0,
    duelsLost: 0,
    finalsLost: 0,
    falseStarts: 0,
    decoysHit: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    bestReactionMs: null,
  }
}

export function degaineTally(state: Pick<DegaineState, 'playerIds' | 'log' | 'bracket' | 'freeMatches'>): Record<string, DegaineTally> {
  const tally: Record<string, DegaineTally> = {}
  for (const id of state.playerIds) tally[id] = emptyTally()
  for (const round of state.log) {
    for (const side of DUEL_SIDES) {
      const row = tally[round[side]]
      if (!row) continue
      row.roundsPlayed += 1
      const ms = round.reactionMs[side]
      if (ms !== null && (row.bestReactionMs === null || ms < row.bestReactionMs)) row.bestReactionMs = ms
      if (round.outcome === 'win' && round.winner === side) row.roundsWon += 1
      const penalty = penaltyFor(round, side)
      if (penalty === 'lost') row.duelsLost += 1
      if (penalty === 'finalLost') row.finalsLost += 1
      if (penalty === 'falseStart') {
        row.falseStarts += 1
        if (round.kinds[side] === 'decoy') row.decoysHit += 1
      }
    }
  }
  for (const match of allMatches(state)) {
    if (match.bye || !match.winner || !match.a || !match.b) continue
    for (const id of [match.a, match.b]) {
      const row = tally[id]
      if (!row) continue
      row.matchesPlayed += 1
      if (id === match.winner) row.matchesWon += 1
    }
  }
  return tally
}

export function degaineDrinks(row: DegaineTally): number {
  return (
    row.duelsLost * DEGAINE_DRINKS.lost +
    row.finalsLost * DEGAINE_DRINKS.finalLost +
    row.falseStarts * DEGAINE_DRINKS.falseStart
  )
}

/** Points PERDUS sans alcool (nombre positif) : en tournoi, un duel perdu élimine sans coûter de point. */
export function degaineSoftPointsLost(row: DegaineTally, format: DegaineFormat): number {
  const lost = format === 'free' ? (row.duelsLost + row.finalsLost) * DEGAINE_SOFT_POINTS.freeLost : 0
  return lost + row.falseStarts * DEGAINE_SOFT_POINTS.falseStart
}

export type DegaineTournamentRow = { playerId: string; rank: number; lostRound: number | null }

/** Classement du tournoi : le champion, puis par tour d'élimination, du plus tardif au plus tôt. */
export function tournamentRanking(state: Pick<DegaineState, 'playerIds' | 'bracket'>): DegaineTournamentRow[] {
  const winnerId = champion(state.bracket)
  const lostRound = new Map<string, number>()
  const reached = new Map<string, number>()
  for (const round of state.bracket) {
    for (const match of round) {
      for (const id of [match.a, match.b]) {
        if (id) reached.set(id, Math.max(reached.get(id) ?? 0, match.round))
      }
      if (match.winner && match.a && match.b) lostRound.set(match.winner === match.a ? match.b : match.a, match.round)
    }
  }
  const depth = (id: string): number => {
    if (id === winnerId) return state.bracket.length
    const lost = lostRound.get(id)
    return lost !== undefined ? lost : (reached.get(id) ?? 0) + 0.5
  }
  const rows = state.playerIds.map((playerId, index) => ({ playerId, index, depth: depth(playerId) }))
  rows.sort((x, y) => y.depth - x.depth || x.index - y.index)
  return rows.map(row => ({
    playerId: row.playerId,
    rank: 1 + rows.filter(other => other.depth > row.depth).length,
    lostRound: lostRound.get(row.playerId) ?? null,
  }))
}

export type DegaineFreeRow = { playerId: string; rank: number }

/** Bilan du duel libre : duels gagnés, puis manches gagnées ; les spectateurs n'y figurent pas. */
export function freeRanking(state: Pick<DegaineState, 'playerIds' | 'log' | 'bracket' | 'freeMatches'>): DegaineFreeRow[] {
  const tally = degaineTally(state)
  const rows = state.playerIds
    .map((playerId, index) => ({ playerId, index, row: tally[playerId] }))
    .filter(entry => entry.row && entry.row.roundsPlayed > 0)
  const better = (x: DegaineTally, y: DegaineTally) =>
    y.matchesWon - x.matchesWon || y.roundsWon - x.roundsWon
  rows.sort((x, y) => better(x.row, y.row) || x.row.falseStarts - y.row.falseStarts || x.index - y.index)
  return rows.map(entry => ({
    playerId: entry.playerId,
    rank: 1 + rows.filter(other => better(other.row, entry.row) < 0).length,
  }))
}

// ─── Reprise (useResumableLocalGame) ──────────────────────────────────────────

export const DEGAINE_SAVE_ID = 'degaine'
/** À incrémenter dès que la forme de DegaineSave change : l'ancienne sauvegarde est jetée. */
export const DEGAINE_SAVE_VERSION = 1

/** Sans la manche en cours : une attente ou un « FEU ! » ne se reprennent pas. */
export type DegaineSave = {
  settings: DegaineSettings
  playerIds: string[]
  rngState: number
  bracket: DegaineMatch[][]
  freeMatches: DegaineMatch[]
  currentMatch: string | null
  log: DegaineRoundRecord[]
}

/** Null pour une partie finie : elle ne laisse rien derrière elle. */
export function toDegaineSave(state: DegaineState): DegaineSave | null {
  if (state.finished) return null
  return {
    settings: state.settings,
    playerIds: state.playerIds,
    rngState: state.rngState,
    bracket: state.bracket,
    freeMatches: state.freeMatches,
    currentMatch: state.currentMatch,
    log: state.log,
  }
}

function sameIdSet(saved: unknown, ids: readonly string[]): boolean {
  if (!Array.isArray(saved) || saved.length !== ids.length) return false
  const set = new Set(ids)
  const seen = new Set<string>()
  for (const id of saved) {
    if (typeof id !== 'string' || !set.has(id) || seen.has(id)) return false
    seen.add(id)
  }
  return true
}

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

function readSettings(value: unknown): DegaineSettings | null {
  if (!isRecordObject(value)) return null
  const { format, decoys, roundsPerDuel } = value
  if (format !== 'tournament' && format !== 'free') return null
  if (typeof decoys !== 'boolean') return null
  if (roundsPerDuel !== 1 && roundsPerDuel !== 3) return null
  return { format, decoys, roundsPerDuel }
}

function readSlot(value: unknown, ids: Set<string>): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' && ids.has(value) ? value : undefined
}

function readMatch(value: unknown, ids: Set<string>): DegaineMatch | null {
  if (!isRecordObject(value) || typeof value.id !== 'string' || !isCount(value.round)) return null
  const a = readSlot(value.a, ids)
  const b = readSlot(value.b, ids)
  const winner = readSlot(value.winner, ids)
  if (a === undefined || b === undefined || winner === undefined || typeof value.bye !== 'boolean') return null
  if (winner !== null && winner !== a && winner !== b) return null
  const wins = value.wins
  if (!isRecordObject(wins) || !isCount(wins.a) || !isCount(wins.b)) return null
  return { id: value.id, round: value.round, a, b, wins: { a: wins.a, b: wins.b }, winner, bye: value.bye }
}

const TAP_KINDS: readonly (TapKind | null)[] = ['valid', 'early', 'decoy', null]
const OUTCOMES: readonly DuelOutcome[] = ['win', 'tie', 'double-false-start', 'no-shot']

function readRecord(value: unknown, ids: Set<string>, matchIds: Set<string>): DegaineRoundRecord | null {
  if (!isRecordObject(value) || typeof value.matchId !== 'string' || !matchIds.has(value.matchId)) return null
  const { a, b, final, decided, outcome, winner, kinds, reactionMs: times } = value
  if (typeof a !== 'string' || typeof b !== 'string' || !ids.has(a) || !ids.has(b)) return null
  if (typeof final !== 'boolean' || typeof decided !== 'boolean' || !OUTCOMES.includes(outcome as DuelOutcome)) return null
  if (winner !== null && winner !== 'a' && winner !== 'b') return null
  if (!isRecordObject(kinds) || !TAP_KINDS.includes(kinds.a as TapKind | null) || !TAP_KINDS.includes(kinds.b as TapKind | null)) return null
  if (!isRecordObject(times)) return null
  const ta = times.a
  const tb = times.b
  if ((ta !== null && !isCount(ta)) || (tb !== null && !isCount(tb))) return null
  return {
    matchId: value.matchId,
    a,
    b,
    final,
    decided,
    outcome: outcome as DuelOutcome,
    winner,
    kinds: { a: kinds.a as TapKind | null, b: kinds.b as TapKind | null },
    reactionMs: { a: ta, b: tb },
  }
}

function readMatches(value: unknown, ids: Set<string>): DegaineMatch[] | null {
  if (!Array.isArray(value)) return null
  const out: DegaineMatch[] = []
  for (const item of value) {
    const match = readMatch(item, ids)
    if (!match) return null
    out.push(match)
  }
  return out
}

/**
 * La sauvegarde est-elle reprenable pour CETTE table ? Les réglages de la pré-partie n'entrent pas en compte :
 * après un rechargement elle revient aux défauts, et la partie reprend avec les réglages qu'elle avait.
 */
export function isResumableDegaineSave(save: unknown, playerIds: readonly string[]): boolean {
  if (!isRecordObject(save)) return false
  return readSettings(save.settings) !== null && sameIdSet(save.playerIds, playerIds)
}

/** Sauvegarde → état pour la table ACTUELLE. Null si illisible : partie neuve plutôt qu'un plantage. */
export function restoreDegaineSave(save: unknown, playerIds: string[]): DegaineState | null {
  if (!isRecordObject(save) || !sameIdSet(save.playerIds, playerIds)) return null
  const settings = readSettings(save.settings)
  if (!settings || !isCount(save.rngState) || save.rngState > 0xffffffff) return null
  const ids = new Set(playerIds)

  if (!Array.isArray(save.bracket)) return null
  const bracket: DegaineMatch[][] = []
  for (const round of save.bracket) {
    const matches = readMatches(round, ids)
    if (!matches || matches.length === 0) return null
    bracket.push(matches)
  }
  const freeMatches = readMatches(save.freeMatches, ids)
  if (!freeMatches) return null
  if (settings.format === 'tournament') {
    if (bracket.length === 0 || freeMatches.length > 0) return null
    for (let round = 0; round < bracket.length; round += 1) {
      const expected = bracket[0].length / 2 ** round
      if (bracket[round].length !== expected || bracket[round].some(m => m.round !== round)) return null
    }
    if (bracket[bracket.length - 1].length !== 1) return null
  } else if (bracket.length > 0) {
    return null
  }

  const matchIds = new Set(allMatches({ bracket, freeMatches }).map(m => m.id))
  if (matchIds.size !== bracket.reduce((n, round) => n + round.length, 0) + freeMatches.length) return null
  const currentMatch = save.currentMatch
  if (currentMatch !== null && (typeof currentMatch !== 'string' || !matchIds.has(currentMatch))) return null
  if (!Array.isArray(save.log)) return null
  const log: DegaineRoundRecord[] = []
  for (const item of save.log) {
    const record = readRecord(item, ids, matchIds)
    if (!record) return null
    log.push(record)
  }

  return {
    settings,
    playerIds: [...playerIds],
    rngState: save.rngState,
    bracket,
    freeMatches,
    currentMatch,
    duel: null,
    duelSeq: 0,
    log,
    finished: settings.format === 'tournament' && champion(bracket) !== null,
  }
}
