import { createRng, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * L'IMPOSTEUR (Undercover apéro) — moteur PUR, serveur-autoritaire.
 *
 * Une paire de mots PROCHES est tirée (ex. plage/piscine) : les civils
 * reçoivent l'un, le ou les imposteurs l'autre. PERSONNE ne connaît son camp —
 * chacun ne voit que « son » mot. À chaque manche : un indice chacun (texte
 * court, chronométré), puis vote secret simultané, puis révélation du voté
 * (son mot + son camp). Village gagne quand tous les imposteurs sont sortis ;
 * un imposteur gagne s'il atteint les 3 derniers.
 *
 * Phases chronométrées via src/lib/online/phase-clock.ts : le serveur pose
 * `phaseEndsAt`, les clients affichent le compte à rebours et envoient un
 * `ADVANCE` à l'échéance — validé par l'horloge SERVEUR uniquement.
 */

export const IMPOSTEUR_MIN_PLAYERS = 3
export const IMPOSTEUR_MAX_PLAYERS = 10
/** Compte à rebours d'échauffement au lancement (5… 4… 3… 2… 1…). */
export const IMPOSTEUR_COUNTDOWN_MS = 5_000
/** Temps pour donner SON indice. */
export const IMPOSTEUR_CLUE_MS = 45_000
/** Temps pour voter (les retardataires s'abstiennent). */
export const IMPOSTEUR_VOTE_MS = 60_000
/** Longueur maximale d'un indice. */
export const IMPOSTEUR_CLUE_MAX_LEN = 30
/** Indice automatique d'un joueur muet (timeout ou bot). */
export const IMPOSTEUR_EMPTY_CLUE = '…'
/** Gorgées : civil éliminé à tort. */
export const IMPOSTEUR_SIPS_CIVIL_OUT = 3
/** Gorgées : imposteur démasqué = 2 × survivants. */
export const IMPOSTEUR_SIPS_PER_ALIVE = 2

export type ImposteurTeam = 'civil' | 'imposteur'

export type ImposteurWordPair = { a: string; b: string }

export type ImposteurPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** SECRET — son mot (seul le joueur le voit). */
  word: string
  /** SECRET ABSOLU — révélé seulement à l'élimination ou en fin de partie. */
  team: ImposteurTeam
  eliminated: boolean
}

export type ImposteurClue = { playerId: string; text: string; round: number }

/** Résultat PUBLIC d'un vote. */
export type ImposteurReveal = {
  round: number
  /** Décompte public par cible (l'identité des votants reste secrète). */
  tally: Record<string, number>
  eliminatedId: string | null
  tie: boolean
  /** Mot + camp de l'éliminé — publics une fois sorti. */
  word: string | null
  team: ImposteurTeam | null
  sips: number
}

export type ImposteurPhase = 'countdown' | 'clue' | 'vote' | 'reveal' | 'finished'

export type ImposteurState = TimedPhaseState & {
  version: number
  phase: ImposteurPhase
  players: ImposteurPlayer[]
  /** Ordre de parole de la manche courante (vivants uniquement). */
  clueOrder: string[]
  clueTurnIdx: number
  /** Indices PUBLICS (toutes manches). */
  clues: ImposteurClue[]
  /** SECRET — votes en cours (voterId → targetId). */
  pendingVotes: Record<string, string>
  lastReveal: ImposteurReveal | null
  round: number
  winnerTeam: ImposteurTeam | null
  rematchVotes: string[]
  /** Nombre d'imposteurs de la partie (choix hôte ou défaut, figé au lancement). */
  imposteurCount: number
  /** SECRET serveur. */
  rngState: number
}

export type ImposteurAction =
  | { type: 'CLUE'; playerId: string; text: string; now: number }
  | { type: 'VOTE'; playerId: string; targetId: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class ImposteurEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'ImposteurEngineError'
  }
}

export type ImposteurInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function imposteurAlive(state: ImposteurState): ImposteurPlayer[] {
  return state.players.filter((p) => !p.eliminated)
}

export function imposteurCountFor(playerCount: number): number {
  return playerCount >= 7 ? 2 : 1
}

/** Plafond UI : au-delà, le camp imposteur devient trop dur à masquer. */
export const IMPOSTEUR_MAX_COUNT = 3

/**
 * Nombre maximum d'imposteurs autorisé pour une table donnée : toujours
 * minoritaires (strictement moins de la moitié), et plafonné à IMPOSTEUR_MAX_COUNT.
 */
export function maxImposteurCount(playerCount: number): number {
  return Math.min(IMPOSTEUR_MAX_COUNT, Math.max(1, Math.floor((playerCount - 1) / 2)))
}

/** Normalisation permissive (minuscules + sans accents) pour la validation. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Un indice est valide s'il est non vide, court, et ne trahit pas son propre
 * mot : interdit s'il CONTIENT le mot (« piscines » pour « piscine ») ou s'il
 * en est un fragment parlant (≥ 3 lettres : « pisc ») — les tout petits mots
 * accidentels (« la » pour « plage ») restent permis. « … » toujours accepté.
 */
export function isValidClue(text: string, ownWord: string): boolean {
  const trimmed = text.trim()
  if (trimmed === IMPOSTEUR_EMPTY_CLUE) return true
  if (trimmed.length < 1 || trimmed.length > IMPOSTEUR_CLUE_MAX_LEN) return false
  const clue = normalize(trimmed)
  const word = normalize(ownWord)
  if (clue.length === 0 || word.length === 0) return clue.length > 0
  if (clue.includes(word)) return false
  return !(clue.length >= 3 && word.includes(clue))
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createImposteurState(
  players: ImposteurInitialPlayer[],
  pairs: ImposteurWordPair[],
  seed: string | number,
  now: number = Date.now(),
  imposteurCount?: number
): ImposteurState {
  if (players.length < IMPOSTEUR_MIN_PLAYERS) throw new ImposteurEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > IMPOSTEUR_MAX_PLAYERS) throw new ImposteurEngineError('TOO_MANY_PLAYERS')
  if (pairs.length === 0) throw new ImposteurEngineError('NO_WORD_PAIRS')

  const count = imposteurCount ?? imposteurCountFor(players.length)
  if (!Number.isInteger(count) || count < 1 || count > maxImposteurCount(players.length)) {
    throw new ImposteurEngineError('INVALID_IMPOSTEUR_COUNT')
  }

  const rng: SeededRng = createRng(seed)
  const pair = pairs[rng.pickIndex(pairs.length)]
  // Quel côté de la paire est « civil » : aléatoire (le mot ne trahit rien).
  const [civilWord, imposteurWord] = rng.chance(0.5) ? [pair.a, pair.b] : [pair.b, pair.a]

  const shuffledIds = rng.shuffle(players.map((p) => p.id))
  const imposteurIds = new Set(shuffledIds.slice(0, count))

  const withRoles: ImposteurPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    word: imposteurIds.has(p.id) ? imposteurWord : civilWord,
    team: imposteurIds.has(p.id) ? 'imposteur' : 'civil',
    eliminated: false,
  }))

  const clueOrder = rng.shuffle(withRoles.map((p) => p.id))

  return {
    version: 1,
    // La partie s'ouvre sur un compte à rebours : chacun découvre son mot
    // calmement avant que le chrono du premier indice ne démarre.
    ...enterPhase(0, 'countdown', IMPOSTEUR_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withRoles,
    clueOrder,
    clueTurnIdx: 0,
    clues: [],
    pendingVotes: {},
    lastReveal: null,
    round: 1,
    winnerTeam: null,
    rematchVotes: [],
    imposteurCount: count,
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Enregistre l'indice de l'acteur courant puis avance (ou passe au vote). */
function pushClueAndAdvance(state: ImposteurState, text: string, now: number): ImposteurState {
  const actorId = state.clueOrder[state.clueTurnIdx]
  const clues = [...state.clues, { playerId: actorId, text: text.trim(), round: state.round }]
  const nextIdx = state.clueTurnIdx + 1
  if (nextIdx < state.clueOrder.length) {
    return {
      ...state,
      clues,
      clueTurnIdx: nextIdx,
      ...enterPhase(state.phaseSeq, 'clue', IMPOSTEUR_CLUE_MS, now),
      phase: 'clue',
      version: state.version + 1,
    }
  }
  // Tout le monde a parlé → vote secret simultané.
  return {
    ...state,
    clues,
    clueTurnIdx: nextIdx,
    pendingVotes: {},
    ...enterPhase(state.phaseSeq, 'vote', IMPOSTEUR_VOTE_MS, now),
    phase: 'vote',
    version: state.version + 1,
  }
}

/** Dépouille les votes courants → révélation (élimination ou égalité). */
function resolveVotes(state: ImposteurState, now: number): ImposteurState {
  const tally: Record<string, number> = {}
  for (const targetId of Object.values(state.pendingVotes)) {
    tally[targetId] = (tally[targetId] ?? 0) + 1
  }

  let eliminatedId: string | null = null
  let tie = false
  let best = 0
  for (const [targetId, count] of Object.entries(tally)) {
    if (count > best) {
      best = count
      eliminatedId = targetId
      tie = false
    } else if (count === best) {
      tie = true
    }
  }
  if (tie || best === 0) eliminatedId = null

  let word: string | null = null
  let team: ImposteurTeam | null = null
  let sips = 0
  let players = state.players
  if (eliminatedId) {
    const target = state.players.find((p) => p.id === eliminatedId)
    if (target) {
      word = target.word
      team = target.team
      players = state.players.map((p) =>
        p.id === eliminatedId ? { ...p, eliminated: true } : p
      )
      const aliveAfter = players.filter((p) => !p.eliminated).length
      sips =
        target.team === 'imposteur'
          ? IMPOSTEUR_SIPS_PER_ALIVE * aliveAfter
          : IMPOSTEUR_SIPS_CIVIL_OUT
    }
  }

  return {
    ...state,
    players,
    pendingVotes: {},
    lastReveal: {
      round: state.round,
      tally,
      eliminatedId,
      tie: tie && best > 0,
      word,
      team,
      sips,
    },
    ...enterPhase(state.phaseSeq, 'reveal', null, now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceImposteur(state: ImposteurState, action: ImposteurAction): ImposteurState {
  switch (action.type) {
    case 'CLUE': {
      if (state.phase !== 'clue') throw new ImposteurEngineError('NOT_CLUE_PHASE')
      const actorId = state.clueOrder[state.clueTurnIdx]
      if (actorId !== action.playerId) throw new ImposteurEngineError('NOT_YOUR_TURN')
      const actor = state.players.find((p) => p.id === actorId)
      if (!actor || actor.eliminated) throw new ImposteurEngineError('ELIMINATED')
      if (!isValidClue(action.text, actor.word)) throw new ImposteurEngineError('INVALID_CLUE')
      return pushClueAndAdvance(state, action.text, action.now)
    }

    case 'VOTE': {
      if (state.phase !== 'vote') throw new ImposteurEngineError('NOT_VOTE_PHASE')
      const voter = state.players.find((p) => p.id === action.playerId)
      if (!voter || voter.eliminated) throw new ImposteurEngineError('CANNOT_VOTE')
      if (state.pendingVotes[voter.id]) throw new ImposteurEngineError('ALREADY_VOTED')
      const target = state.players.find((p) => p.id === action.targetId)
      if (!target || target.eliminated) throw new ImposteurEngineError('INVALID_TARGET')
      if (target.id === voter.id) throw new ImposteurEngineError('CANNOT_VOTE_SELF')
      const pendingVotes = { ...state.pendingVotes, [voter.id]: target.id }
      const next = { ...state, pendingVotes, version: state.version + 1 }
      // Tous les vivants ont voté → dépouillement immédiat.
      const alive = imposteurAlive(state)
      if (alive.every((p) => pendingVotes[p.id])) return resolveVotes(next, action.now)
      return next
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new ImposteurEngineError(check.error)
      if (state.phase === 'countdown') {
        return {
          ...state,
          ...enterPhase(state.phaseSeq, 'clue', IMPOSTEUR_CLUE_MS, action.now),
          phase: 'clue',
          version: state.version + 1,
        }
      }
      if (state.phase === 'clue') {
        // Le joueur muet donne l'indice automatique « … ».
        return pushClueAndAdvance(state, IMPOSTEUR_EMPTY_CLUE, action.now)
      }
      if (state.phase === 'vote') {
        // Les retardataires s'abstiennent.
        return resolveVotes(state, action.now)
      }
      throw new ImposteurEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new ImposteurEngineError('NOT_REVEAL')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new ImposteurEngineError('UNKNOWN_PLAYER')
      }
      const alive = imposteurAlive(state)
      const imposteursAlive = alive.filter((p) => p.team === 'imposteur')
      if (imposteursAlive.length === 0) {
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          winnerTeam: 'civil',
          version: state.version + 1,
        }
      }
      // L'imposteur gagne en atteignant les 3 derniers — sauf table de 3
      // joueurs, où la partie DÉMARRE à 3 : il doit y survivre jusqu'à 2.
      // Généralisation à N imposteurs : gagné aussi dès que les imposteurs
      // ne sont plus minoritaires parmi les vivants (parité).
      const imposteurWinAt = state.players.length <= 3 ? 2 : 3
      const civilsAlive = alive.length - imposteursAlive.length
      if (imposteursAlive.length >= civilsAlive || alive.length <= imposteurWinAt) {
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          winnerTeam: 'imposteur',
          version: state.version + 1,
        }
      }
      // Nouvelle manche d'indices (ordre = vivants, ordre de table conservé).
      return {
        ...state,
        clueOrder: alive.map((p) => p.id),
        clueTurnIdx: 0,
        pendingVotes: {},
        lastReveal: null,
        round: state.round + 1,
        ...enterPhase(state.phaseSeq, 'clue', IMPOSTEUR_CLUE_MS, action.now),
        phase: 'clue',
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new ImposteurEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new ImposteurEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) {
        throw new ImposteurEngineError('CANNOT_REJOIN')
      }
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new ImposteurEngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      return {
        ...state,
        players: state.players.map((p) =>
          ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    default: {
      const exhaustive: never = action
      throw new ImposteurEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * Joueur « au tour » : celui qui doit donner son indice ; pendant la
 * révélation, le premier vivant mène le « continuer ». Pendant le VOTE
 * (simultané), il n'y a pas d'acteur unique → null (l'échéance `ADVANCE`
 * remplace l'anti-AFK).
 */
export function currentImposteurActorId(state: ImposteurState): string | null {
  if (state.phase === 'clue') return state.clueOrder[state.clueTurnIdx] ?? null
  if (state.phase === 'reveal') return imposteurAlive(state)[0]?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type ImposteurPlayerView = Omit<ImposteurPlayer, 'word' | 'team'> & {
  /** Son propre mot uniquement ('' pour les autres) ; tous révélés à la fin. */
  word: string
  /** null tant que le joueur n'est pas éliminé ni la partie finie. */
  team: ImposteurTeam | null
  hasVoted: boolean
}

export type ImposteurClientView = Omit<
  ImposteurState,
  'rngState' | 'players' | 'pendingVotes'
> & {
  players: ImposteurPlayerView[]
  /** Clé de phase pour les ticks ADVANCE. */
  phaseKey: string
  myVote: string | null
}

/**
 * Vue PAR JOUEUR : son mot seulement, JAMAIS les camps des vivants (même pas
 * le sien — personne ne sait s'il est l'imposteur !). Les éliminés restent
 * spectateurs NEUTRES (ils peuvent parler au vocal — aucun secret ne doit
 * leur être soufflé). Révélation complète en fin de partie.
 */
export function toImposteurClientView(
  state: ImposteurState,
  viewerId: string
): ImposteurClientView {
  const { rngState: _rng, players, pendingVotes, ...rest } = state
  void _rng
  const finished = state.phase === 'finished'
  return {
    ...rest,
    phaseKey: phaseKey(state),
    myVote: pendingVotes[viewerId] ?? null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      eliminated: p.eliminated,
      // Mot + camp d'un ÉLIMINÉ : publics (annoncés à sa révélation).
      word: finished || p.id === viewerId || p.eliminated ? p.word : '',
      team: finished || p.eliminated ? p.team : null,
      hasVoted: Boolean(pendingVotes[p.id]),
    })),
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : aucun mot avant la fin. */
export function toImposteurSpectatorView(state: ImposteurState): ImposteurClientView {
  return toImposteurClientView(state, '')
}
