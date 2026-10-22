import {
  addCrobardSpeech,
  createCrobardState,
  currentCrobardActorId,
  reduceCrobard,
  toCrobardClientView,
  toCrobardSpectatorView,
  CrobardEngineError,
  CROBARD_MAX_PLAYERS,
  CROBARD_MIN_PLAYERS,
  CROBARD_DEFAULT_ROUNDS,
  type CrobardState,
  type Stroke,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import { getCrobardWords } from './data'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { crobardBotSay, type CrobardSpeechEvent } from './bot-speech'

/**
 * Adaptateur serveur de Crobard : sérialisation, mapping HTTP → actions
 * moteur, bots de remplacement, vues anti-triche. Consommé par le registre
 * `src/lib/online/game-adapters.ts`.
 */

export interface CrobardRoomMember {
  userId: string
  user: { displayName: string }
}

/**
 * Construit l'état initial : les membres + le nombre de bots CHOISI par
 * l'hôte. Filet : on complète quand même jusqu'au minimum du moteur.
 */
export function buildCrobardState(
  members: CrobardRoomMember[],
  lang: string | null | undefined,
  botsCount: number = 0,
  seed?: string | number,
  totalRounds?: number
): CrobardState {
  const players = members.map((m) => ({ id: m.userId, name: m.user.displayName, isBot: false }))
  let botIndex = 0
  const botPersonas = pickBotPersonas(CROBARD_MAX_PLAYERS)
  const addBot = () => {
    players.push({
      id: `bot-${botIndex + 1}`,
      name: botDisplayName(botPersonas[botIndex % botPersonas.length]),
      isBot: true,
    })
    botIndex += 1
  }
  const wanted = Math.max(0, Math.min(botsCount, CROBARD_MAX_PLAYERS - players.length))
  for (let i = 0; i < wanted; i += 1) addBot()
  while (players.length < CROBARD_MIN_PLAYERS) addBot()
  return createCrobardState(
    players,
    getCrobardWords(lang),
    seed ?? randomSeed(),
    Date.now(),
    totalRounds ?? CROBARD_DEFAULT_ROUNDS
  )
}

export function serializeCrobardState(state: CrobardState): string {
  return JSON.stringify(state)
}

export function parseCrobardState(json: string | null): CrobardState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as CrobardState
    if (!raw || !Array.isArray(raw.players) || typeof raw.phase !== 'string') return null
    return {
      ...raw,
      rematchVotes: raw.rematchVotes ?? [],
      remainingWords: raw.remainingWords ?? [],
      strokes: raw.strokes ?? [],
      correctGuessers: raw.correctGuessers ?? [],
      speech: raw.speech ?? [],
    }
  } catch {
    return null
  }
}

export type CrobardRoomActionInput =
  | { type: 'choose-word'; index: number }
  | { type: 'draw-stroke'; stroke: Stroke }
  | { type: 'clear' }
  | { type: 'undo-stroke' }
  | { type: 'guess'; text: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'continue' }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type CrobardRoomActionResult =
  | { ok: true; state: CrobardState }
  | { ok: false; error: string }

/**
 * `sayRand` tire les paroles des bots (bot-speech.ts) : les tests le fixent,
 * la route garde Math.random. Il ne touche jamais le RNG du jeu, qui vit
 * dans l'état : une partie se rejoue à l'identique avec ou sans paroles.
 */
export function applyCrobardRoomAction(
  state: CrobardState,
  userId: string,
  input: CrobardRoomActionInput,
  sayRand: () => number = Math.random
): CrobardRoomActionResult {
  if (input.type === 'bot') return applyCrobardBotAction(state, sayRand)
  try {
    const next = reduceCrobardInput(state, userId, input)
    return {
      ok: true,
      state: withCrobardSpeech(next, crobardSpeechEvent(state, next, userId, input.type), sayRand),
    }
  } catch (e) {
    if (e instanceof CrobardEngineError) return { ok: false, error: e.message }
    throw e
  }
}

function reduceCrobardInput(
  state: CrobardState,
  userId: string,
  input: Exclude<CrobardRoomActionInput, { type: 'bot' }>
): CrobardState {
  const now = Date.now()
  switch (input.type) {
    case 'choose-word':
      return reduceCrobard(state, { type: 'CHOOSE_WORD', playerId: userId, index: input.index, now })
    case 'draw-stroke':
      return reduceCrobard(state, { type: 'DRAW_STROKE', playerId: userId, stroke: input.stroke })
    case 'clear':
      return reduceCrobard(state, { type: 'CLEAR', playerId: userId })
    case 'undo-stroke':
      return reduceCrobard(state, { type: 'UNDO_STROKE', playerId: userId })
    case 'guess':
      return reduceCrobard(state, { type: 'GUESS', playerId: userId, text: input.text, now })
    case 'advance':
      return reduceCrobard(state, { type: 'ADVANCE', claimedKey: input.phaseKey, now })
    case 'continue':
      return reduceCrobard(state, { type: 'CONTINUE', playerId: userId, now })
    case 'replace-left':
      return reduceCrobard(state, { type: 'REPLACE_LEFT', now, graceMs: input.graceMs })
  }
}

// ─── Paroles des bots ────────────────────────────────────────────────────────

/**
 * Le fait que la table vient de voir, d'après l'état avant et après le coup :
 * une manche qui s'ouvre (lancement ou « manche suivante », d'un humain ou
 * d'un bot) ou s'achève (temps écoulé ou tout le monde a trouvé) ; en plein
 * dessin, un trait posé, un effacement, une bonne réponse — d'un HUMAIN
 * seulement. Une réponse fausse ne passe pas ici : le moteur la refuse.
 */
export function crobardSpeechEvent(
  before: CrobardState,
  after: CrobardState,
  actorId: string | null,
  inputType: CrobardRoomActionInput['type']
): CrobardSpeechEvent | null {
  if (after.phase === 'choosing' && (before.phase !== 'choosing' || before.round !== after.round)) {
    return { type: 'roundStart' }
  }
  if (before.phase === 'drawing' && after.phase === 'roundEnd') return { type: 'roundEnd' }
  const actor = before.players.find((p) => p.id === actorId)
  if (!actor || actor.isBot || before.phase !== 'drawing' || after.phase !== 'drawing') return null
  if (inputType === 'draw-stroke') return { type: 'stroke' }
  if (inputType === 'clear') return { type: 'erase', strokesBefore: before.strokes.length }
  if (inputType === 'guess' && after.correctGuessers.length > before.correctGuessers.length) {
    return { type: 'found', by: actor.id }
  }
  return null
}

/**
 * L'état après le coup, avec la réaction d'un bot s'il en a une. Le
 * planificateur ne lit que la vue SPECTATEUR (jamais le mot ni les choix) ;
 * une parole que le moteur refuserait laisse le coup intact, sans parole.
 */
export function withCrobardSpeech(
  after: CrobardState,
  event: CrobardSpeechEvent | null,
  sayRand: () => number
): CrobardState {
  if (!event) return after
  const say = crobardBotSay(toCrobardSpectatorView(after), event, sayRand)
  if (!say) return after
  try {
    return addCrobardSpeech(after, say)
  } catch (e) {
    if (e instanceof CrobardEngineError) return after
    throw e
  }
}

export function markCrobardPlayerLeft(state: CrobardState, playerId: string, at: number): CrobardState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt || state.phase === 'finished') return null
  return reduceCrobard(state, { type: 'LEAVE', playerId, at })
}

export function rejoinCrobardPlayer(state: CrobardState, playerId: string): CrobardState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || !player.leftAt) return null
  return reduceCrobard(state, { type: 'REJOIN', playerId })
}

export function convertCrobardPlayerToBot(state: CrobardState, playerId: string): CrobardState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
    version: state.version + 1,
  }
}

export function crobardClientViewJson(state: CrobardState, viewerId: string): string {
  return JSON.stringify(toCrobardClientView(state, viewerId))
}

export function crobardSpectatorViewJson(state: CrobardState): string {
  return JSON.stringify(toCrobardSpectatorView(state))
}

// ─── Bots ────────────────────────────────────────────────────────────────────

/**
 * Un bot ne choisit jamais de mot, ne dessine jamais et ne devine jamais
 * (IA volontairement faible, assumée). Quand le dessinateur tiré est un
 * bot, la manche s'écourte d'elle-même côté moteur
 * (`CROBARD_BOT_DRAWER_ROUND_MS`) — rien à faire ici. Seul le bilan de
 * manche (`roundEnd`) a besoin d'un bot qui « continue » s'il est le
 * premier joueur actif restant ; la manche qu'il ouvre peut porter une
 * réaction.
 */
export function applyCrobardBotAction(
  state: CrobardState,
  sayRand: () => number = Math.random
): CrobardRoomActionResult {
  try {
    const actorId = currentCrobardActorId(state)
    const actor = state.players.find((p) => p.id === actorId)
    if (!actor?.isBot) return { ok: false, error: 'NOT_BOT_TURN' }
    if (state.phase === 'roundEnd') {
      const next = reduceCrobard(state, { type: 'CONTINUE', playerId: actor.id, now: Date.now() })
      return {
        ok: true,
        state: withCrobardSpeech(next, crobardSpeechEvent(state, next, actor.id, 'bot'), sayRand),
      }
    }
    return { ok: false, error: 'NOT_BOT_TURN' }
  } catch (e) {
    if (e instanceof CrobardEngineError) return { ok: false, error: e.message }
    throw e
  }
}

export { phaseKey }
