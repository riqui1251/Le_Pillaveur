import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import type { BotSpeech } from '@/lib/online/bot-speech'

/**
 * LE GRAND BLUFF (Fibbage apéro) — moteur PUR, serveur-autoritaire.
 *
 * Une question quiz s'affiche (texte seul). Chacun soumet une fausse réponse
 * plausible en secret. Les bluffs + la vraie réponse sont mélangés et
 * affichés ANONYMEMENT : chacun vote pour celle qu'il croit vraie (jamais la
 * sienne). Points : trouver la vraie réponse, ou tromper les autres avec son
 * bluff. Zéro contenu à écrire : les questions viennent directement du pool
 * quiz (`src/lib/bluff/data/index.ts`).
 *
 * Phases chronométrées via src/lib/online/phase-clock.ts, même philosophie
 * que l'Imposteur : le serveur pose `phaseEndsAt`, les clients tickent
 * `ADVANCE` à l'échéance, validé par l'horloge SERVEUR uniquement.
 */

export const BLUFF_MIN_PLAYERS = 3
export const BLUFF_MAX_PLAYERS = 16
/** Compte à rebours d'échauffement au lancement. */
export const BLUFF_COUNTDOWN_MS = 5_000
/** Temps pour soumettre SON bluff. */
export const BLUFF_SUBMIT_MS = 45_000
/** Temps pour voter (les retardataires s'abstiennent). */
export const BLUFF_VOTE_MS = 60_000
/** Longueur maximale d'un bluff. */
export const BLUFF_FAKE_MAX_LEN = 60
/**
 * Plancher de lecture du reveal : avant lui, « Manche suivante » d'un joueur
 * est refusé (READING_TIME). Sans lui, le premier toucher effaçait la vraie
 * réponse, les auteurs et les votes avant que la table ait pu les lire.
 */
export const BLUFF_REVEAL_MIN_MS = 5_000
/**
 * Tick du bot qui mène le reveal : le plancher + 1 s de marge, pour que le
 * moteur ne lui oppose jamais READING_TIME à l'arrondi d'horloge près — le
 * reveal n'a pas d'échéance, un tick refusé le figerait.
 */
export const BLUFF_REVEAL_BOT_TICK_MS = BLUFF_REVEAL_MIN_MS + 1_000
/** Points pour avoir trouvé la vraie réponse. */
export const BLUFF_POINTS_FOUND_REAL = 1000
/** Points par joueur trompé par SON bluff. */
export const BLUFF_POINTS_PER_FOOLED = 500
/** Options de nombre de manches proposées au lobby. */
export const BLUFF_ROUND_OPTIONS = [6, 8, 10] as const
export const BLUFF_DEFAULT_ROUNDS = 8

export type BluffPrompt = { id: string; q: string; answer: string; decoys: string[] }

export type BluffPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  score: number
}

/** Candidat de vote : réel ou bluff, auteur SECRET jusqu'au reveal. */
export type BluffCandidate = {
  candidateId: string
  text: string
  isReal: boolean
  /** null pour la vraie réponse. */
  authorId: string | null
}

export type BluffRoundResult = {
  round: number
  prompt: string
  realAnswer: string
  candidates: Array<{
    candidateId: string
    text: string
    isReal: boolean
    authorId: string | null
    votes: string[]
  }>
  pointsAwarded: Record<string, number>
}

export type BluffPhase = 'countdown' | 'submit' | 'vote' | 'reveal' | 'finished'

/**
 * Parole PUBLIQUE d'un bot (`botSay.<kind>` sous games.bluff.game), portée par
 * son coup et née dans la MÊME réduction — aucun tick de plus. Le kind est le
 * seul message, choisi sur la vue du bot : il ne dit jamais quel texte est le
 * sien, lequel il a voté, ni où est la vraie réponse.
 *   • bluff (SUBMIT_FAKE) : proud (« mon bluff est prêt »), chase (pique au
 *     meneur du score, un humain) ;
 *   • vote (VOTE) : sure, unsure (du bagout, le vote d'un bot est au hasard),
 *     sniff (« je reconnais ta plume » : l'humain visé a un bluff en lice).
 * fooled, gotYou, found et bravo sont les réactions à la révélation :
 * dérivées de la vue publique (reveal-reactions.ts), jamais écrites ici.
 */
export type BluffSpeechKind =
  | 'proud'
  | 'chase'
  | 'sure'
  | 'unsure'
  | 'sniff'
  | 'fooled'
  | 'gotYou'
  | 'found'
  | 'bravo'
export type BluffSpeech = BotSpeech<BluffSpeechKind>

export const BLUFF_SPEECH_KINDS = [
  'proud',
  'chase',
  'sure',
  'unsure',
  'sniff',
  'fooled',
  'gotYou',
  'found',
  'bravo',
] as const satisfies readonly BluffSpeechKind[]

/** Paroles max par bot et par manche, réactions comprises ; le bavardage du persona borne en dessous. */
export const BLUFF_SPEECH_CAP = 2

/** Les kinds qu'un coup peut porter ; les réactions de révélation n'y sont jamais. */
export const BLUFF_SAY_KINDS_OF = {
  SUBMIT_FAKE: ['proud', 'chase'],
  VOTE: ['sure', 'unsure', 'sniff'],
} as const satisfies Record<'SUBMIT_FAKE' | 'VOTE', readonly BluffSpeechKind[]>

/** La parole jointe à un coup : son kind et le joueur qu'elle nomme. */
export type BluffSay = { kind: BluffSpeechKind; targetId: string }

/** Codes d'un `say` refusé : le coup, lui, reste jouable sans parole. */
export const BLUFF_SAY_ERRORS: readonly string[] = ['INVALID_KIND', 'INVALID_TARGET', 'ALREADY_SPOKE']

export type BluffState = TimedPhaseState & {
  version: number
  phase: BluffPhase
  players: BluffPlayer[]
  /** Séquence de questions tirée pour CETTE partie (ordre de jeu). */
  roundPrompts: BluffPrompt[]
  promptIdx: number
  /** SECRET pendant `submit` — playerId → texte du bluff. */
  pendingFakes: Record<string, string>
  /** Construit à l'entrée en `vote` ; isReal/authorId JAMAIS envoyés au client avant le reveal. */
  candidates: BluffCandidate[]
  /** SECRET pendant `vote` — playerId → candidateId voté. */
  pendingVotes: Record<string, string>
  lastReveal: BluffRoundResult | null
  /** Entrée en reveal (epoch ms serveur), null hors reveal. */
  revealAt: number | null
  rematchVotes: string[]
  winnerId: string | null
  /** SECRET serveur. */
  rngState: number
  /**
   * PUBLIC — paroles des bots de la manche en cours (`round` = promptIdx),
   * vidées au CONTINUE. Optionnel : un état sérialisé avant leur arrivée
   * n'en a pas (parseBluffState complète).
   */
  speech?: BluffSpeech[]
}

export type BluffAction =
  | { type: 'SUBMIT_FAKE'; playerId: string; text: string; now: number; say?: BluffSay }
  | { type: 'VOTE'; playerId: string; candidateId: string; now: number; say?: BluffSay }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class BluffEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'BluffEngineError'
  }
}

export type BluffInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Joueurs encore « en jeu » : n'ont pas quitté (pas de notion d'élimination ici). */
export function bluffActive(state: BluffState): BluffPlayer[] {
  return state.players.filter((p) => !p.leftAt)
}

/** Normalisation permissive (minuscules + sans accents) pour la comparaison. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Millisecondes écoulées depuis l'entrée en reveal. Un état sérialisé AVANT
 * l'horodatage (revealAt absent) est traité comme déjà lisible : on ne bloque
 * jamais une partie en cours.
 */
export function bluffRevealElapsedMs(state: BluffState, now: number): number {
  if (state.revealAt == null) return Number.POSITIVE_INFINITY
  return now - state.revealAt
}

/** Le meneur du score s'il est seul en tête avec au moins un point, parmi les joueurs encore là. */
export function bluffSoleLeader<P extends { leftAt: number | null; score: number }>(players: readonly P[]): P | null {
  const seated = players.filter((p) => !p.leftAt)
  const top = Math.max(0, ...seated.map((p) => p.score))
  const leaders = seated.filter((p) => p.score === top)
  return top > 0 && leaders.length === 1 ? leaders[0] : null
}

/**
 * Le fil après un coup qui porte `say`, ou tel quel sans parole. Seul un bot
 * parle (l'adaptateur HTTP ne lit jamais `say`) ; la cible est un autre
 * joueur encore là, que le kind désigne :
 *   • chase vise le meneur seul en tête, devant l'auteur ;
 *   • sniff vise un joueur dont un bluff est en lice (public : hasSubmitted) ;
 *   • proud, sure et unsure, n'importe qui d'autre.
 * Un kind hors de ceux du coup, une cible refusée ou un plafond atteint
 * refusent le coup — l'adaptateur le rejoue alors sans parole.
 */
function withSay(
  state: BluffState,
  actor: BluffPlayer,
  type: keyof typeof BLUFF_SAY_KINDS_OF,
  say: BluffSay | undefined
): BluffSpeech[] {
  const speech = state.speech ?? []
  if (!say) return speech
  const kinds: readonly BluffSpeechKind[] = BLUFF_SAY_KINDS_OF[type]
  if (!actor.isBot || !kinds.includes(say.kind)) throw new BluffEngineError('INVALID_KIND')
  const target = state.players.find((p) => p.id === say.targetId)
  if (!target || target.id === actor.id || target.leftAt) throw new BluffEngineError('INVALID_TARGET')
  if (say.kind === 'chase' && (bluffSoleLeader(state.players)?.id !== target.id || target.score <= actor.score)) {
    throw new BluffEngineError('INVALID_TARGET')
  }
  if (say.kind === 'sniff' && !state.pendingFakes[target.id]) throw new BluffEngineError('INVALID_TARGET')
  const round = state.promptIdx
  const mine = speech.filter((sp) => sp.playerId === actor.id && sp.round === round)
  if (mine.length >= BLUFF_SPEECH_CAP) throw new BluffEngineError('ALREADY_SPOKE')
  return [...speech, { playerId: actor.id, kind: say.kind, targetId: target.id, round }]
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createBluffState(
  players: BluffInitialPlayer[],
  prompts: BluffPrompt[],
  seed: string | number,
  now: number = Date.now(),
  roundsCount: number = BLUFF_DEFAULT_ROUNDS
): BluffState {
  if (players.length < BLUFF_MIN_PLAYERS) throw new BluffEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > BLUFF_MAX_PLAYERS) throw new BluffEngineError('TOO_MANY_PLAYERS')
  if (prompts.length === 0) throw new BluffEngineError('NO_PROMPTS')
  if (!Number.isInteger(roundsCount) || roundsCount < 1) {
    throw new BluffEngineError('INVALID_ROUNDS_COUNT')
  }

  const rng: SeededRng = createRng(seed)
  const count = Math.min(roundsCount, prompts.length)
  const roundPrompts = rng.shuffle(prompts).slice(0, count)

  const withScores: BluffPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    score: 0,
  }))

  return {
    version: 1,
    // La partie s'ouvre sur un compte à rebours avant la première question.
    ...enterPhase(0, 'countdown', BLUFF_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withScores,
    roundPrompts,
    promptIdx: 0,
    pendingFakes: {},
    candidates: [],
    pendingVotes: {},
    lastReveal: null,
    revealAt: null,
    rematchVotes: [],
    winnerId: null,
    rngState: rng.getState(),
    speech: [],
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Construit les candidats de vote (réel + bluffs anonymisés) et entre en phase `vote`. */
function enterVotePhase(state: BluffState, now: number): BluffState {
  const rng = rngFromState(state.rngState) // reprend le RNG depuis l'état courant (reproductible)
  const prompt = state.roundPrompts[state.promptIdx]
  const realNormalized = normalize(prompt.answer)
  const usedTexts = new Set<string>([realNormalized])
  let decoyIdx = 0

  // Humains d'abord : leurs bluffs, déjà uniques à la saisie (FAKE_TAKEN),
  // gardent leur texte. Seul celui d'un bot peut tomber sur un texte pris :
  // l'humain se verrait sinon marquer « Ton bluff » sur un leurre qu'il n'a
  // pas écrit, et en déduirait que son propre texte est la vraie réponse.
  const botIds = new Set(state.players.filter((p) => p.isBot).map((p) => p.id))
  const entries = Object.entries(state.pendingFakes).sort(
    ([a], [b]) => Number(botIds.has(a)) - Number(botIds.has(b))
  )

  const fakeCandidates: BluffCandidate[] = []
  for (const [playerId, rawText] of entries) {
    let text = rawText
    // Collision avec la vraie réponse (ou un bluff déjà retenu) → leurre de secours.
    if (usedTexts.has(normalize(text)) && prompt.decoys.length > 0) {
      text =
        prompt.decoys.find((d) => !usedTexts.has(normalize(d))) ??
        prompt.decoys[decoyIdx % prompt.decoys.length]
      decoyIdx += 1
    }
    usedTexts.add(normalize(text))
    fakeCandidates.push({
      candidateId: `fake-${playerId}`,
      text,
      isReal: false,
      authorId: playerId,
    })
  }

  const allCandidates: BluffCandidate[] = [
    { candidateId: 'real', text: prompt.answer, isReal: true, authorId: null },
    ...fakeCandidates,
  ]
  // Identifiants opaques APRÈS le mélange : `real` / `fake-<joueur>` voyagent
  // dans voteOptions, et trahiraient la vraie réponse et les auteurs à qui
  // lit le JSON de la salle.
  const shuffled = rng
    .shuffle(allCandidates)
    .map((c, i) => ({ ...c, candidateId: `c${state.phaseSeq}-${i}` }))

  return {
    ...state,
    candidates: shuffled,
    pendingVotes: {},
    ...enterPhase(state.phaseSeq, 'vote', BLUFF_VOTE_MS, now),
    phase: 'vote',
    rngState: rng.getState(),
    version: state.version + 1,
  }
}

/** Dépouille les votes courants → révélation (scores calculés). */
function resolveVotes(state: BluffState, now: number): BluffState {
  const prompt = state.roundPrompts[state.promptIdx]
  const pointsAwarded: Record<string, number> = {}
  const votesByCandidate = new Map<string, string[]>()
  for (const c of state.candidates) votesByCandidate.set(c.candidateId, [])
  for (const [voterId, candidateId] of Object.entries(state.pendingVotes)) {
    votesByCandidate.get(candidateId)?.push(voterId)
  }

  for (const c of state.candidates) {
    const votes = votesByCandidate.get(c.candidateId) ?? []
    if (c.isReal) {
      for (const voterId of votes) {
        pointsAwarded[voterId] = (pointsAwarded[voterId] ?? 0) + BLUFF_POINTS_FOUND_REAL
      }
    } else if (c.authorId) {
      const gained = BLUFF_POINTS_PER_FOOLED * votes.length
      if (gained > 0) pointsAwarded[c.authorId] = (pointsAwarded[c.authorId] ?? 0) + gained
    }
  }

  const players = state.players.map((p) =>
    pointsAwarded[p.id] ? { ...p, score: p.score + pointsAwarded[p.id] } : p
  )

  const lastReveal: BluffRoundResult = {
    round: state.promptIdx + 1,
    prompt: prompt.q,
    realAnswer: prompt.answer,
    candidates: state.candidates.map((c) => ({
      ...c,
      votes: votesByCandidate.get(c.candidateId) ?? [],
    })),
    pointsAwarded,
  }

  return {
    ...state,
    players,
    pendingVotes: {},
    lastReveal,
    revealAt: now,
    ...enterPhase(state.phaseSeq, 'reveal', null, now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceBluff(state: BluffState, action: BluffAction): BluffState {
  switch (action.type) {
    case 'SUBMIT_FAKE': {
      if (state.phase !== 'submit') throw new BluffEngineError('NOT_SUBMIT_PHASE')
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor || actor.leftAt) throw new BluffEngineError('UNKNOWN_PLAYER')
      if (state.pendingFakes[actor.id]) throw new BluffEngineError('ALREADY_SUBMITTED')
      const trimmed = action.text.trim()
      if (trimmed.length < 1 || trimmed.length > BLUFF_FAKE_MAX_LEN) {
        throw new BluffEngineError('INVALID_FAKE')
      }
      // Texte déjà pris (vraie réponse ou bluff d'un autre) : refusé à la
      // saisie pour que chaque humain retrouve SON texte au vote. Les bots
      // piochent au hasard parmi les leurres : leurs collisions se règlent
      // à l'entrée en vote.
      if (!actor.isBot) {
        const wanted = normalize(trimmed)
        const taken =
          wanted === normalize(state.roundPrompts[state.promptIdx].answer) ||
          Object.values(state.pendingFakes).some((t) => normalize(t) === wanted)
        if (taken) throw new BluffEngineError('FAKE_TAKEN')
      }
      const speech = withSay(state, actor, 'SUBMIT_FAKE', action.say)
      const pendingFakes = { ...state.pendingFakes, [actor.id]: trimmed }
      const next = { ...state, pendingFakes, speech, version: state.version + 1 }
      const active = bluffActive(state)
      if (active.every((p) => pendingFakes[p.id])) return enterVotePhase(next, action.now)
      return next
    }

    case 'VOTE': {
      if (state.phase !== 'vote') throw new BluffEngineError('NOT_VOTE_PHASE')
      const voter = state.players.find((p) => p.id === action.playerId)
      if (!voter || voter.leftAt) throw new BluffEngineError('CANNOT_VOTE')
      if (state.pendingVotes[voter.id]) throw new BluffEngineError('ALREADY_VOTED')
      const candidate = state.candidates.find((c) => c.candidateId === action.candidateId)
      if (!candidate) throw new BluffEngineError('INVALID_CANDIDATE')
      if (candidate.authorId === voter.id) throw new BluffEngineError('CANNOT_VOTE_OWN_FAKE')
      const speech = withSay(state, voter, 'VOTE', action.say)
      const pendingVotes = { ...state.pendingVotes, [voter.id]: candidate.candidateId }
      const next = { ...state, pendingVotes, speech, version: state.version + 1 }
      const active = bluffActive(state)
      if (active.every((p) => pendingVotes[p.id])) return resolveVotes(next, action.now)
      return next
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new BluffEngineError(check.error)
      if (state.phase === 'countdown') {
        return {
          ...state,
          ...enterPhase(state.phaseSeq, 'submit', BLUFF_SUBMIT_MS, action.now),
          phase: 'submit',
          version: state.version + 1,
        }
      }
      if (state.phase === 'submit') {
        // Les retardataires n'ont simplement pas de bluff dans la liste des candidats.
        return enterVotePhase(state, action.now)
      }
      if (state.phase === 'vote') {
        // Les retardataires s'abstiennent.
        return resolveVotes(state, action.now)
      }
      throw new BluffEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new BluffEngineError('NOT_REVEAL')
      const asker = state.players.find((p) => p.id === action.playerId)
      if (!asker) throw new BluffEngineError('UNKNOWN_PLAYER')
      // Un bot meneur lit aussi pour la table : sans humain assis, personne
      // à faire attendre.
      const mustRead = !asker.isBot || bluffActive(state).some((p) => !p.isBot)
      if (mustRead && bluffRevealElapsedMs(state, action.now) < BLUFF_REVEAL_MIN_MS) {
        throw new BluffEngineError('READING_TIME')
      }
      const nextIdx = state.promptIdx + 1
      if (nextIdx >= state.roundPrompts.length) {
        const topScore = Math.max(...state.players.map((p) => p.score))
        const leaders = state.players.filter((p) => p.score === topScore)
        return {
          ...state,
          phase: 'finished',
          phaseSeq: state.phaseSeq + 1,
          phaseEndsAt: null,
          revealAt: null,
          winnerId: leaders.length === 1 ? leaders[0].id : null,
          speech: [],
          version: state.version + 1,
        }
      }
      return {
        ...state,
        promptIdx: nextIdx,
        pendingFakes: {},
        candidates: [],
        pendingVotes: {},
        lastReveal: null,
        revealAt: null,
        speech: [],
        ...enterPhase(state.phaseSeq, 'submit', BLUFF_SUBMIT_MS, action.now),
        phase: 'submit',
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new BluffEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new BluffEngineError('UNKNOWN_PLAYER')
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
        throw new BluffEngineError('CANNOT_REJOIN')
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
      if (expired.length === 0) throw new BluffEngineError('NOTHING_TO_REPLACE')
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
      throw new BluffEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * `submit`/`vote` sont des phases SIMULTANÉES → pas d'acteur unique (null,
 * l'échéance `ADVANCE` remplace l'anti-AFK). En `reveal`, le premier joueur
 * encore en jeu mène le « continuer ».
 */
export function currentBluffActorId(state: BluffState): string | null {
  if (state.phase === 'reveal') return bluffActive(state)[0]?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type BluffPlayerView = BluffPlayer & { hasSubmitted: boolean; hasVoted: boolean }

export type BluffClientView = Omit<
  BluffState,
  'rngState' | 'players' | 'pendingFakes' | 'pendingVotes' | 'candidates' | 'roundPrompts'
> & {
  players: BluffPlayerView[]
  phaseKey: string
  totalRounds: number
  /** Texte de la question courante (jamais la réponse). */
  prompt: string | null
  myFake: string | null
  myVote: string | null
  /**
   * Candidat de SON propre bluff pendant le vote (null sinon, et toujours
   * null pour la TV) : le téléphone le montre sans le rendre votable, au lieu
   * d'un toucher refusé par CANNOT_VOTE_OWN_FAKE.
   */
  myCandidateId: string | null
  /** Candidats anonymisés (texte seul) — null hors phase de vote. */
  voteOptions: Array<{ candidateId: string; text: string }> | null
  /** Reveal : instant (epoch ms serveur) où « Manche suivante » est accepté. */
  continueAt: number | null
}

/**
 * Vue PAR JOUEUR : jamais `roundPrompts` (fuiterait les questions/réponses à
 * venir), jamais `candidates.isReal`/`authorId` avant le reveal (auquel cas
 * `lastReveal`, déjà public par construction, les porte). `myFake`/`myVote`
 * ne renvoient que la propre soumission du viewer.
 */
export function toBluffClientView(state: BluffState, viewerId: string): BluffClientView {
  const { rngState: _rng, players, pendingFakes, pendingVotes, candidates, roundPrompts, ...rest } =
    state
  void _rng
  const currentPrompt =
    state.phase === 'submit' || state.phase === 'vote' || state.phase === 'reveal'
      ? roundPrompts[state.promptIdx]?.q ?? null
      : null
  return {
    ...rest,
    phaseKey: phaseKey(state),
    totalRounds: roundPrompts.length,
    prompt: currentPrompt,
    myFake: pendingFakes[viewerId] ?? null,
    myVote: pendingVotes[viewerId] ?? null,
    myCandidateId:
      state.phase === 'vote' && viewerId
        ? candidates.find((c) => c.authorId === viewerId)?.candidateId ?? null
        : null,
    voteOptions:
      state.phase === 'vote'
        ? candidates.map((c) => ({ candidateId: c.candidateId, text: c.text }))
        : null,
    continueAt:
      state.phase === 'reveal' && state.revealAt != null
        ? state.revealAt + BLUFF_REVEAL_MIN_MS
        : null,
    players: players.map((p) => ({
      ...p,
      hasSubmitted: Boolean(pendingFakes[p.id]),
      hasVoted: Boolean(pendingVotes[p.id]),
    })),
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : rien de spécifique à un joueur (aucun secret propre n'existe). */
export function toBluffSpectatorView(state: BluffState): BluffClientView {
  return toBluffClientView(state, '')
}
