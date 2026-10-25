import { createRng, rngFromState, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'

/**
 * SANS FILTRE — moteur PUR, serveur-autoritaire.
 *
 * Une carte noire à trou s'affiche. Chaque joueur (sauf le JUGE du tour) abat
 * une carte réponse de sa main en secret. Le juge découvre les réponses
 * anonymisées, les lit à voix haute (vocal) et couronne la plus drôle :
 * +1 couronne pour son auteur, révélé à la table. Le rôle de juge tourne
 * entre les HUMAINS — sauf à moins de 2 humains actifs (table solo), où les
 * bots entrent dans la rotation pour que le joueur seul joue aussi ses
 * cartes. Après le nombre de manches choisi au lobby, le plus couronné gagne.
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
/** Temps pour abattre sa carte (les bots abattent au fil des ticks client). */
export const SF_SUBMIT_MS = 60_000
/** Temps pour que le juge couronne (timeout → couronnement aléatoire). */
export const SF_JUDGE_MS = 90_000
/**
 * TEMPS DE LECTURE MINIMAL du couronnement : « manche suivante » est ouvert à
 * tous, et sans plancher le premier impatient escamotait la carte couronnée et
 * son auteur pour toute la table. Un bot meneur attend aussi tant qu'un humain
 * est assis (sfReadingTimeOk, vérifié par le serveur à chaque « continuer »).
 */
export const SF_REVEAL_MIN_MS = 5_000
/**
 * Tick du bot qui mène le reveal : le plancher + 1 s de marge, pour qu'il ne
 * reçoive jamais READING_TIME à l'arrondi d'horloge près — le reveal n'a pas
 * d'échéance, un tick refusé le figerait.
 */
export const SF_REVEAL_BOT_TICK_MS = SF_REVEAL_MIN_MS + 1_000
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
  /** Juge du tour — humain à 2+ humains actifs, bot possible en solo. */
  judgeId: string | null
  /** SECRET pendant `submit` — auteurs anonymes jusqu'au reveal. */
  submissions: Array<{ playerId: string; card: number }>
  /** Dernier couronnement (public en `reveal`). */
  crowned: { playerId: string; card: number } | null
  /** Entrée en reveal (epoch ms serveur), null hors reveal. */
  revealAt: number | null
  winnerId: string | null
  rematchVotes: string[]
  /** SECRET serveur. */
  rngState: RngState
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

/**
 * Juges possibles, dans l'ordre de la table à partir du siège qui suit
 * `fromId` (le premier de la table sans `fromId`). À 2+ humains actifs, seuls
 * les humains jugent ; en dessous (table solo), les bots entrent dans la
 * rotation — sinon le joueur seul serait juge à chaque manche et ne jouerait
 * jamais ses cartes.
 */
function judgeRotation(state: SFState, fromId: string | null): string[] {
  const includeBots = humans(state).length < 2
  const order = state.players
  const start = fromId ? order.findIndex((p) => p.id === fromId) : -1
  const out: string[] = []
  for (let step = 1; step <= order.length; step++) {
    const candidate = order[(start + step) % order.length]
    if (candidate.leftAt) continue
    if (candidate.isBot && !includeBots) continue
    out.push(candidate.id)
  }
  return out
}

/** Prochain juge : actif suivant `fromId` dans la rotation. */
function nextJudgeId(state: SFState, fromId: string | null): string | null {
  return judgeRotation(state, fromId)[0] ?? null
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
    revealAt: null,
    winnerId: null,
    rematchVotes: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/**
 * Entre en manche : nouveau juge, mains pleines pour tout le monde — les
 * bots abattent ensuite UN PAR UN via les ticks client (server-adapter),
 * jamais tous d'un coup. Le raccourci « tous ont soumis → jugement » vit
 * dans PLAY_CARD, atteint par le dernier tick.
 */
function startRound(state: SFState, now: number): SFState {
  const judgeId = nextJudgeId(state, state.judgeId)
  const next: SFState = {
    ...state,
    judgeId,
    submissions: [],
    crowned: null,
    revealAt: null,
    ...enterPhase(state.phaseSeq, 'submit', SF_SUBMIT_MS, now),
    phase: 'submit',
    version: state.version + 1,
  }
  // Table dégénérée (le juge est seul actif) : personne n'est attendu — on
  // passe directement au jugement au lieu de laisser courir le chrono.
  if (roundPlayers(next).length === 0) return enterJudging(next, now)
  return next
}

/**
 * Le juge vient de quitter en pleine manche : le rôle passe tout de suite au
 * suivant de la rotation, de préférence à quelqu'un qui n'a pas encore abattu.
 * S'il avait déjà joué, sa carte lui revient en main — un juge ne couronne
 * jamais sa propre réponse. En jugement, le nouveau juge repart d'un chrono
 * plein pour lire. Sans personne pour reprendre le rôle, rien ne change :
 * l'échéance couronne au hasard.
 */
function handOverJudge(state: SFState, now: number): SFState {
  const played = new Set(state.submissions.map((s) => s.playerId))
  const rotation = judgeRotation(state, state.judgeId)
  const judgeId = rotation.find((id) => !played.has(id)) ?? rotation[0]
  if (!judgeId) return state
  const own = state.submissions.find((s) => s.playerId === judgeId)
  const next: SFState = own
    ? {
        ...state,
        judgeId,
        submissions: state.submissions.filter((s) => s.playerId !== judgeId),
        players: state.players.map((p) =>
          p.id === judgeId ? { ...p, hand: [...p.hand, own.card] } : p
        ),
      }
    : { ...state, judgeId }
  if (next.phase !== 'judging') return next
  if (next.submissions.length === 0) return enterReveal(next, null, now)
  return { ...next, ...enterPhase(next.phaseSeq, 'judging', SF_JUDGE_MS, now), phase: 'judging' }
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
    revealAt: now,
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
          revealAt: null,
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
      let next: SFState = {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
      if (next.judgeId === player.id && (next.phase === 'submit' || next.phase === 'judging')) {
        next = handOverJudge(next, action.at)
      }
      // Le partant était peut-être le dernier attendu : jugement tout de
      // suite, comme à la dernière carte abattue, sans attendre le chrono.
      if (
        next.phase === 'submit' &&
        sfActive(next).length > 0 &&
        roundPlayers(next).every((p) => next.submissions.some((s) => s.playerId === p.id))
      ) {
        return enterJudging(next, action.at)
      }
      return next
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
      // Le juge devenu bot passe la main au prochain de la rotation (humain
      // s'il en reste 2+) pour ne pas geler la table jusqu'au timeout.
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
 * `submit` est simultanée (échéance ADVANCE), `judging` attend le juge. Le
 * « continuer » du reveal est ouvert à tous : pas d'acteur (null), personne
 * n'y est expulsable pour inactivité ; son meneur (sfRevealLeaderId), s'il
 * est bot, le lance.
 */
export function currentSFActorId(state: SFState): string | null {
  if (state.phase === 'judging') return state.judgeId
  return null
}

/** Le premier joueur encore en jeu mène le « continuer » du reveal. */
export function sfRevealLeaderId(state: {
  players: ReadonlyArray<Pick<SFPlayer, 'id' | 'leftAt'>>
}): string | null {
  return state.players.find((p) => !p.leftAt)?.id ?? null
}

/**
 * « Manche suivante » de `askerId` recevable à `now` ? Hors reveal, ou pour un
 * état sérialisé avant l'horodatage (revealAt absent), rien ne l'interdit : le
 * réducteur tranche. Un bot meneur lit aussi pour la table : sans humain
 * assis, personne à faire attendre.
 */
export function sfReadingTimeOk(state: SFState, askerId: string, now: number): boolean {
  if (state.phase !== 'reveal' || state.revealAt == null) return true
  const asker = state.players.find((p) => p.id === askerId)
  if (!asker) return true
  const mustRead = !asker.isBot || humans(state).length > 0
  return !mustRead || now - state.revealAt >= SF_REVEAL_MIN_MS
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
  /** Reveal : instant (epoch ms serveur) où « manche suivante » est accepté. */
  continueAt: number | null
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
    continueAt:
      state.phase === 'reveal' && state.revealAt != null ? state.revealAt + SF_REVEAL_MIN_MS : null,
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
