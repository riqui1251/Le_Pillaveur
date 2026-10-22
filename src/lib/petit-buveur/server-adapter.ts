import {
  autoAction,
  createInitialState,
  currentDeciderId,
  passDepartedTurns,
  reduce,
  EngineError,
  type EngineState,
  type EngineSettings,
  type EngineAction,
  type EnginePending,
  type InteractionChoice,
} from './engine'
import { DEFI_DRINKS, DEFI_VERIFIABLE_ONLINE } from './game-data'
import type { Difficulty } from './types'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'

/**
 * Pont entre une salle en ligne (`OnlineRoom` + membres) et le moteur pur.
 *
 * Côté serveur uniquement. L'identifiant moteur d'un joueur est son `userId`,
 * ce qui permet de valider le tour via `currentPlayerId(state) === user.id`.
 *
 * ANTI-TRICHE : la vue envoyée au client masque `rngState`. Sans cela, un client
 * pourrait rejouer le générateur et prédire les prochains dés / cases.
 */

export interface RoomMemberLite {
  userId: string
  displayName: string
}

/** Minimum du moteur en ligne (même borne que l'adaptateur, bots compris). */
const PETIT_BUVEUR_MIN_PLAYERS = 2
/** Borne haute de l'adaptateur (purement théorique : pas de plafond historique). */
const PETIT_BUVEUR_MAX_PLAYERS = 99

/**
 * État initial d'une partie en ligne. `botsCount` : les bots choisis par
 * l'hôte au lobby (RoomSettings.botsCount), assis APRÈS les humains — le
 * premier humain garde donc la main au premier tour. Même convention que les
 * autres jeux : identifiants `bot-N` (jamais un compte, cf. match-results),
 * noms de persona (tempo du tick serveur), et complément jusqu'au minimum.
 * Sans bot, l'état est identique à celui d'avant l'option (mêmes tirages à
 * graine égale).
 */
export function buildPetitBuveurEngineState(
  members: RoomMemberLite[],
  difficulty: Difficulty,
  seed: string | number,
  botsCount: number = 0
): EngineState {
  // En ligne, seuls les défis vérifiables sont tirés (pas de défi physique :
  // impossible à contrôler à distance). Le texte reste résolu par defiIndex.
  const settings: EngineSettings = {
    difficulty,
    defiDrinks: DEFI_DRINKS,
    defiAllowed: DEFI_VERIFIABLE_ONLINE.flatMap((ok, i) => (ok ? [i] : [])),
  }
  const players = members.map((m) => ({ id: m.userId, name: m.displayName }))
  const botIds = new Set<string>()
  const botPersonas = pickBotPersonas(PETIT_BUVEUR_MAX_PLAYERS)
  const addBot = () => {
    const id = `bot-${botIds.size + 1}`
    players.push({ id, name: botDisplayName(botPersonas[botIds.size % botPersonas.length]) })
    botIds.add(id)
  }
  const wanted = Math.max(0, Math.min(botsCount, PETIT_BUVEUR_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < PETIT_BUVEUR_MIN_PLAYERS) addBot()

  const state = createInitialState(players, settings, seed)
  if (botIds.size === 0) return state
  // createInitialState ne connaît que { id, name } : le drapeau bot est posé
  // après coup, sans toucher au générateur (rngState ne dépend que de la graine).
  return {
    ...state,
    players: state.players.map((p) => (botIds.has(p.id) ? { ...p, isBot: true } : p)),
  }
}

export function serializeEngineState(state: EngineState): string {
  return JSON.stringify(state)
}

export function parseEngineState(json: string | null): EngineState | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as EngineState
    if (!parsed || !Array.isArray(parsed.players)) return null
    return parsed
  } catch {
    return null
  }
}

/** Action reçue d'un client (mappée vers une action moteur). */
export type RoomActionInput =
  | { type: 'roll' }
  | { type: 'resolve'; choice?: InteractionChoice }

export type RoomActionResult =
  | { ok: true; state: EngineState }
  | { ok: false; error: string }

/** Pile ou face : délai laissé à la cible pour choisir son côté avant tirage au hasard. */
export const PB_SIDE_CHOICE_MS = 20_000

/** Étape `side` qui commence : son échéance est posée à l'horloge serveur. */
export function withSideDeadline(state: EngineState, now: number): EngineState {
  const p = state.pending
  if (p?.stage !== 'side' || p.deadlineAt != null) return state
  return { ...state, pending: { ...p, deadlineAt: now + PB_SIDE_CHOICE_MS } }
}

function applyEngine(state: EngineState, action: EngineAction, now: number): RoomActionResult {
  try {
    // Le joueur qui doit agir a pu quitter la table entre-temps (cible de pile ou face).
    return { ok: true, state: withSideDeadline(passDepartedTurns(reduce(state, action)), now) }
  } catch (e) {
    return { ok: false, error: e instanceof EngineError ? e.message : 'ENGINE_ERROR' }
  }
}

/**
 * Applique une action de salle de façon autoritaire. La validation du tour est
 * portée par le moteur (`reduce` lève NOT_YOUR_TURN, INTERACTION_PENDING,
 * INVALID_TARGET, INVALID_CHOICE…).
 */
export function applyRoomAction(
  state: EngineState,
  userId: string,
  input: RoomActionInput,
  now: number = Date.now()
): RoomActionResult {
  const action: EngineAction =
    input.type === 'roll'
      ? { type: 'ROLL', playerId: userId }
      : { type: 'RESOLVE_INTERACTION', playerId: userId, choice: input.choice }
  return applyEngine(state, action, now)
}

/**
 * Délai de l'étape `side` dépassé : le côté de la cible est tiré au hasard
 * (RNG du moteur). NOT_DUE tant que l'échéance n'est pas atteinte.
 */
export function applyTimeoutAction(state: EngineState, now: number): RoomActionResult {
  const p = state.pending
  if (state.phase === 'finished' || p?.stage !== 'side' || p.deadlineAt == null || now < p.deadlineAt) {
    return { ok: false, error: 'NOT_DUE' }
  }
  const next = autoAction(state)
  return applyEngine(next.state, next.action, now)
}

/** Vue client : l'état SAUF `rngState` (secret serveur), case cachée masquée. */
export type EngineClientView = Omit<EngineState, 'rngState' | 'lastEffectiveCase'>

/**
 * La case tirée reste CACHÉE tant que l'acteur choisit sa cible : comme en
 * local (« l'effet de la case sera révélé après ton choix »), on vise à
 * l'aveugle — case à cible (Défi, Question, Double case, case rejouée
 * comprises) et Pile ou face —, et pendant le duel qui la précède. Échange,
 * Vote, Défi en chaîne, Téléport, Chance, roue et dé de la honte s'annoncent
 * avant le choix, comme leurs fenêtres locales.
 */
export function hidesDrawnCase(p: EnginePending | null | undefined): boolean {
  if (!p) return false
  if (p.stage === 'duel') return true
  if (p.stage) return false
  return p.needsTarget || p.caseType === 'pile-face'
}

/** Journal sans le type des cases tirées (`case:gorgée` → `case:`) : la TV n'y lit que « un lancer ». */
function withoutDrawnCaseTypes(log: EngineState['log']): EngineState['log'] {
  return log.map((e) => (e.message.startsWith('case:') && e.message !== 'case:' ? { ...e, message: 'case:' } : e))
}

/**
 * Vue envoyée aux téléphones et à la TV. Sans `rngState` (il prédirait dés et
 * cases) ni `lastEffectiveCase` (cuisine du moteur). Pendant un choix de cible
 * à l'aveugle, rien ne trahit la case tirée : ni l'encadré en attente (réduit
 * à « qui choisit une cible »), ni `lastCase`, ni le journal.
 */
export function toClientView(state: EngineState): EngineClientView {
  const view: Partial<EngineState> = { ...state }
  delete view.rngState
  delete view.lastEffectiveCase
  const p = state.pending
  if (!p || !hidesDrawnCase(p)) return view as EngineClientView
  const pending: EnginePending =
    p.stage === 'duel'
      ? { caseType: 'normal', playerId: p.playerId, needsTarget: false, hidden: true, stage: 'duel', opponents: p.opponents ?? [] }
      : { caseType: 'normal', playerId: p.playerId, needsTarget: true, hidden: true }
  return {
    ...(view as EngineClientView),
    pending,
    lastCase: null,
    log: withoutDrawnCaseTypes(state.log),
  }
}

// ─── Remplacement par bot (départ volontaire / AFK) ─────────────────────────
// Voir src/lib/online/replacement.ts pour les règles communes à tous les jeux.

function withPlayer(
  state: EngineState,
  playerId: string,
  patch: Partial<import('./engine').EnginePlayer>
): EngineState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
    version: state.version + 1,
  }
}

/**
 * Marque un joueur « parti » (délai de grâce avant remplacement). Null si rien
 * à faire. Si c'était à lui de lancer, la main passe aussitôt au suivant encore
 * présent : la table ne reste pas figée 3 min. Ses tours suivants sont sautés
 * tant qu'il n'est ni revenu ni remplacé.
 *
 * Une décision en attente (case, verdict, côté) n'est PAS tirée ici : elle peut
 * finir la partie, et les routes de départ n'enregistrent pas les résultats.
 * Le tick de service la joue comme pour un bot (`applyBotAction`).
 */
export function markPlayerLeft(
  state: EngineState,
  playerId: string,
  at: number
): EngineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  const left = withPlayer(state, playerId, { leftAt: at })
  return withSideDeadline(passDepartedTurns(left, { resolvePending: false }), at)
}

/** Le joueur qui doit décider est un bot, ou a quitté la table : le serveur décide pour lui. */
export function deciderPlaysAuto(state: EngineState): boolean {
  if (state.phase === 'finished') return false
  const deciderId = currentDeciderId(state)
  const decider = state.players.find((p) => p.id === deciderId)
  return Boolean(decider?.isBot || decider?.leftAt)
}

/** Le joueur parti reprend sa place (tant qu'un bot ne l'a pas remplacé). */
export function rejoinPlayer(state: EngineState, playerId: string): EngineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return withPlayer(state, playerId, { leftAt: null })
}

/** Convertit en bot tous les joueurs partis depuis plus de `graceMs`. Null si aucun. */
export function replaceExpiredWithBots(
  state: EngineState,
  now: number,
  graceMs: number
): EngineState | null {
  const expired = state.players.filter((p) => !p.isBot && p.leftAt && now - p.leftAt >= graceMs)
  if (expired.length === 0) return null
  const ids = new Set(expired.map((p) => p.id))
  return {
    ...state,
    players: state.players.map((p) =>
      ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
    ),
    version: state.version + 1,
  }
}

/** Conversion directe en bot (joueur inactif expulsé — validation AFK côté route). */
export function convertPlayerToBot(state: EngineState, playerId: string): EngineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return withPlayer(state, playerId, { isBot: true, leftAt: null })
}

/**
 * IA du bot Petit Buveur : il agit quand c'est à lui de décider — son tour, ou
 * le côté de pile ou face quand il en est la cible. Lancer, cible (jamais
 * lui-même), verdict d'un défi, côté, option : tirés au hasard par le RNG du
 * moteur, donc rejouables à graine égale. Même chose pour la décision en
 * attente d'un joueur parti.
 */
export function applyBotAction(state: EngineState, now: number = Date.now()): RoomActionResult {
  if (!deciderPlaysAuto(state)) return { ok: false, error: 'NOT_BOT_TURN' }
  if (!state.pending && state.players[state.currentPlayer]?.leftAt) {
    return { ok: true, state: withSideDeadline(passDepartedTurns(state), now) }
  }
  const next = autoAction(state)
  return applyEngine(next.state, next.action, now)
}
