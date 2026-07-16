import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * SANS FILTRE — moteur PUR, serveur-autoritaire.
 *
 * Une carte noire à trou s'affiche. Chaque joueur (sauf le JUGE du tour) abat
 * une carte réponse de sa main en secret. Le juge découvre les réponses
 * anonymisées, les lit à voix haute (vocal) et couronne la plus drôle :
 * +1 couronne pour son auteur, révélé à la table. Le rôle de juge tourne
 * entre les HUMAINS. Après le nombre de manches choisi au lobby, le plus
 * couronné gagne.
 *
 * Le contenu (cartes noires/réponses) est injecté par le server-adapter
 * depuis src/lib/sans-filtre/data/ — le moteur ne connaît que des textes.
 * Phases chronométrées via src/lib/online/phase-clock.ts (même philosophie
 * que Bluff/Imposteur : le serveur pose `phaseEndsAt`, les clients tickent
 * `ADVANCE`, validé par l'horloge SERVEUR uniquement).
 */

export const SF_MIN_PLAYERS = 4
export const SF_MAX_PLAYERS = 16
/** Compte à rebours d'échauffement au lancement. */
export const SF_COUNTDOWN_MS = 5_000
/** Temps pour abattre sa carte (les bots jouent dès l'entrée de manche). */
export const SF_SUBMIT_MS = 60_000
/** Temps pour que le juge couronne (timeout → couronnement aléatoire). */
export const SF_JUDGE_MS = 90_000
/** Cartes réponse en main. */
export const SF_HAND_SIZE = 7
/** Options de nombre de manches proposées au lobby. */
export const SF_ROUND_OPTIONS = [5, 8, 12] as const
export const SF_DEFAULT_ROUNDS = 8

export type SFPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  crowns: number
  /** Indexes dans `whites` — SECRET (chacun ne voit que sa main). */
  hand: number[]
}

export type SFPhase = 'countdown' | 'submit' | 'judging' | 'reveal' | 'finished'

export type SFState = TimedPhaseState & {
  version: number
  phase: SFPhase
  players: SFPlayer[]
  /** Cartes noires tirées pour CETTE partie (une par manche, dans l'ordre). */
  blacks: string[]
  /** Pool de cartes réponse de CETTE partie (textes, indexés). */
  whites: string[]
  /** Pioche restante (indexes dans `whites`). */
  whiteDeck: number[]
  /** Manche courante (0-based, index dans `blacks`). */
  round: number
  /** Juge du tour — toujours un humain tant qu'il en reste. */
  judgeId: string | null
  /** SECRET pendant `submit` — auteurs anonymes jusqu'au reveal. */
  submissions: Array<{ playerId: string; card: number }>
  /** Dernier couronnement (public en `reveal`). */
  crowned: { playerId: string; card: number } | null
  winnerId: string | null
  rematchVotes: string[]
  /** SECRET serveur. */
  rngState: number
}

export type SFAction =
  | { type: 'PLAY_CARD'; playerId: string; card: number; now: number }
  | { type: 'JUDGE_PICK'; playerId: string; card: number; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class SFEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'SFEngineError'
  }
}

export type SFInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function sfActive(state: SFState): SFPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

function humans(state: SFState): SFPlayer[] {
  return sfActive(state).filter((p) => !p.isBot)
}

/** Prochain juge : humain actif suivant `fromId` dans l'ordre de la table. */
function nextJudgeId(state: SFState, fromId: string | null): string | null {
  const pool = humans(state)
  if (pool.length === 0) return null
  if (!fromId) return pool[0].id
  const order = state.players.map((p) => p.id)
  const start = order.indexOf(fromId)
  for (let step = 1; step <= order.length; step++) {
    const candidate = state.players[(start + step) % order.length]
    if (!candidate.isBot && !candidate.leftAt) return candidate.id
  }
  return pool[0].id
}

/** Ceux qui doivent jouer une carte ce tour : actifs, hors juge. */
function roundPlayers(state: SFState): SFPlayer[] {
  return sfActive(state).filter((p) => p.id !== state.judgeId)
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createSFState(
  players: SFInitialPlayer[],
  blacks: string[],
  whites: string[],
  seed: string | number,
  now: number = Date.now(),
  roundsCount: number = SF_DEFAULT_ROUNDS
): SFState {
  if (players.length < SF_MIN_PLAYERS) throw new SFEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > SF_MAX_PLAYERS) throw new SFEngineError('TOO_MANY_PLAYERS')
  if (!players.some((p) => !p.isBot)) throw new SFEngineError('NEEDS_ONE_HUMAN')
  if (!Number.isInteger(roundsCount) || roundsCount < 1) {
    throw new SFEngineError('INVALID_ROUNDS_COUNT')
  }
  if (blacks.length < 1) throw new SFEngineError('NO_BLACK_CARDS')
  // Assez de réponses pour distribuer les mains (la pioche peut s'épuiser en
  // cours de partie : les mains rétrécissent alors, sans casser le jeu).
  if (whites.length < players.length * SF_HAND_SIZE) throw new SFEngineError('NO_WHITE_CARDS')

  const rng: SeededRng = createRng(seed)
  const gameBlacks = rng.shuffle(blacks).slice(0, Math.min(roundsCount, blacks.length))
  const whiteDeck = rng.shuffle(whites.map((_, i) => i))

  const withHands: SFPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    crowns: 0,
    hand: whiteDeck.splice(0, SF_HAND_SIZE),
  }))

  return {
    version: 1,
    ...enterPhase(0, 'countdown', SF_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withHands,
    blacks: gameBlacks,
    whites,
    whiteDeck,
    round: 0,
    judgeId: null,
    submissions: [],
    crowned: null,
    winnerId: null,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Entre en manche : nouveau juge, les bots abattent immédiatement leur carte. */
function startRound(state: SFState, now: number): SFState {
  const rng = rngFromState(state.rngState)
  const judgeId = nextJudgeId(state, state.judgeId)
  const base: SFState = { ...state, judgeId, submissions: [], crowned: null }

  const submissions: Array<{ playerId: string; card: number }> = []
  const players = base.players.map((p) => {
    if (!p.isBot || p.leftAt || p.id === judgeId || p.hand.length === 0) return p
    const idx = rng.pickIndex(p.hand.length)
    submissions.push({ playerId: p.id, card: p.hand[idx] })
    return { ...p, hand: p.hand.filter((_, i) => i !== idx) }
  })

  return {
    ...base,
    players,
    submissions,
    ...enterPhase(state.phaseSeq, 'submit', SF_SUBMIT_MS, now),
    phase: 'submit',
    rngState: rng.getState(),
    version: state.version + 1,
  }
}

function enterJudging(state: SFState, now: number): SFState {
  // Aucune carte abattue (table de retardataires) → on saute le couronnement.
  if (state.submissions.length === 0) return enterReveal(state, null, now)
  return {
    ...state,
    ...enterPhase(state.phaseSeq, 'judging', SF_JUDGE_MS, now),
    phase: 'judging',
    version: state.version + 1,
  }
}

/** Couronne (ou non) et repioche pour ceux qui ont joué. */
function enterReveal(
  state: SFState,
  crowned: { playerId: string; card: number } | null,
  now: number
): SFState {
  const whiteDeck = [...state.whiteDeck]
  const played = new Set(state.submissions.map((s) => s.playerId))
  const players = state.players.map((p) => {
    let next = p
    if (crowned && p.id === crowned.playerId) next = { ...next, crowns: next.crowns + 1 }
    if (played.has(p.id) && whiteDeck.length > 0) {
      next = { ...next, hand: [...next.hand, whiteDeck.shift() as number] }
    }
    return next
  })
  return {
    ...state,
    players,
    whiteDeck,
    crowned,
    ...enterPhase(state.phaseSeq, 'reveal', null, now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceSF(state: SFState, action: SFAction): SFState {
  switch (action.type) {
    case 'PLAY_CARD': {
      if (state.phase !== 'submit') throw new SFEngineError('NOT_SUBMIT_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new SFEngineError('UNKNOWN_PLAYER')
      if (actor.id === state.judgeId) throw new SFEngineError('JUDGE_CANNOT_PLAY')
      if (state.submissions.some((s) => s.playerId === actor.id)) {
        throw new SFEngineError('ALREADY_PLAYED')
      }
      if (!actor.hand.includes(action.card)) throw new SFEngineError('CARD_NOT_IN_HAND')

      const submissions = [...state.submissions, { playerId: actor.id, card: action.card }]
      const players = state.players.map((p) =>
        p.id === actor.id ? { ...p, hand: p.hand.filter((c) => c !== action.card) } : p
      )
      const next = { ...state, players, submissions, version: state.version + 1 }
      const waiting = roundPlayers(next).filter(
        (p) => !submissions.some((s) => s.playerId === p.id)
      )
      if (waiting.length === 0) return enterJudging(next, action.now)
      return next
    }

    case 'JUDGE_PICK': {
      if (state.phase !== 'judging') throw new SFEngineError('NOT_JUDGING_PHASE')
      if (action.playerId !== state.judgeId) throw new SFEngineError('NOT_THE_JUDGE')
      const submission = state.submissions.find((s) => s.card === action.card)
      if (!submission) throw new SFEngineError('INVALID_PICK')
      return enterReveal(state, { playerId: submission.playerId, card: submission.card }, action.now)
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new SFEngineError(check.error)
      if (state.phase === 'countdown') return startRound(state, action.now)
      if (state.phase === 'submit') {
        // Les retardataires gardent leur main : ils n'ont juste rien abattu.
        return enterJudging(state, action.now)
      }
      if (state.phase === 'judging') {
        // Juge endormi (ou devenu bot) → couronnement aléatoire reproductible.
        const rng = rngFromState(state.rngState)
        const pickIdx = rng.pickIndex(state.submissions.length)
        const s = state.submissions[pickIdx]
        return {
          ...enterReveal(state, { playerId: s.playerId, card: s.card }, action.now),
          rngState: rng.getState(),
        }
      }
      throw new SFEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new SFEngineError('NOT_REVEAL')
      if (!state.players.some((p) => p.id === action.playerId)) {
        throw new SFEngineError('UNKNOWN_PLAYER')
      }
      const nextRound = state.round + 1
      if (nextRound >= state.blacks.length) {
        const top = Math.max(...state.players.map((p) => p.crowns))
        const leaders = state.players.filter((p) => p.crowns === top)
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          winnerId: top > 0 && leaders.length === 1 ? leaders[0].id : null,
          version: state.version + 1,
        }
      }
      return startRound({ ...state, round: nextRound }, action.now)
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new SFEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new SFEngineError('UNKNOWN_PLAYER')
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
      if (!player || player.isBot || !player.leftAt) throw new SFEngineError('CANNOT_REJOIN')
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
      if (expired.length === 0) throw new SFEngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      let next: SFState = {
        ...state,
        players: state.players.map((p) =>
          ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
        ),
        version: state.version + 1,
      }
      // Le juge devenu bot ne couronnera jamais : on passe la main tout de
      // suite au prochain humain pour ne pas geler la table jusqu'au timeout.
      if (next.judgeId && ids.has(next.judgeId) && next.phase === 'judging') {
        const replacement = nextJudgeId(next, next.judgeId)
        if (replacement) next = { ...next, judgeId: replacement }
      }
      return next
    }

    default: {
      const exhaustive: never = action
      throw new SFEngineError(`UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`)
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * `submit` est simultanée (échéance ADVANCE), `judging` attend le juge,
 * `reveal` attend un « continuer » mené par le premier joueur actif.
 */
export function currentSFActorId(state: SFState): string | null {
  if (state.phase === 'judging') return state.judgeId
  if (state.phase === 'reveal') return sfActive(state)[0]?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type SFPlayerView = Omit<SFPlayer, 'hand'> & {
  hasPlayed: boolean
  isJudge: boolean
  handCount: number
}

export type SFClientView = Omit<
  SFState,
  'rngState' | 'players' | 'blacks' | 'whites' | 'whiteDeck' | 'submissions' | 'crowned'
> & {
  players: SFPlayerView[]
  phaseKey: string
  totalRounds: number
  /** Carte noire de la manche courante (jamais les suivantes). */
  black: string | null
  /** Main du viewer (le juge et les spectateurs n'en voient pas). */
  myHand: Array<{ card: number; text: string }>
  myPlayed: number | null
  /** Réponses abattues, ANONYMES, triées par index de carte (pas d'ordre d'arrivée). */
  submissions: Array<{ card: number; text: string }> | null
  crowned: { card: number; text: string; playerId: string; playerName: string } | null
}

/**
 * Vue PAR JOUEUR : jamais les mains des autres, jamais la pioche ni les
 * cartes noires à venir ; les auteurs des réponses restent secrets jusqu'au
 * reveal (le tri par index de carte casse l'ordre de soumission).
 */
export function toSFClientView(state: SFState, viewerId: string): SFClientView {
  const {
    rngState: _rng,
    players,
    blacks,
    whites,
    whiteDeck: _deck,
    submissions,
    crowned,
    ...rest
  } = state
  void _rng
  void _deck

  const me = players.find((p) => p.id === viewerId)
  const showSubmissions = state.phase === 'judging' || state.phase === 'reveal'
  const crownedAuthor = crowned ? players.find((p) => p.id === crowned.playerId) : null

  return {
    ...rest,
    phaseKey: phaseKey(state),
    totalRounds: blacks.length,
    black: state.phase === 'countdown' || state.phase === 'finished' ? null : blacks[state.round] ?? null,
    myHand:
      me && !me.isBot && me.id !== state.judgeId
        ? me.hand.map((card) => ({ card, text: whites[card] }))
        : [],
    myPlayed: submissions.find((s) => s.playerId === viewerId)?.card ?? null,
    submissions: showSubmissions
      ? [...submissions]
          .sort((a, b) => a.card - b.card)
          .map((s) => ({ card: s.card, text: whites[s.card] }))
      : null,
    crowned:
      state.phase === 'reveal' || state.phase === 'finished'
        ? crowned && {
            card: crowned.card,
            text: whites[crowned.card],
            playerId: crowned.playerId,
            playerName: crownedAuthor?.name ?? '—',
          }
        : null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      crowns: p.crowns,
      hasPlayed: submissions.some((s) => s.playerId === p.id),
      isJudge: p.id === state.judgeId,
      handCount: p.hand.length,
    })),
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : aucune main, réponses anonymes seulement. */
export function toSFSpectatorView(state: SFState): SFClientView {
  return toSFClientView(state, '')
}
