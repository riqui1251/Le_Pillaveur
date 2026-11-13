import { createRng, rngFromState } from '@/lib/petit-buveur/rng'
import { checkAdvance, phaseKey } from '@/lib/online/phase-clock'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import {
  CHIFFRE_PIEGE_DEFAULT_RANGE,
  CHIFFRE_PIEGE_DEFAULT_ROUNDS,
  createChiffrePiegeGame,
  currentChiffrePiegePlayerId,
  guessChiffrePiege,
  hasChiffrePiegeJoker,
  isChiffrePiegeRange,
  isChiffrePiegeRoundCount,
  nextChiffrePiegeRound,
  passChiffrePiege,
  toChiffrePiegePublicView,
  type ChiffrePiegePublicView,
  type ChiffrePiegeResult,
  type ChiffrePiegeState,
} from './engine'
import {
  CHIFFRE_PIEGE_ONLINE_BOOM_MS,
  CHIFFRE_PIEGE_ONLINE_MAX_PLAYERS,
  CHIFFRE_PIEGE_ONLINE_MIN_PLAYERS,
  chiffrePiegeContinueAt,
  chiffrePiegePlaysAuto,
  type ChiffrePiegeClientView,
  type ChiffrePiegeOnlinePlayer,
  type ChiffrePiegeOnlineState,
} from './online-state'

/**
 * Adaptateur serveur du Chiffre Piégé en ligne : construction de la table
 * (bots compris), lecture/écriture de l'état, intentions des joueurs → moteur
 * partagé, cerveau des bots, départs et retours, vues sans secret. Les
 * fonctions reçoivent l'heure (`now`) et le hasard frais (`entropy`) :
 * l'adaptateur du registre (online-adapter.ts) leur passe ceux du serveur.
 */

export interface ChiffrePiegeRoomMember {
  userId: string
  user: { displayName: string }
}

/** Réglages de la table tels que l'hôte les a posés : validés ici, défauts du jeu local sinon. */
export type ChiffrePiegeTableSettings = { max?: unknown; rounds?: unknown }

/** Source de hasard frais (entier de 32 bits) : injectable comme l'heure, les tests en passent une fixe. */
export type ChiffrePiegeEntropy = () => number

/**
 * Hasard cryptographique du serveur. Les pièges ne s'enchaînent pas sur un
 * même générateur : mulberry32 n'a que 32 bits d'état, et le premier joueur
 * plus quelques pièges révélés suffisaient à le retrouver par force brute,
 * donc à prédire les pièges suivants.
 */
export function chiffrePiegeEntropy(): number {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
}

/**
 * Table neuve : les membres dans l'ordre de la salle, puis les bots choisis
 * par l'hôte, et toujours de quoi atteindre le minimum (relance après des
 * départs).
 *
 * Sans graine (lancement réel), la partie, les noms des bots et leurs coups
 * partent de trois tirages INDÉPENDANTS : ce que la table voit des bots ne dit
 * rien du piège. Une graine (tests) fait tout dériver d'elle : table rejouable.
 */
export function buildChiffrePiegeState(
  members: readonly ChiffrePiegeRoomMember[],
  botsCount: number = 0,
  seed?: string | number,
  settings: ChiffrePiegeTableSettings = {},
  entropy: ChiffrePiegeEntropy = chiffrePiegeEntropy
): ChiffrePiegeOnlineState {
  const seeds =
    seed === undefined
      ? { game: entropy(), bots: entropy(), server: entropy() }
      : { game: seed, bots: `${seed}#bots`, server: `${seed}#serveur` }
  const players: ChiffrePiegeOnlinePlayer[] = members.map((m) => ({
    id: m.userId,
    name: m.user.displayName,
    isBot: false,
    leftAt: null,
  }))
  const wanted = Math.max(0, Math.min(Math.floor(botsCount) || 0, CHIFFRE_PIEGE_ONLINE_MAX_PLAYERS - players.length))
  const botCount = Math.max(wanted, CHIFFRE_PIEGE_ONLINE_MIN_PLAYERS - players.length)
  pickBotPersonas(botCount, createRng(seeds.bots).next).forEach((persona, index) => {
    players.push({ id: `bot-${index + 1}`, name: botDisplayName(persona), isBot: true, leftAt: null })
  })

  const created = createChiffrePiegeGame({
    playerIds: players.map((p) => p.id),
    settings: {
      max: isChiffrePiegeRange(settings.max) ? settings.max : CHIFFRE_PIEGE_DEFAULT_RANGE,
      rounds: isChiffrePiegeRoundCount(settings.rounds) ? settings.rounds : CHIFFRE_PIEGE_DEFAULT_ROUNDS,
    },
    seed: seeds.game,
  })
  // Inatteignable (table complétée, réglages validés) : un lancement impossible doit se voir.
  if (!created.ok) throw new Error(`chiffre-piege: ${created.error}`)

  return {
    version: 1,
    phase: created.state.phase,
    phaseSeq: 1,
    phaseEndsAt: null,
    players,
    rematchVotes: [],
    rngState: createRng(seeds.server).getState(),
    game: created.state,
  }
}

export function serializeChiffrePiegeState(state: ChiffrePiegeOnlineState): string {
  return JSON.stringify(state)
}

/** État persisté, ou null s'il est absent ou illisible (jamais d'exception). */
export function parseChiffrePiegeState(json: string | null): ChiffrePiegeOnlineState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Partial<ChiffrePiegeOnlineState> | null
    if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number' || typeof raw.phase !== 'string') return null
    if (!Array.isArray(raw.players) || typeof raw.rngState !== 'number') return null
    const game = raw.game
    if (!game || typeof game !== 'object' || !Array.isArray(game.playerIds) || !Array.isArray(game.awayIds)) return null
    return {
      ...(raw as ChiffrePiegeOnlineState),
      phaseSeq: typeof raw.phaseSeq === 'number' ? raw.phaseSeq : 0,
      phaseEndsAt: typeof raw.phaseEndsAt === 'number' ? raw.phaseEndsAt : null,
      rematchVotes: Array.isArray(raw.rematchVotes) ? raw.rematchVotes : [],
    }
  } catch {
    return null
  }
}

export type ChiffrePiegeRoomActionInput =
  | { type: 'guess'; value: number }
  | { type: 'pass' }
  | { type: 'next'; phaseKey: string }
  | { type: 'advance'; phaseKey: string }
  | { type: 'bot' }
  | { type: 'replace-left'; graceMs: number }

export type ChiffrePiegeRoomActionResult =
  | { ok: true; state: ChiffrePiegeOnlineState }
  | { ok: false; error: string }

const fail = (error: string): ChiffrePiegeRoomActionResult => ({ ok: false, error })

/**
 * Écrit le nouvel état du moteur dans l'enveloppe : version +1, phase
 * recopiée, horloge de phase réarmée seulement quand la phase CHANGE (le BOUM
 * reçoit son échéance, la manche et la fin n'en ont pas).
 */
function commit(
  state: ChiffrePiegeOnlineState,
  game: ChiffrePiegeState,
  now: number,
  patch: Partial<Pick<ChiffrePiegeOnlineState, 'players' | 'rngState'>> = {}
): ChiffrePiegeOnlineState {
  const entering = game.phase !== state.phase
  return {
    ...state,
    ...patch,
    game,
    version: state.version + 1,
    phase: game.phase,
    phaseSeq: entering ? state.phaseSeq + 1 : state.phaseSeq,
    phaseEndsAt: entering ? (game.phase === 'boom' ? now + CHIFFRE_PIEGE_ONLINE_BOOM_MS : null) : state.phaseEndsAt,
  }
}

function fromEngine(
  state: ChiffrePiegeOnlineState,
  result: ChiffrePiegeResult,
  now: number,
  patch?: Partial<Pick<ChiffrePiegeOnlineState, 'players' | 'rngState'>>
): ChiffrePiegeRoomActionResult {
  return result.ok ? { ok: true, state: commit(state, result.state, now, patch) } : fail(result.error)
}

export type ChiffrePiegeBotMove = { kind: 'guess'; value: number } | { kind: 'pass' }

/**
 * Cerveau d'un siège automatique (bot, ou joueur parti) : il ne lit que la
 * vue PUBLIQUE (le type n'a pas de piège). Un nombre au hasard dans
 * l'intervalle, et son joker seulement quand il ne reste que le piège.
 */
export function chiffrePiegeBotMove(view: ChiffrePiegePublicView, botId: string, rand: () => number): ChiffrePiegeBotMove {
  if (view.low === view.high && hasChiffrePiegeJoker(view, botId)) return { kind: 'pass' }
  const span = view.high - view.low + 1
  return { kind: 'guess', value: view.low + Math.min(span - 1, Math.floor(rand() * span)) }
}

/**
 * Tick `bot` : le siège au tour joue s'il est automatique, bot ou parti (le
 * BOUM d'un parti est le sien). NOT_BOT_TURN quand un présent a la main :
 * jamais d'écriture à vide.
 */
export function applyChiffrePiegeBotAction(state: ChiffrePiegeOnlineState, now: number): ChiffrePiegeRoomActionResult {
  if (state.phase !== 'playing') return fail('NOT_BOT_TURN')
  const actorId = currentChiffrePiegePlayerId(state.game)
  const actor = actorId === null ? undefined : state.players.find((p) => p.id === actorId)
  if (!actor || !chiffrePiegePlaysAuto(actor)) return fail('NOT_BOT_TURN')
  const rng = rngFromState(state.rngState)
  const move = chiffrePiegeBotMove(toChiffrePiegePublicView(state.game), actor.id, rng.next)
  const result =
    move.kind === 'pass'
      ? passChiffrePiege(state.game, { playerId: actor.id })
      : guessChiffrePiege(state.game, { playerId: actor.id, value: move.value, now })
  return fromEngine(state, result, now, { rngState: rng.getState() })
}

/** Manche suivante (ou classement) : son piège sort d'un hasard frais, que rien de public ne contraint. */
function openNextRound(state: ChiffrePiegeOnlineState, now: number, entropy: ChiffrePiegeEntropy): ChiffrePiegeRoomActionResult {
  const game: ChiffrePiegeState = { ...state.game, rngState: entropy() >>> 0 }
  return fromEngine(state, nextChiffrePiegeRound(game, { now, skipReadingTime: true }), now)
}

/** Manche suivante demandée par un joueur présent, une fois le BOUM lu. */
function requestNextRound(
  state: ChiffrePiegeOnlineState,
  userId: string,
  claimedKey: string,
  now: number,
  entropy: ChiffrePiegeEntropy
): ChiffrePiegeRoomActionResult {
  // Deux joueurs appuient ensemble : le second arrive sur la manche suivante, course muette.
  if (state.phase !== 'boom' || claimedKey !== phaseKey(state)) return fail('PHASE_CHANGED')
  const player = state.players.find((p) => p.id === userId)
  if (!player || player.isBot || player.leftAt !== null) return fail('UNKNOWN_PLAYER')
  const readyAt = chiffrePiegeContinueAt(state)
  if (readyAt !== null && now < readyAt) return fail('READING_TIME')
  return openNextRound(state, now, entropy)
}

/** Échéance du BOUM : n'importe quel téléphone (ou le serveur) l'envoie, une seule passe. */
function advanceBoom(
  state: ChiffrePiegeOnlineState,
  claimedKey: string,
  now: number,
  entropy: ChiffrePiegeEntropy
): ChiffrePiegeRoomActionResult {
  const check = checkAdvance(state, claimedKey, now)
  if (!check.ok) return fail(check.error)
  if (state.phase !== 'boom') return fail('NOTHING_TO_ADVANCE')
  return openNextRound(state, now, entropy)
}

/** Partis depuis la grâce entière → bots, à la place qu'ils n'ont jamais quittée. */
function replaceLeftPlayers(state: ChiffrePiegeOnlineState, now: number, graceMs: number): ChiffrePiegeRoomActionResult {
  if (state.phase === 'finished') return fail('NOTHING_TO_REPLACE')
  const expired = state.players.filter((p) => !p.isBot && p.leftAt !== null && now - p.leftAt >= graceMs)
  if (expired.length === 0) return fail('NOTHING_TO_REPLACE')
  const ids = new Set(expired.map((p) => p.id))
  const players = state.players.map((p) => (ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p))
  return { ok: true, state: commit(state, state.game, now, { players }) }
}

export function applyChiffrePiegeRoomAction(
  state: ChiffrePiegeOnlineState,
  userId: string,
  input: ChiffrePiegeRoomActionInput,
  now: number,
  entropy: ChiffrePiegeEntropy = chiffrePiegeEntropy
): ChiffrePiegeRoomActionResult {
  switch (input.type) {
    case 'guess':
      return fromEngine(state, guessChiffrePiege(state.game, { playerId: userId, value: input.value, now }), now)
    case 'pass':
      return fromEngine(state, passChiffrePiege(state.game, { playerId: userId }), now)
    case 'next':
      return requestNextRound(state, userId, input.phaseKey, now, entropy)
    case 'advance':
      return advanceBoom(state, input.phaseKey, now, entropy)
    case 'bot':
      return applyChiffrePiegeBotAction(state, now)
    case 'replace-left':
      return replaceLeftPlayers(state, now, input.graceMs)
  }
}

/**
 * Départ en pleine partie : marqué parti, il GARDE sa place et la main ne le
 * saute pas. Ses tours se jouent pour lui (`bot`), dernier nombre compris :
 * partir puis revenir servait de joker gratuit. Null = rien à faire.
 */
export function markChiffrePiegePlayerLeft(
  state: ChiffrePiegeOnlineState,
  playerId: string,
  at: number
): ChiffrePiegeOnlineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt !== null || state.phase === 'finished') return null
  const players = state.players.map((p) => (p.id === playerId ? { ...p, leftAt: at } : p))
  return commit(state, state.game, at, { players })
}

/** Retour d'un parti (tant qu'un bot ne l'a pas remplacé) : il rejoue lui-même à sa place. Null = impossible. */
export function rejoinChiffrePiegePlayer(state: ChiffrePiegeOnlineState, playerId: string): ChiffrePiegeOnlineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || player.leftAt === null) return null
  return {
    ...state,
    version: state.version + 1,
    players: state.players.map((p) => (p.id === playerId ? { ...p, leftAt: null } : p)),
  }
}

/** Joueur inactif au tour (`replace-afk`, horloge validée par la route) → bot, qui reprend la main. */
export function convertChiffrePiegePlayerToBot(
  state: ChiffrePiegeOnlineState,
  playerId: string
): ChiffrePiegeOnlineState | null {
  const player = state.players.find((p) => p.id === playerId)
  if (!player || player.isBot || state.phase === 'finished') return null
  return {
    ...state,
    version: state.version + 1,
    players: state.players.map((p) => (p.id === playerId ? { ...p, isBot: true, leftAt: null } : p)),
  }
}

/** Vue sans secret (ni piège en cours, ni graines), la même pour tout le monde. */
export function toChiffrePiegeClientView(state: ChiffrePiegeOnlineState): ChiffrePiegeClientView {
  const { rngState: _rngState, game, ...rest } = state
  return {
    ...rest,
    game: toChiffrePiegePublicView(game),
    phaseKey: phaseKey(state),
    continueAt: chiffrePiegeContinueAt(state),
  }
}

export function chiffrePiegeClientViewJson(state: ChiffrePiegeOnlineState): string {
  return JSON.stringify(toChiffrePiegeClientView(state))
}

/** La TV voit exactement ce que voient les joueurs : aucun secret par joueur dans ce jeu. */
export function chiffrePiegeSpectatorViewJson(state: ChiffrePiegeOnlineState): string {
  return JSON.stringify(toChiffrePiegeClientView(state))
}
