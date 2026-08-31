import { createRng, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * PETIT BAC — moteur PUR, serveur-autoritaire.
 *
 * Une lettre, cinq catégories, tout le monde écrit en même temps. Le premier
 * qui a rempli ses cinq cases crie STOP et gèle la table. Comptage
 * automatique : 2 pts si la réponse est unique, 1 pt si elle est en doublon,
 * 0 si vide ou mauvaise lettre. À la révélation, chaque joueur peut contester
 * une réponse — la majorité des autres joueurs l'invalide.
 */

export const PBC_MIN_PLAYERS = 2
export const PBC_MAX_PLAYERS = 16
export const PBC_COUNTDOWN_MS = 5_000
/** Temps d'écriture (fin anticipée dès qu'un joueur crie STOP). */
export const PBC_WRITE_MS = 120_000
/** Fenêtre après le STOP pour que les autres clients envoient leurs brouillons. */
export const PBC_FLUSH_MS = 6_000
export const PBC_ROUND_OPTIONS = [3, 5, 8] as const
export const PBC_DEFAULT_ROUNDS = 3
export const PBC_CATEGORY_COUNT = 5
/** Lettres jouables (on écarte K/Q/W/X/Y/Z, trop punitives en français). */
export const PBC_LETTERS = 'ABCDEFGHIJLMNOPRSTUV'.split('')

/** Ids des catégories — les libellés vivent dans l'i18n (×4 langues). */
export const PBC_CATEGORY_IDS = [
  'prenom',
  'animal',
  'ville',
  'pays',
  'metier',
  'objet',
  'fruit-legume',
  'celebrite',
  'marque',
  'sport',
  'film-serie',
  'plat',
  'musique',
  'personnage-fiction',
  'vetement',
  'boisson',
  'dessert',
  'instrument',
  'transport',
  'jeu-jouet',
  'corps',
  'fleur-plante',
  'adjectif',
  'monument-lieu',
] as const

export type PbcCategoryId = (typeof PBC_CATEGORY_IDS)[number]

export type PbcPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** Score cumulé des manches CLOSES (la manche courante s'ajoute au CONTINUE). */
  total: number
}

export type PbcPhase = 'countdown' | 'write' | 'flush' | 'reveal' | 'finished'

export type PbcState = TimedPhaseState & {
  version: number
  phase: PbcPhase
  players: PbcPlayer[]
  /** Les 5 catégories de la MANCHE COURANTE (roulement à chaque manche). */
  categories: string[]
  /** Jeux de 5 catégories pré-tirés, un par manche (tranches disjointes du pool). */
  categoryRounds: string[][]
  /** Une lettre par manche, tirées sans doublon à la création. */
  letters: string[]
  round: number
  /** Réponses DÉPOSÉES (STOP ou flush) — secrètes jusqu'au reveal. */
  answers: Record<string, string[]>
  /** Qui a crié STOP cette manche (null si fin par chrono). */
  stopperId: string | null
  /** Points de la manche courante, calculés à l'entrée du reveal. */
  roundPoints: Record<string, number[]> | null
  /** Contestations : `${playerId}:${catIndex}` → ids des votants. */
  contests: Record<string, string[]>
  /** Cases invalidées par la majorité (clés `${playerId}:${catIndex}`). */
  rejected: string[]
  rematchVotes: string[]
  rngState: number
}

export type PbcAction =
  | { type: 'STOP'; playerId: string; answers: string[]; now: number }
  | { type: 'SUBMIT'; playerId: string; answers: string[]; now: number }
  | { type: 'CONTEST'; playerId: string; targetId: string; category: number; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class PbcEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'PbcEngineError'
  }
}

export type PbcInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function pbcActive(state: PbcState): PbcPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

export function pbcCurrentLetter(state: PbcState): string {
  return state.letters[state.round] ?? '?'
}

/** Normalise pour comparer/valider : minuscules, sans accents, espaces réduits. */
export function pbcNormalize(answer: string): string {
  return answer
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Une réponse compte si elle a ≥ 2 caractères et commence par la lettre. */
export function pbcIsValid(answer: string, letter: string): boolean {
  const norm = pbcNormalize(answer)
  return norm.length >= 2 && norm.startsWith(letter.toLowerCase())
}

function sanitizeAnswers(answers: string[], count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i += 1) {
    const raw = typeof answers[i] === 'string' ? answers[i] : ''
    out.push(raw.slice(0, 40))
  }
  return out
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createPbcState(
  players: PbcInitialPlayer[],
  seed: string | number,
  now: number = Date.now(),
  roundsCount: number = PBC_DEFAULT_ROUNDS
): PbcState {
  if (players.length < PBC_MIN_PLAYERS) throw new PbcEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > PBC_MAX_PLAYERS) throw new PbcEngineError('TOO_MANY_PLAYERS')
  if (!Number.isInteger(roundsCount) || roundsCount < 1 || roundsCount > PBC_LETTERS.length) {
    throw new PbcEngineError('INVALID_ROUNDS_COUNT')
  }

  const rng: SeededRng = createRng(seed)
  const letters = rng.shuffle([...PBC_LETTERS]).slice(0, roundsCount)
  // Un jeu de 5 catégories PAR MANCHE : on découpe le pool mélangé en
  // tranches disjointes (variété maximale), remélangé quand il est épuisé.
  const categoryRounds: string[][] = []
  let pool: string[] = []
  for (let r = 0; r < roundsCount; r += 1) {
    if (pool.length < PBC_CATEGORY_COUNT) pool = rng.shuffle([...PBC_CATEGORY_IDS])
    categoryRounds.push(pool.slice(0, PBC_CATEGORY_COUNT))
    pool = pool.slice(PBC_CATEGORY_COUNT)
  }

  return {
    version: 1,
    ...enterPhase(0, 'countdown', PBC_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: Boolean(p.isBot),
      leftAt: null,
      total: 0,
    })),
    categories: categoryRounds[0],
    categoryRounds,
    letters,
    round: 0,
    answers: {},
    stopperId: null,
    roundPoints: null,
    contests: {},
    rejected: [],
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

function enterWrite(state: PbcState, now: number): PbcState {
  return {
    ...state,
    // Roulement : les 5 catégories de la manche courante (filet = celles en cours).
    categories: state.categoryRounds[state.round] ?? state.categories,
    answers: {},
    stopperId: null,
    roundPoints: null,
    contests: {},
    rejected: [],
    ...enterPhase(state.phaseSeq, 'write', PBC_WRITE_MS, now),
    phase: 'write',
    version: state.version + 1,
  }
}

/** Les bots (déserteurs convertis) déposent une copie blanche d'office. */
function enterFlush(state: PbcState, now: number): PbcState {
  const answers = { ...state.answers }
  for (const p of pbcActive(state)) {
    if (p.isBot && !answers[p.id]) {
      answers[p.id] = Array.from({ length: state.categories.length }, () => '')
    }
  }
  const next = {
    ...state,
    answers,
    ...enterPhase(state.phaseSeq, 'flush', PBC_FLUSH_MS, now),
    phase: 'flush' as const,
    version: state.version + 1,
  }
  if (pbcActive(next).every((p) => next.answers[p.id])) return enterReveal(next, now)
  return next
}

/** Comptage : 0 si invalide, 1 si doublon (réponses normalisées égales), 2 si unique. */
function scoreRound(state: PbcState): Record<string, number[]> {
  const letter = pbcCurrentLetter(state)
  const points: Record<string, number[]> = {}
  const active = pbcActive(state)
  for (let cat = 0; cat < state.categories.length; cat += 1) {
    const counts = new Map<string, number>()
    for (const p of active) {
      const answer = state.answers[p.id]?.[cat] ?? ''
      if (!pbcIsValid(answer, letter)) continue
      const key = pbcNormalize(answer)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    for (const p of state.players) {
      if (!points[p.id]) points[p.id] = []
      const answer = state.answers[p.id]?.[cat] ?? ''
      if (!p.leftAt && pbcIsValid(answer, letter)) {
        points[p.id][cat] = (counts.get(pbcNormalize(answer)) ?? 0) > 1 ? 1 : 2
      } else {
        points[p.id][cat] = 0
      }
    }
  }
  return points
}

function enterReveal(state: PbcState, now: number): PbcState {
  return {
    ...state,
    roundPoints: scoreRound(state),
    ...enterPhase(state.phaseSeq, 'reveal', null, now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reducePbc(state: PbcState, action: PbcAction): PbcState {
  switch (action.type) {
    case 'STOP': {
      if (state.phase !== 'write') throw new PbcEngineError('NOT_WRITE_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new PbcEngineError('UNKNOWN_PLAYER')
      const answers = sanitizeAnswers(action.answers, state.categories.length)
      if (answers.some((a) => a.trim().length === 0)) throw new PbcEngineError('INCOMPLETE_STOP')
      return enterFlush(
        {
          ...state,
          answers: { ...state.answers, [actor.id]: answers },
          stopperId: actor.id,
        },
        action.now
      )
    }

    case 'SUBMIT': {
      if (state.phase !== 'flush') throw new PbcEngineError('NOT_FLUSH_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new PbcEngineError('UNKNOWN_PLAYER')
      if (state.answers[actor.id]) throw new PbcEngineError('ALREADY_SUBMITTED')
      const answers = {
        ...state.answers,
        [actor.id]: sanitizeAnswers(action.answers, state.categories.length),
      }
      const next = { ...state, answers, version: state.version + 1 }
      if (pbcActive(next).every((p) => answers[p.id])) return enterReveal(next, action.now)
      return next
    }

    case 'CONTEST': {
      if (state.phase !== 'reveal') throw new PbcEngineError('NOT_REVEAL')
      const voter = state.players.find((p) => p.id === action.playerId)
      if (!voter || voter.leftAt) throw new PbcEngineError('UNKNOWN_PLAYER')
      // Un bot (déserteur converti) ne vote jamais : il ne compte ni au
      // numérateur ni au dénominateur de la majorité (symétrie ci-dessous).
      if (voter.isBot) throw new PbcEngineError('BOT_CANNOT_CONTEST')
      if (voter.id === action.targetId) throw new PbcEngineError('CANNOT_CONTEST_SELF')
      const target = state.players.find((p) => p.id === action.targetId)
      if (!target) throw new PbcEngineError('UNKNOWN_TARGET')
      const cat = action.category
      if (!Number.isInteger(cat) || cat < 0 || cat >= state.categories.length) {
        throw new PbcEngineError('INVALID_CATEGORY')
      }
      const key = `${action.targetId}:${cat}`
      if (state.rejected.includes(key)) throw new PbcEngineError('ALREADY_REJECTED')
      if ((state.roundPoints?.[action.targetId]?.[cat] ?? 0) === 0) {
        throw new PbcEngineError('NOTHING_TO_CONTEST')
      }
      const voters = state.contests[key] ?? []
      if (voters.includes(voter.id)) throw new PbcEngineError('ALREADY_CONTESTED')
      const nextVoters = [...voters, voter.id]
      // Majorité STRICTE des autres joueurs actifs NON-bots (le propriétaire
      // ne vote pas). Les bots — déserteurs convertis — ne contestent jamais :
      // les compter au dénominateur rendrait la majorité inatteignable dès
      // qu'ils remplacent la moitié des votants potentiels.
      const others = pbcActive(state).filter((p) => !p.isBot && p.id !== action.targetId).length
      const threshold = Math.floor(others / 2) + 1
      if (nextVoters.length >= threshold) {
        const roundPoints = { ...(state.roundPoints ?? {}) }
        roundPoints[action.targetId] = [...(roundPoints[action.targetId] ?? [])]
        roundPoints[action.targetId][cat] = 0
        return {
          ...state,
          contests: { ...state.contests, [key]: nextVoters },
          rejected: [...state.rejected, key],
          roundPoints,
          version: state.version + 1,
        }
      }
      return {
        ...state,
        contests: { ...state.contests, [key]: nextVoters },
        version: state.version + 1,
      }
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new PbcEngineError('NOT_REVEAL')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new PbcEngineError('UNKNOWN_PLAYER')
      }
      const players = state.players.map((p) => ({
        ...p,
        total: p.total + (state.roundPoints?.[p.id] ?? []).reduce((a, b) => a + b, 0),
      }))
      const nextRound = state.round + 1
      if (nextRound >= state.letters.length) {
        return {
          ...state,
          players,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          version: state.version + 1,
        }
      }
      return enterWrite({ ...state, players, round: nextRound }, action.now)
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new PbcEngineError(check.error)
      if (state.phase === 'countdown') return enterWrite(state, action.now)
      if (state.phase === 'write') return enterFlush(state, action.now)
      if (state.phase === 'flush') return enterReveal(state, action.now)
      throw new PbcEngineError('NOTHING_TO_ADVANCE')
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new PbcEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new PbcEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      const next: PbcState = {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
      // Sa feuille n'est plus attendue : si tous les actifs restants ont
      // déposé, la manche se dépouille tout de suite.
      if (next.phase === 'flush' && pbcActive(next).every((p) => next.answers[p.id])) {
        return enterReveal(next, action.at)
      }
      return next
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new PbcEngineError('CANNOT_REJOIN')
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      // PAS de conversion en bot au Petit Bac : un bot « copie blanche » ne
      // fait que polluer le reveal (colonnes vides) et fausser la table. Un
      // déserteur reste simplement écarté (inactif — exclu du flush, du score
      // et des contestations) et peut revenir à tout moment via REJOIN.
      throw new PbcEngineError('NOTHING_TO_REPLACE')
    }

    default: {
      const exhaustive: never = action
      throw new PbcEngineError(`UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`)
    }
  }
}

// ─── Acteur courant ──────────────────────────────────────────────────────────

/** Phases simultanées ; en `reveal`, le premier joueur actif mène le « continuer ». */
export function currentPbcActorId(state: PbcState): string | null {
  if (state.phase === 'reveal') return pbcActive(state)[0]?.id ?? null
  return null
}

// ─── Vues ────────────────────────────────────────────────────────────────────

export type PbcPlayerView = PbcPlayer & { hasSubmitted: boolean }

export type PbcRevealCell = {
  playerId: string
  answer: string
  points: number
  contestCount: number
  iContested: boolean
  rejected: boolean
}

export type PbcClientView = Omit<PbcState, 'rngState' | 'players' | 'letters' | 'categoryRounds' | 'answers' | 'contests' | 'roundPoints'> & {
  phaseKey: string
  totalRounds: number
  letter: string
  players: PbcPlayerView[]
  /** Mes réponses déposées (null si rien envoyé cette manche). */
  myAnswers: string[] | null
  /** Grille publique du reveal : [catIndex][joueur] (null hors reveal). */
  revealGrid: PbcRevealCell[][] | null
  /** Points de la manche courante par joueur (null hors reveal). */
  roundTotals: Record<string, number> | null
}

/** Vue PAR JOUEUR : réponses secrètes pendant write/flush, publiques au reveal. */
export function toPbcClientView(state: PbcState, viewerId: string): PbcClientView {
  const { rngState: _rng, players, letters, categoryRounds, answers, contests, roundPoints, ...rest } = state
  void _rng
  void letters
  void categoryRounds
  const showReveal = state.phase === 'reveal'
  let revealGrid: PbcRevealCell[][] | null = null
  let roundTotals: Record<string, number> | null = null
  if (showReveal && roundPoints) {
    const active = pbcActive(state)
    revealGrid = state.categories.map((_, cat) =>
      active.map((p) => {
        const key = `${p.id}:${cat}`
        const voters = contests[key] ?? []
        return {
          playerId: p.id,
          answer: answers[p.id]?.[cat] ?? '',
          points: roundPoints[p.id]?.[cat] ?? 0,
          contestCount: voters.length,
          iContested: voters.includes(viewerId),
          rejected: state.rejected.includes(key),
        }
      })
    )
    roundTotals = {}
    for (const p of state.players) {
      roundTotals[p.id] = (roundPoints[p.id] ?? []).reduce((a, b) => a + b, 0)
    }
  }
  return {
    ...rest,
    phaseKey: phaseKey(state),
    totalRounds: state.letters.length,
    letter: state.phase === 'countdown' ? '?' : pbcCurrentLetter(state),
    myAnswers: answers[viewerId] ?? null,
    revealGrid,
    roundTotals,
    players: players.map((p) => ({ ...p, hasSubmitted: Boolean(answers[p.id]) })),
  }
}

export function toPbcSpectatorView(state: PbcState): PbcClientView {
  return toPbcClientView(state, '')
}
