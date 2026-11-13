import { hashSeed, rngFromState, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'

/**
 * Moteur pur de Patate Chaude, partagé par le jeu local et par le serveur en ligne.
 *
 * Une manche : la mèche s'allume (startRound), un défi est tiré (thème, lettre ou syllabe) avec une
 * échéance SECRÈTE dans la plage de la mèche. Le porteur dit un mot puis passe la bombe au joueur
 * actif suivant (pass). La table rejette un mot (reject, local : deux rejets de suite = 1 pénalité)
 * ou le conteste (contest, en ligne, quel que soit le défi, dès quatre joueurs : le mot est rayé,
 * la bombe revient à son auteur). À l'échéance, celui qui tient la bombe explose
 * (resolveIfExpired). Fin après N manches, ou quand la table le décide (finish).
 *
 * Joueurs par identifiant, état JSON, aléatoire tiré de `rngState` (ou fourni par le serveur),
 * temps passé en `now` : rien n'est lu dans le moteur. Les refus sont des résultats typés, jamais
 * des exceptions. Le moteur ne compte que des événements neutres (explosions, pénalités) : gorgées
 * et points se calculent à l'affichage. Seuls `explodeAt` et `rngState` sont secrets :
 * toPcPublicView les retire.
 */

export const PC_CHALLENGE_MODES = ['mix', 'theme', 'letter', 'syllable'] as const
export type PcChallengeMode = (typeof PC_CHALLENGE_MODES)[number]
export type PcChallengeKind = Exclude<PcChallengeMode, 'mix'>
export const PC_CHALLENGE_KINDS: readonly PcChallengeKind[] = ['theme', 'letter', 'syllable']

export const PC_FUSES = ['short', 'normal', 'long'] as const
export type PcFuse = (typeof PC_FUSES)[number]

/** Plage de la mèche, en secondes. Publique : seule la durée tirée dans la plage est secrète. */
export const PC_FUSE_RANGES_S: Readonly<Record<PcFuse, { readonly min: number; readonly max: number }>> = {
  short: { min: 10, max: 25 },
  normal: { min: 15, max: 45 },
  long: { min: 30, max: 75 },
}

/** 0 manche = illimité : la table termine quand elle veut. */
export const PC_UNLIMITED_ROUNDS = 0
export const PC_ROUNDS_OPTIONS = [5, 10, PC_UNLIMITED_ROUNDS] as const
export type PcRounds = (typeof PC_ROUNDS_OPTIONS)[number]

export type PcSettings = { challenge: PcChallengeMode; fuse: PcFuse; rounds: PcRounds }
export const PC_DEFAULT_SETTINGS: PcSettings = { challenge: 'mix', fuse: 'normal', rounds: 10 }

export const PC_MIN_PLAYERS = 2
export const PC_WORD_MIN_LENGTH = 2
export const PC_WORD_MAX_LENGTH = 30
/** Rejets de suite d'un même porteur qui coûtent une pénalité (local). */
export const PC_REJECTS_FOR_PENALTY = 2
/** (En ligne) Voix nécessaires au moins pour rayer un mot : un joueur seul ne raye jamais rien. */
export const PC_CONTEST_MIN_VOTES = 2
/**
 * (En ligne) Explosions dans des manches où il n'a rien joué (ni passe, ni mot tenté, ni
 * contestation) après lesquelles un joueur est mis de côté — jamais s'il ne restait qu'un joueur.
 */
export const PC_IDLE_BOOMS = 2

/** Barème d'affichage : gorgées en ambiance alcool, points de pénalité en Soft. */
export const PC_EXPLOSION_SIPS = 3
export const PC_PENALTY_SIPS = 1
export const PC_EXPLOSION_POINTS = 1
export const PC_PENALTY_POINTS = 1

/** Mémoire des défis déjà servis : au-delà, les plus anciens peuvent revenir. */
const USED_CHALLENGES_LIMIT = 300

export type PcChallenge = { kind: PcChallengeKind; id?: string; value: string }

/** Contenu d'une langue, tel que le chargeur (local) ou le serveur (en ligne) le fournit. */
export type PcChallengeSource = {
  readonly themes: readonly { readonly id: string; readonly text: string }[]
  readonly letters: readonly string[]
  readonly syllables: readonly string[]
}

export type PcWord = { player: string; word: string; struck: boolean }

export type PcPhase = 'ready' | 'burning' | 'boom' | 'finished'

export type PcBoom = {
  playerId: string
  /** Index (base 0) de la manche qui a explosé. */
  round: number
  fuseMs: number
  passes: number
}

export type PcState = {
  settings: PcSettings
  /** Table dans l'ordre de passe : ordre des joueurs en local, des membres en ligne. */
  playerIds: string[]
  /** (En ligne) Sautés à la passe et au départ de manche : partis, ou mis de côté pour inactivité. */
  absent: string[]
  /** Base 0. */
  roundIndex: number
  phase: PcPhase
  /** Défi de la manche, tiré à l'allumage de la mèche (null avant). */
  challenge: PcChallenge | null
  holder: string
  passes: number
  rejectsInARow: number
  /** Mots tapés de la manche (en ligne) ; vide en local, où l'on parle à voix haute. */
  words: PcWord[]
  /** Index dans `words` du mot encore contestable (le dernier passé), sinon null. */
  openWord: number | null
  contests: string[]
  /** Public : le tic-tac s'y cale, rapporté à la borne haute de la mèche. */
  roundStartedAt: number | null
  /** SECRET : n'apparaît dans aucune vue. */
  explodeAt: number | null
  lastBoom: PcBoom | null
  explosions: Record<string, number>
  /** Deux rejets de suite (local) ou mot rayé par la table (en ligne). */
  penalties: Record<string, number>
  /**
   * Explosions subies, depuis la dernière action du joueur, dans une manche où il n'avait rien joué
   * (voir `played`). En ligne, à PC_IDLE_BOOMS, nextRound le met de côté.
   */
  idleBooms: Record<string, number>
  /**
   * Qui a joué pendant la mèche en cours : passe, mot tenté même refusé (noteAttempt),
   * contestation, retour. Un BOUM chez l'un d'eux ne compte pas comme une absence. Vidé à chaque
   * allumage et à chaque BOUM.
   */
  played: string[]
  /** Défis déjà servis (`kind:id|valeur`), pour varier d'une manche à l'autre. */
  usedChallenges: string[]
  rngState: RngState
}

export type PcError =
  | 'NOT_ENOUGH_PLAYERS'
  | 'WRONG_PHASE'
  | 'NOT_HOLDER'
  | 'UNKNOWN_PLAYER'
  | 'NO_CHALLENGE'
  | 'WORD_TOO_SHORT'
  | 'WORD_TOO_LONG'
  | 'WORD_ALREADY_SAID'
  | 'WORD_WRONG_LETTER'
  | 'WORD_MISSING_SYLLABLE'
  | 'NOTHING_TO_CONTEST'
  | 'OWN_WORD'
  | 'HOLDER_CANNOT_CONTEST'
  | 'CONTEST_NEEDS_MORE_PLAYERS'
  | 'ALREADY_CONTESTED'

export type PcResult = { ok: true; state: PcState } | { ok: false; error: PcError }

const ok = (state: PcState): PcResult => ({ ok: true, state })
const fail = (error: PcError): PcResult => ({ ok: false, error })

const bump = (counts: Record<string, number>, id: string): Record<string, number> => ({
  ...counts,
  [id]: (counts[id] ?? 0) + 1,
})

// ─── Réglages ────────────────────────────────────────────────────────────────

/** Réglages valides, ou null : le serveur et la reprise locale ne font confiance à aucun JSON. */
export function parsePcSettings(input: unknown): PcSettings | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Record<string, unknown>
  const challenge = PC_CHALLENGE_MODES.find((mode) => mode === s.challenge)
  const fuse = PC_FUSES.find((value) => value === s.fuse)
  const rounds = PC_ROUNDS_OPTIONS.find((value) => value === s.rounds)
  if (challenge === undefined || fuse === undefined || rounds === undefined) return null
  return { challenge, fuse, rounds }
}

export function isSamePcSettings(saved: unknown, current: PcSettings): boolean {
  const parsed = parsePcSettings(saved)
  return (
    parsed !== null &&
    parsed.challenge === current.challenge &&
    parsed.fuse === current.fuse &&
    parsed.rounds === current.rounds
  )
}

/** Plage de la mèche en millisecondes (la borne haute cale le tic-tac). */
export function pcFuseRangeMs(fuse: PcFuse): { min: number; max: number } {
  const range = PC_FUSE_RANGES_S[fuse]
  return { min: range.min * 1000, max: range.max * 1000 }
}

// ─── Table ───────────────────────────────────────────────────────────────────

type PcTable = Pick<PcState, 'playerIds' | 'absent'>

export function isPcPlayerActive(state: PcTable, playerId: string): boolean {
  return state.playerIds.includes(playerId) && !state.absent.includes(playerId)
}

export function activePlayerIds(state: PcTable): string[] {
  return state.playerIds.filter((id) => !state.absent.includes(id))
}

/** Joueur actif qui suit `fromId` dans l'ordre de la table (circulaire). */
function nextActiveId(state: PcState, fromId: string): string {
  const n = state.playerIds.length
  const from = state.playerIds.indexOf(fromId)
  for (let step = 1; step <= n; step += 1) {
    const id = state.playerIds[(from + step + n) % n]
    if (id !== undefined && !state.absent.includes(id)) return id
  }
  return fromId
}

/** Celui qui recevra la bombe si le porteur passe maintenant. */
export function nextHolderId(state: PcState): string {
  return nextActiveId(state, state.holder)
}

// ─── Partie ──────────────────────────────────────────────────────────────────

type PcNewGame = { playerIds: readonly string[]; settings: PcSettings; seed: string | number }

function freshGame(options: PcNewGame): PcState {
  const playerIds: string[] = []
  for (const id of options.playerIds) {
    if (typeof id === 'string' && id.length > 0 && !playerIds.includes(id)) playerIds.push(id)
  }
  const zeros: Record<string, number> = {}
  for (const id of playerIds) zeros[id] = 0
  return {
    settings: { ...options.settings },
    playerIds,
    absent: [],
    roundIndex: 0,
    phase: 'ready',
    challenge: null,
    holder: playerIds[0] ?? '',
    passes: 0,
    rejectsInARow: 0,
    words: [],
    openWord: null,
    contests: [],
    roundStartedAt: null,
    explodeAt: null,
    lastBoom: null,
    explosions: { ...zeros },
    penalties: { ...zeros },
    idleBooms: { ...zeros },
    played: [],
    usedChallenges: [],
    rngState: hashSeed(options.seed),
  }
}

/**
 * Partie neuve, en attente d'allumage : la bombe commence chez le premier joueur de la table.
 * `seed` : graine de la partie (randomSeed() côté composant ou serveur, fixe dans les tests).
 */
export function createGame(options: PcNewGame): PcResult {
  const game = freshGame(options)
  return game.playerIds.length < PC_MIN_PLAYERS ? fail('NOT_ENOUGH_PLAYERS') : ok(game)
}

/**
 * (En ligne) Partie close avant la première mèche, quelle que soit la table : elle s'est vidée
 * entre le lancement et l'allumage. Aucune manche jouée ; l'écran de fin et « Retour à la table »
 * fonctionnent comme après une vraie partie.
 */
export function createClosedGame(options: PcNewGame): PcState {
  return { ...freshGame(options), phase: 'finished' }
}

const challengeKey = (challenge: PcChallenge): string => `${challenge.kind}:${challenge.id ?? challenge.value}`

function challengePools(source: PcChallengeSource): Record<PcChallengeKind, PcChallenge[]> {
  const themes: PcChallenge[] = []
  for (const theme of source.themes) {
    const text = theme.text.trim()
    if (theme.id && text) themes.push({ kind: 'theme', id: theme.id, value: text })
  }
  const fromList = (kind: 'letter' | 'syllable', list: readonly string[]): PcChallenge[] =>
    list.map((value) => value.trim()).filter((value) => value.length > 0).map((value) => ({ kind, value }))
  return { theme: themes, letter: fromList('letter', source.letters), syllable: fromList('syllable', source.syllables) }
}

/** Tirages, dans cet ordre : la sorte (en Mélange seulement), puis le défi. */
function drawChallenge(state: PcState, source: PcChallengeSource, rng: SeededRng): PcChallenge | null {
  const pools = challengePools(source)
  const wanted: readonly PcChallengeKind[] =
    state.settings.challenge === 'mix' ? PC_CHALLENGE_KINDS : [state.settings.challenge]
  const kinds = wanted.filter((kind) => pools[kind].length > 0)
  if (kinds.length === 0) return null
  const kind = kinds.length === 1 ? kinds[0] : kinds[rng.pickIndex(kinds.length)]
  const pool = pools[kind]
  const used = new Set(state.usedChallenges)
  const fresh = pool.filter((challenge) => !used.has(challengeKey(challenge)))
  const candidates = fresh.length > 0 ? fresh : pool
  return candidates[rng.pickIndex(candidates.length)]
}

/**
 * Allume la mèche de la manche : tire le défi (la sorte d'abord, en Mélange), puis la durée
 * secrète. La bombe reste chez le porteur désigné par la manche précédente.
 *
 * `fuseMs` (en ligne) : durée fournie par le serveur, tirée d'un hasard propre à la manche. Tirée
 * du même flux que les défis, que tout le monde voit, elle se laisserait recalculer : une graine
 * de 32 bits se retrouve à partir de quelques défis et de la durée publiée après chaque BOUM.
 * Ramenée dans la plage du réglage ; absente (jeu local), elle sort du flux de la partie.
 */
export function startRound(
  state: PcState,
  now: number,
  source: PcChallengeSource,
  options: { fuseMs?: number } = {}
): PcResult {
  if (state.phase !== 'ready') return fail('WRONG_PHASE')
  if (activePlayerIds(state).length < PC_MIN_PLAYERS) return fail('NOT_ENOUGH_PLAYERS')
  const rng = rngFromState(state.rngState)
  const challenge = drawChallenge(state, source, rng)
  if (!challenge) return fail('NO_CHALLENGE')
  const range = pcFuseRangeMs(state.settings.fuse)
  const given = options.fuseMs
  const fuseMs =
    given !== undefined && Number.isFinite(given)
      ? Math.min(range.max, Math.max(range.min, Math.round(given)))
      : rng.int(range.min, range.max)
  return ok({
    ...state,
    phase: 'burning',
    challenge,
    holder: isPcPlayerActive(state, state.holder) ? state.holder : nextActiveId(state, state.holder),
    passes: 0,
    rejectsInARow: 0,
    words: [],
    openWord: null,
    contests: [],
    roundStartedAt: now,
    explodeAt: now + fuseMs,
    played: [],
    usedChallenges: [...state.usedChallenges, challengeKey(challenge)].slice(-USED_CHALLENGES_LIMIT),
    rngState: rng.getState(),
  })
}

/**
 * BOUM si l'échéance est atteinte : celui qui tient la bombe À CET INSTANT perd la manche.
 * Rend le MÊME objet quand rien ne change (l'appelant détecte l'explosion par identité).
 */
export function resolveIfExpired(state: PcState, now: number): PcState {
  if (state.phase !== 'burning' || state.explodeAt === null || now < state.explodeAt) return state
  const loser = state.holder
  return {
    ...state,
    phase: 'boom',
    explosions: bump(state.explosions, loser),
    // Il a joué pendant cette mèche (passe, mot tenté, contestation) : présent, juste malchanceux.
    idleBooms: state.played.includes(loser) ? state.idleBooms : bump(state.idleBooms, loser),
    played: [],
    lastBoom: {
      playerId: loser,
      round: state.roundIndex,
      fuseMs: state.roundStartedAt === null ? 0 : Math.max(0, state.explodeAt - state.roundStartedAt),
      passes: state.passes,
    },
    rejectsInARow: 0,
    openWord: null,
    contests: [],
    roundStartedAt: null,
    explodeAt: null,
  }
}

/** Ce qui s'affiche d'un mot tapé : caractères invisibles retirés, espaces de bord retirés, espaces intérieurs réduits. */
function cleanWord(word: string): string {
  return word
    .normalize('NFC')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim()
}

/** Forme lisible de comparaison : minuscules, sans accents ni ligatures ni caractères invisibles, apostrophes unifiées, espaces réduits. */
export function normalizeWord(word: string): string {
  return word
    .normalize('NFD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const NOT_LETTERS = /[^\p{L}]+/gu

/**
 * Les lettres seules de la forme comparée : un mot se mesure et se compare sur elles. Ponctuation,
 * chiffres, espaces et caractères invisibles ne comptent pas : « Banane! », « banane. »,
 * « Ba-nane », « Banane2 » et « B\u200banane » sont un seul et même mot, et « b. » n'a qu'une lettre.
 */
export function wordLetters(word: string): string {
  return normalizeWord(word).replace(NOT_LETTERS, '')
}

/**
 * Lettre : le mot commence par elle ; syllabe : elle tient d'un seul morceau dans l'un de ses mots
 * (« chat rapide » ne contient pas TRA) ; thème : rien de vérifiable, il faut seulement des lettres.
 * Que le mot existe, seule la table en juge (contestation).
 */
export function wordMatchesChallenge(word: string, challenge: PcChallenge): boolean {
  const letters = wordLetters(word)
  if (letters.length === 0) return false
  const target = wordLetters(challenge.value)
  switch (challenge.kind) {
    case 'theme':
      return true
    case 'letter':
      return target.length > 0 && letters.startsWith(target)
    case 'syllable':
      return target.length > 0 && normalizeWord(word).split(NOT_LETTERS).some((run) => run.includes(target))
    default:
      return false
  }
}

/** Pourquoi un mot tapé serait refusé (null : il passe). */
export function pcWordError(state: PcState, word: string): PcError | null {
  const letters = wordLetters(word)
  // Le minimum se compte en lettres (ni accents seuls, ni ponctuation, ni chiffres), le maximum sur ce qui s'affiche.
  if (Array.from(letters).length < PC_WORD_MIN_LENGTH) return 'WORD_TOO_SHORT'
  if (Array.from(cleanWord(word)).length > PC_WORD_MAX_LENGTH) return 'WORD_TOO_LONG'
  if (state.words.some((said) => wordLetters(said.word) === letters)) return 'WORD_ALREADY_SAID'
  if (state.challenge && !wordMatchesChallenge(word, state.challenge)) {
    return state.challenge.kind === 'letter' ? 'WORD_WRONG_LETTER' : 'WORD_MISSING_SYLLABLE'
  }
  return null
}

/**
 * Le joueur vient d'agir : ses explosions « sans rien jouer » repartent de zéro, et un BOUM chez
 * lui pendant cette mèche n'en sera pas une.
 */
const awake = (state: PcState, playerId: string): Pick<PcState, 'idleBooms' | 'played'> => ({
  idleBooms: { ...state.idleBooms, [playerId]: 0 },
  played: state.played.includes(playerId) ? state.played : [...state.played, playerId],
})

/**
 * Le porteur passe la bombe au joueur actif suivant. En local, le mot est dit à voix haute (pas de
 * `word`) ; en ligne, `by` (l'acteur) et `word` (le mot tapé) sont vérifiés. Une passe arrivée
 * après l'échéance ne s'applique pas : la bombe explose chez celui qui la tenait.
 */
export function pass(state: PcState, input: { now: number; by?: string; word?: string }): PcResult {
  if (state.phase !== 'burning') return fail('WRONG_PHASE')
  const live = resolveIfExpired(state, input.now)
  if (live !== state) return ok(live)
  if (input.by !== undefined && input.by !== state.holder) return fail('NOT_HOLDER')
  let words = state.words
  let openWord: number | null = null
  if (input.word !== undefined) {
    const error = pcWordError(state, input.word)
    if (error) return fail(error)
    words = [...state.words, { player: state.holder, word: cleanWord(input.word), struck: false }]
    openWord = words.length - 1
  }
  return ok({
    ...state,
    holder: nextActiveId(state, state.holder),
    passes: state.passes + 1,
    rejectsInARow: 0,
    words,
    openWord,
    contests: [],
    ...awake(state, state.holder),
  })
}

/**
 * (En ligne) Un joueur a tapé un mot que le serveur a refusé : il joue, même sans réussir. Un refus
 * ne s'enregistre pas (la route n'écrit que ce qui passe) : l'écran du porteur envoie ce signe à
 * part, une fois par mèche. Rend le MÊME objet quand il n'y a rien à noter.
 */
export function noteAttempt(state: PcState, input: { by: string; now: number }): PcResult {
  if (state.phase !== 'burning') return fail('WRONG_PHASE')
  if (!isPcPlayerActive(state, input.by)) return fail('UNKNOWN_PLAYER')
  // Noté AVANT de juger la mèche : le mot refusé l'a précédée, une passe tardive l'aurait fait sauter.
  const noted = state.played.includes(input.by) ? state : { ...state, ...awake(state, input.by) }
  return ok(resolveIfExpired(noted, input.now))
}

/** (Local) La table rejette le mot du porteur : il garde la bombe ; au 2e rejet de suite, 1 pénalité. */
export function reject(state: PcState, now: number): PcResult {
  if (state.phase !== 'burning') return fail('WRONG_PHASE')
  const live = resolveIfExpired(state, now)
  if (live !== state) return ok(live)
  const rejects = state.rejectsInARow + 1
  if (rejects < PC_REJECTS_FOR_PENALTY) return ok({ ...state, rejectsInARow: rejects })
  return ok({ ...state, rejectsInARow: 0, penalties: bump(state.penalties, state.holder) })
}

/**
 * Qui peut contester le mot ouvert : les joueurs actifs, sauf son auteur et le porteur — celui à
 * qui le mot vient d'être passé gagnerait à le voir rayé, puisque la bombe repartirait.
 */
function contestVoters(state: PcState): string[] {
  const author = state.openWord === null ? undefined : state.words[state.openWord]?.player
  return activePlayerIds(state).filter((id) => id !== author && id !== state.holder)
}

/**
 * Contestations qui rayent le mot ouvert : la moitié des votants, arrondie au supérieur, et jamais
 * moins de PC_CONTEST_MIN_VOTES. Null quand la table est trop petite pour trancher (moins de
 * quatre joueurs actifs) : un votant seul rayerait tous les mots de son voisin, gratuitement.
 */
export function contestThreshold(state: PcState): number | null {
  const voters = contestVoters(state).length
  if (voters < PC_CONTEST_MIN_VOTES) return null
  return Math.max(PC_CONTEST_MIN_VOTES, Math.ceil(voters / 2))
}

/**
 * (En ligne) Un joueur conteste le dernier mot tant que son nouveau porteur n'a pas repassé la
 * bombe, quel que soit le défi : le serveur vérifie la lettre, la syllabe et les mots déjà dits,
 * pas que le mot existe ni qu'il colle au thème. Au seuil, le mot est rayé, la bombe revient à
 * son auteur, qui prend 1 pénalité.
 */
export function contest(state: PcState, input: { by: string; now: number }): PcResult {
  if (state.phase !== 'burning') return fail('WRONG_PHASE')
  const live = resolveIfExpired(state, input.now)
  if (live !== state) return ok(live)
  const index = state.openWord
  const target = index === null ? undefined : state.words[index]
  if (index === null || !target || target.struck) return fail('NOTHING_TO_CONTEST')
  if (!isPcPlayerActive(state, input.by)) return fail('UNKNOWN_PLAYER')
  if (input.by === target.player) return fail('OWN_WORD')
  if (input.by === state.holder) return fail('HOLDER_CANNOT_CONTEST')
  const threshold = contestThreshold(state)
  if (threshold === null) return fail('CONTEST_NEEDS_MORE_PLAYERS')
  if (state.contests.includes(input.by)) return fail('ALREADY_CONTESTED')
  // Un vote déjà posé ne compte plus si son auteur est parti ou tient désormais la bombe.
  const voters = contestVoters(state)
  const contests = [...state.contests, input.by].filter((id) => voters.includes(id))
  const acted = awake(state, input.by)
  if (contests.length < threshold) return ok({ ...state, contests, ...acted })
  return ok({
    ...state,
    words: state.words.map((said, i) => (i === index ? { ...said, struck: true } : said)),
    holder: target.player,
    rejectsInARow: 0,
    openWord: null,
    contests: [],
    penalties: bump(state.penalties, target.player),
    ...acted,
  })
}

export function isLastRound(state: Pick<PcState, 'settings' | 'roundIndex'>): boolean {
  return state.settings.rounds !== PC_UNLIMITED_ROUNDS && state.roundIndex + 1 >= state.settings.rounds
}

function finishState(state: PcState): PcState {
  return { ...state, phase: 'finished', openWord: null, contests: [], roundStartedAt: null, explodeAt: null }
}

/** Manche abandonnée avant son BOUM : retour avant l'allumage, scores acquis conservés. */
function abandonRound(state: PcState): PcState {
  return {
    ...state,
    phase: 'ready',
    challenge: null,
    passes: 0,
    rejectsInARow: 0,
    words: [],
    openWord: null,
    contests: [],
    roundStartedAt: null,
    explodeAt: null,
    played: [],
  }
}

/**
 * Après le BOUM : manche suivante (la bombe commence chez le perdant), ou fin de partie.
 *
 * `skipIdle` (en ligne) : un joueur qui ne joue plus — téléphone verrouillé, appli fermée sans
 * « Quitter » — ne bloque pas la table. Si la bombe n'a pas bougé de toute la manche, la suivante
 * repart du voisin du perdant ; après PC_IDLE_BOOMS explosions sans rien jouer, le perdant est mis
 * de côté (sauté comme un parti) jusqu'à son retour (rejoin). Jamais quand il ne resterait qu'un
 * joueur : la partie s'arrêterait net pour l'autre, qui joue. À deux, seule la règle du voisin vaut.
 */
export function nextRound(state: PcState, options: { skipIdle?: boolean } = {}): PcResult {
  if (state.phase !== 'boom') return fail('WRONG_PHASE')
  if (isLastRound(state)) return ok(finishState(state))
  const loser = state.lastBoom?.playerId ?? state.holder
  const idle =
    options.skipIdle === true &&
    isPcPlayerActive(state, loser) &&
    (state.idleBooms[loser] ?? 0) >= PC_IDLE_BOOMS &&
    activePlayerIds(state).length > PC_MIN_PLAYERS
  const table: PcState = idle ? { ...state, absent: [...state.absent, loser] } : state
  if (activePlayerIds(table).length < PC_MIN_PLAYERS) return ok(finishState(table))
  const stalled = options.skipIdle === true && state.lastBoom?.passes === 0
  return ok({
    ...abandonRound(table),
    roundIndex: table.roundIndex + 1,
    holder: isPcPlayerActive(table, loser) && !stalled ? loser : nextActiveId(table, loser),
  })
}

/** « Terminer » : la manche en cours est abandonnée, sauf si sa mèche était déjà arrivée au bout. */
export function finish(state: PcState, now: number): PcResult {
  if (state.phase === 'finished') return fail('WRONG_PHASE')
  return ok(finishState(resolveIfExpired(state, now)))
}

/**
 * (En ligne) Un joueur s'en va : il est sauté ; s'il tenait la bombe, elle passe au suivant actif.
 * S'il reste moins de deux joueurs, la mèche en cours est éteinte (retour avant l'allumage) mais
 * la partie n'est PAS close ici : c'est l'allumage suivant, refusé faute de joueurs, qui la
 * termine — par la route d'action, la seule qui enregistre les résultats et ferme le journal.
 */
export function leave(state: PcState, playerId: string, now: number): PcResult {
  if (!state.playerIds.includes(playerId)) return fail('UNKNOWN_PLAYER')
  if (state.absent.includes(playerId)) return ok(state)
  // Une mèche arrivée au bout avant le départ explose d'abord chez celui qui tenait la bombe.
  const settled = resolveIfExpired(state, now)
  let next: PcState = {
    ...settled,
    absent: [...settled.absent, playerId],
    contests: settled.contests.filter((id) => id !== playerId),
  }
  if (next.phase === 'finished') return ok(next)
  if (next.openWord !== null && next.words[next.openWord]?.player === playerId) {
    next = { ...next, openWord: null, contests: [] }
  }
  if (next.holder === playerId) next = { ...next, holder: nextActiveId(next, playerId), rejectsInARow: 0 }
  if (next.phase === 'burning' && activePlayerIds(next).length < PC_MIN_PLAYERS) next = abandonRound(next)
  return ok(next)
}

/** (En ligne) Retour d'un joueur parti ou mis de côté : il reprend sa place dans l'ordre de passe. */
export function rejoin(state: PcState, playerId: string): PcResult {
  if (!state.playerIds.includes(playerId)) return fail('UNKNOWN_PLAYER')
  if (!state.absent.includes(playerId)) return ok(state)
  return ok({ ...state, absent: state.absent.filter((id) => id !== playerId), ...awake(state, playerId) })
}

// ─── Classement et barème ────────────────────────────────────────────────────

export type PcRankingEntry = {
  playerId: string
  explosions: number
  penalties: number
  /** Rang « compétition » (1, 1, 3) : le moins d'explosions, puis le moins de pénalités. */
  rank: number
  won: boolean
}

/** Ne lit que la table et les compteurs : la vue publique en ligne (sans échéance ni graine) suffit. */
export function ranking(state: Pick<PcState, 'playerIds' | 'explosions' | 'penalties'>): PcRankingEntry[] {
  const rows = state.playerIds.map((playerId, order) => ({
    playerId,
    order,
    explosions: state.explosions[playerId] ?? 0,
    penalties: state.penalties[playerId] ?? 0,
  }))
  rows.sort((a, b) => a.explosions - b.explosions || a.penalties - b.penalties || a.order - b.order)
  const entries: PcRankingEntry[] = []
  rows.forEach((row, i) => {
    const previous = i > 0 ? rows[i - 1] : undefined
    const tied =
      previous !== undefined && previous.explosions === row.explosions && previous.penalties === row.penalties
    const rank = tied ? entries[i - 1].rank : i + 1
    entries.push({ playerId: row.playerId, explosions: row.explosions, penalties: row.penalties, rank, won: rank === 1 })
  })
  return entries
}

export type PcAmbiance = 'alcool' | 'soft'

/** Total affiché : gorgées en ambiance alcool, points de pénalité en Soft. */
export function pcTally(counts: { explosions: number; penalties: number }, ambiance: PcAmbiance): number {
  return ambiance === 'soft'
    ? counts.explosions * PC_EXPLOSION_POINTS + counts.penalties * PC_PENALTY_POINTS
    : counts.explosions * PC_EXPLOSION_SIPS + counts.penalties * PC_PENALTY_SIPS
}

// ─── Vue publique ────────────────────────────────────────────────────────────

export type PcPublicState = Omit<PcState, 'explodeAt' | 'rngState' | 'usedChallenges' | 'idleBooms' | 'played'>

/**
 * Vue sans secret (joueur, spectateur, TV) : ni l'échéance, ni la graine qui la rejouerait.
 * La mémoire des défis servis (jusqu'à 300 entrées), le compte des explosions sans rien jouer et
 * qui a joué pendant la mèche ne servent qu'au serveur : un joueur mis de côté se lit dans `absent`.
 */
export function toPcPublicView(state: PcState): PcPublicState {
  const {
    explodeAt: _explodeAt,
    rngState: _rngState,
    usedChallenges: _usedChallenges,
    idleBooms: _idleBooms,
    played: _played,
    ...visible
  } = state
  return visible
}

// ─── Reprise locale (useResumableLocalGame) ──────────────────────────────────

export const PC_SAVE_ID = 'patate-chaude'
/** À incrémenter dès que la forme de PcSave change : l'ancienne sauvegarde est jetée. */
export const PC_SAVE_VERSION = 1

/** Même forme que l'état (déjà JSON, identifiants seulement), mais jamais en pleine mèche. */
export type PcSave = PcState

/**
 * Une mèche ne se sauvegarde pas : une manche interrompue (onglet rechargé) reprend AVANT
 * l'allumage, bombe chez celui qui la tenait, scores et pénalités déjà acquis conservés.
 */
export function toPcSave(state: PcState): PcSave {
  return state.phase === 'burning' ? abandonRound(state) : state
}

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

function readCounts(value: unknown, playerIds: readonly string[]): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const counts: Record<string, number> = {}
  for (const id of playerIds) {
    const count = raw[id] ?? 0
    if (!isNonNegativeInt(count)) return null
    counts[id] = count
  }
  return counts
}

function readChallenge(value: unknown): PcChallenge | null | undefined {
  if (value === null) return null
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const kind = PC_CHALLENGE_KINDS.find((k) => k === raw.kind)
  if (!kind || typeof raw.value !== 'string' || !raw.value.trim()) return undefined
  if (raw.id !== undefined && typeof raw.id !== 'string') return undefined
  return typeof raw.id === 'string' ? { kind, id: raw.id, value: raw.value } : { kind, value: raw.value }
}

function readBoom(value: unknown, playerIds: readonly string[]): PcBoom | null | undefined {
  if (value === null) return null
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.playerId !== 'string' || !playerIds.includes(raw.playerId)) return undefined
  if (!isNonNegativeInt(raw.round) || !isNonNegativeInt(raw.fuseMs) || !isNonNegativeInt(raw.passes)) return undefined
  return { playerId: raw.playerId, round: raw.round, fuseMs: raw.fuseMs, passes: raw.passes }
}

/**
 * Sauvegarde → état pour la table ACTUELLE (mêmes joueurs, ordre de la table courante).
 * Null au moindre champ illisible : une partie neuve plutôt qu'un écran planté.
 */
export function restorePcSave(save: unknown, playerIds: readonly string[]): PcState | null {
  if (!save || typeof save !== 'object') return null
  const s = save as Record<string, unknown>
  const settings = parsePcSettings(s.settings)
  if (!settings) return null

  const table = [...playerIds]
  if (table.length < PC_MIN_PLAYERS || new Set(table).size !== table.length) return null
  if (!isStringArray(s.playerIds) || s.playerIds.length !== table.length) return null
  const saved = new Set(s.playerIds)
  if (saved.size !== table.length || table.some((id) => !saved.has(id))) return null

  if (s.phase !== 'ready' && s.phase !== 'boom') return null
  if (!isNonNegativeInt(s.roundIndex)) return null
  if (settings.rounds !== PC_UNLIMITED_ROUNDS && s.roundIndex >= settings.rounds) return null
  if (typeof s.holder !== 'string' || !table.includes(s.holder)) return null
  if (!isStringArray(s.absent) || s.absent.some((id) => !table.includes(id))) return null
  if (!isNonNegativeInt(s.passes) || !isNonNegativeInt(s.rejectsInARow)) return null
  if (s.rejectsInARow >= PC_REJECTS_FOR_PENALTY) return null

  const explosions = readCounts(s.explosions, table)
  const penalties = readCounts(s.penalties, table)
  // Absent d'une sauvegarde plus ancienne que ce compteur : tout le monde repart de zéro.
  const idleBooms = readCounts(s.idleBooms ?? {}, table)
  if (!explosions || !penalties || !idleBooms) return null
  const challenge = readChallenge(s.challenge)
  if (challenge === undefined) return null
  const lastBoom = readBoom(s.lastBoom, table)
  if (lastBoom === undefined) return null
  if (s.phase === 'boom' && lastBoom === null) return null

  if (!Array.isArray(s.words)) return null
  const words: PcWord[] = []
  for (const item of s.words) {
    if (!item || typeof item !== 'object') return null
    const word = item as Record<string, unknown>
    if (typeof word.player !== 'string' || !table.includes(word.player)) return null
    if (typeof word.word !== 'string' || typeof word.struck !== 'boolean') return null
    words.push({ player: word.player, word: word.word, struck: word.struck })
  }
  if (!isStringArray(s.usedChallenges)) return null
  if (typeof s.rngState !== 'number' || !Number.isFinite(s.rngState)) return null

  return {
    settings,
    playerIds: table,
    absent: [...s.absent],
    roundIndex: s.roundIndex,
    phase: s.phase,
    challenge,
    holder: s.holder,
    passes: s.passes,
    rejectsInARow: s.rejectsInARow,
    words,
    // Rien n'est contestable entre deux manches, ni à la reprise.
    openWord: null,
    contests: [],
    roundStartedAt: null,
    explodeAt: null,
    lastBoom,
    explosions,
    penalties,
    idleBooms,
    // Jamais en pleine mèche : personne n'a encore joué la suivante.
    played: [],
    usedChallenges: s.usedChallenges.slice(-USED_CHALLENGES_LIMIT),
    rngState: s.rngState >>> 0,
  }
}
