import {
  createInitialState,
  currentPlayerId,
  reduce,
  EngineError,
  type EngineState,
  type EngineSettings,
  type EngineAction,
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

/**
 * Applique une action de salle de façon autoritaire. La validation du tour est
 * portée par le moteur (`reduce` lève NOT_YOUR_TURN, INTERACTION_PENDING, etc.).
 */
export function applyRoomAction(
  state: EngineState,
  userId: string,
  input: RoomActionInput
): RoomActionResult {
  const action: EngineAction =
    input.type === 'roll'
      ? { type: 'ROLL', playerId: userId }
      : { type: 'RESOLVE_INTERACTION', playerId: userId, choice: input.choice }
  try {
    return { ok: true, state: reduce(state, action) }
  } catch (e) {
    return { ok: false, error: e instanceof EngineError ? e.message : 'ENGINE_ERROR' }
  }
}

/** Vue client : tout l'état SAUF `rngState` (secret serveur). */
export type EngineClientView = Omit<EngineState, 'rngState'>

export function toClientView(state: EngineState): EngineClientView {
  const view: EngineState = { ...state }
  delete (view as Partial<EngineState>).rngState
  return view as EngineClientView
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

/** Marque un joueur « parti » (délai de grâce avant remplacement). Null si rien à faire. */
export function markPlayerLeft(
  state: EngineState,
  playerId: string,
  at: number
): EngineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return withPlayer(state, playerId, { leftAt: at })
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
 * IA du bot Petit Buveur : rejoue exactement l'espace d'action du client —
 * ROLL sur son tour, puis résolution des cases interactives avec un choix
 * plausible (cible aléatoire, côté de pièce, option de téléport). Le hasard
 * des CHOIX utilise Math.random (c'est une entrée « joueur », pas un tirage
 * du moteur) ; les dés/cases restent tirés par le RNG seedé du moteur.
 */
export function applyBotAction(state: EngineState): RoomActionResult {
  const activeId = currentPlayerId(state)
  const active = state.players.find((p) => p.id === activeId)
  if (!active?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }

  let action: EngineAction
  if (!state.pending) {
    action = { type: 'ROLL', playerId: active.id }
  } else {
    const caseType = state.pending.caseType
    let choice: InteractionChoice | undefined
    if (state.pending.needsTarget || TARGET_INTERACTIVE_CASES.has(caseType)) {
      const target = state.players[Math.floor(Math.random() * state.players.length)]
      choice = { targetId: target.id }
    } else if (caseType === 'teleport') {
      choice = { option: Math.random() < 0.5 ? 'leader' : 'last' }
    }
    action = { type: 'RESOLVE_INTERACTION', playerId: active.id, choice }
  }

  try {
    return { ok: true, state: reduce(state, action) }
  } catch (e) {
    return { ok: false, error: e instanceof EngineError ? e.message : 'ENGINE_ERROR' }
  }
}

/** Cases à modale dont la résolution attend un `targetId` (miroir du client). */
const TARGET_INTERACTIVE_CASES = new Set(['vote', 'echange', 'pile-face', 'defi-chaine'])
