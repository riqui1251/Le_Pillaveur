import {
  parseEngineState,
  serializeEngineState,
  applyRoomAction,
  applyBotAction,
  convertPlayerToBot,
  replaceExpiredWithBots,
  markPlayerLeft,
  rejoinPlayer,
  toClientView,
} from '@/lib/petit-buveur/server-adapter'
import { currentPlayerId, type EngineState } from '@/lib/petit-buveur/engine'
import {
  parseTCState,
  serializeTCState,
  applyTCRoomAction,
  convertTCPlayerToBot,
  tcClientViewJson,
  tcSpectatorViewJson,
  type TCRoomActionInput,
} from '@/lib/toucher-coule/server-adapter'
import { currentTCPlayerId, reduceTC, toTCClientView, type TCState } from '@/lib/toucher-coule/engine'
import {
  parseMenteurState,
  serializeMenteurState,
  applyMenteurRoomAction,
  convertMenteurPlayerToBot,
  markMenteurPlayerLeft,
  rejoinMenteurPlayer,
  menteurClientViewJson,
  menteurSpectatorViewJson,
  type MenteurRoomActionInput,
} from '@/lib/menteur/server-adapter'
import {
  currentMenteurActorId,
  toMenteurClientView,
  MENTEUR_MAX_PLAYERS,
  type MenteurState,
} from '@/lib/menteur/engine'
import {
  parseImposteurState,
  serializeImposteurState,
  applyImposteurRoomAction,
  convertImposteurPlayerToBot,
  markImposteurPlayerLeft,
  rejoinImposteurPlayer,
  imposteurClientViewJson,
  imposteurSpectatorViewJson,
  type ImposteurRoomActionInput,
} from '@/lib/imposteur/server-adapter'
import {
  currentImposteurActorId,
  toImposteurClientView,
  IMPOSTEUR_MIN_PLAYERS,
  IMPOSTEUR_MAX_PLAYERS,
  type ImposteurState,
} from '@/lib/imposteur/engine'
import {
  parseQuizState,
  serializeQuizState,
  applyQuizRoomAction,
  convertQuizPlayerToBot,
  markQuizPlayerLeft,
  rejoinQuizPlayer,
  quizClientViewJson,
  quizSpectatorViewJson,
  type QuizRoomActionInput,
} from '@/lib/quiz/server-adapter'
import {
  currentQuizActorId,
  toQuizClientView,
  QUIZ_MAX_PLAYERS,
  type QuizState,
} from '@/lib/quiz/engine'
import {
  parseLGState,
  serializeLGState,
  applyLGRoomAction,
  convertLGPlayerToBot,
  markLGPlayerLeft,
  rejoinLGPlayer,
  lgClientViewJson,
  lgSpectatorViewJson,
  type LGRoomActionInput,
} from '@/lib/loup-garou/server-adapter'
import {
  currentLGActorId,
  toLGClientView,
  LG_MIN_PLAYERS,
  LG_MAX_PLAYERS,
  type LGState,
} from '@/lib/loup-garou/engine'
import {
  parseGame1220State,
  serializeGame1220State,
  applyGame1220RoomAction,
  convertGame1220PlayerToBot,
  markGame1220PlayerLeft,
  rejoinGame1220Player,
  game1220ClientViewJson,
  game1220SpectatorViewJson,
  type Game1220RoomActionInput,
} from '@/lib/1220/server-adapter'
import {
  currentGame1220ActorId,
  toGame1220ClientView,
  GAME_1220_MIN_PLAYERS,
  GAME_1220_MAX_PLAYERS,
  type Game1220State,
} from '@/lib/1220/engine'
import type { Choices1220 } from '@/lib/game-1220'
import {
  parsePurpleState,
  serializePurpleState,
  applyPurpleRoomAction,
  convertPurplePlayerToBot,
  markPurplePlayerLeft,
  rejoinPurplePlayer,
  purpleClientViewJson,
  purpleSpectatorViewJson,
  type PurpleRoomActionInput,
} from '@/lib/purple/server-adapter'
import {
  currentPurpleActorId,
  toPurpleClientView,
  PURPLE_MIN_PLAYERS,
  PURPLE_MAX_PLAYERS,
  type PurpleState,
  type PurpleBet,
} from '@/lib/purple/engine'
import {
  parseBluffState,
  serializeBluffState,
  applyBluffRoomAction,
  convertBluffPlayerToBot,
  markBluffPlayerLeft,
  rejoinBluffPlayer,
  bluffClientViewJson,
  bluffSpectatorViewJson,
  type BluffRoomActionInput,
} from '@/lib/bluff/server-adapter'
import {
  currentBluffActorId,
  toBluffClientView,
  BLUFF_MIN_PLAYERS,
  BLUFF_MAX_PLAYERS,
  type BluffState,
} from '@/lib/bluff/engine'
import {
  parseEspionState,
  serializeEspionState,
  applyEspionRoomAction,
  convertEspionPlayerToBot,
  markEspionPlayerLeft,
  rejoinEspionPlayer,
  espionClientViewJson,
  espionSpectatorViewJson,
  type EspionRoomActionInput,
} from '@/lib/espion/server-adapter'
import {
  currentEspionActorId,
  toEspionClientView,
  ESPION_MIN_PLAYERS,
  ESPION_MAX_PLAYERS,
  type EspionState,
} from '@/lib/espion/engine'
import {
  parseTabouState,
  serializeTabouState,
  applyTabouRoomAction,
  convertTabouPlayerToBot,
  markTabouPlayerLeft,
  rejoinTabouPlayer,
  tabouClientViewJson,
  tabouSpectatorViewJson,
  type TabouRoomActionInput,
} from '@/lib/tabou/server-adapter'
import {
  currentTabouActorId,
  toTabouClientView,
  TABOU_MIN_PLAYERS,
  TABOU_MAX_PLAYERS,
  type TabouState,
} from '@/lib/tabou/engine'
import {
  parseCrobardState,
  serializeCrobardState,
  applyCrobardRoomAction,
  convertCrobardPlayerToBot,
  markCrobardPlayerLeft,
  rejoinCrobardPlayer,
  crobardClientViewJson,
  crobardSpectatorViewJson,
  type CrobardRoomActionInput,
} from '@/lib/crobard/server-adapter'
import {
  currentCrobardActorId,
  toCrobardClientView,
  CROBARD_MIN_PLAYERS,
  CROBARD_MAX_PLAYERS,
  type CrobardState,
  type Stroke,
} from '@/lib/crobard/engine'
import {
  parseTelephoneState,
  serializeTelephoneState,
  applyTelephoneRoomAction,
  convertTelephonePlayerToBot,
  markTelephonePlayerLeft,
  rejoinTelephonePlayer,
  telephoneClientViewJson,
  telephoneSpectatorViewJson,
  type TelephoneRoomActionInput,
} from '@/lib/telephone-dessine/server-adapter'
import {
  currentTelephoneActorId,
  toTelephoneClientView,
  TELEPHONE_MIN_PLAYERS,
  TELEPHONE_MAX_PLAYERS,
  type TelephoneState,
} from '@/lib/telephone-dessine/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'

/**
 * REGISTRE des jeux serveur-autoritaires.
 *
 * Un jeu en ligne = une entrée `GameAdapter` : la route `action`, les routes
 * leave/rejoin, les vues anti-triche (par joueur + spectateur TV) et les
 * bornes de lancement passent TOUTES par cette interface. Ajouter un jeu
 * n'exige plus de toucher aux routes — seulement d'enregistrer son adaptateur.
 *
 * Convention d'état minimale (contrat remplacement, voir replacement.ts) :
 * `players: [{ id, isBot?, leftAt? }]` + `phase` avec un état 'finished'.
 */

export type AdapterActionResult =
  | { ok: true; state: unknown }
  | { ok: false; error: string; status: number }

export type GameAdapter = {
  /** Bornes de lancement (enforcement lobby ; TC garde sa logique par équipes). */
  minPlayers: number
  maxPlayers: number
  /**
   * Le jeu peut être lancé sous `minPlayers` humains quand l'hôte active
   * l'option « compléter avec des bots » (RoomSettings.botsFill) — le launch
   * comble alors les places jusqu'au minimum du moteur.
   */
  botsFillable?: boolean
  /** Parse l'état persisté. Null si absent/corrompu. */
  parse(json: string | null): unknown
  serialize(state: unknown): string
  /**
   * Dispatch COMPLET du body HTTP de la route action : actions du jeu +
   * ticks communs `bot` / `replace-left`. Le mapping body→input appartient
   * au jeu (statuts d'erreur inclus, pour préserver les contrats existants).
   */
  applyAction(state: unknown, userId: string, body: Record<string, unknown>): AdapterActionResult
  /** `replace-afk` : joueur au tour → bot (validation horloge côté route). Null si rien à faire. */
  convertToBot(state: unknown, userId: string): unknown
  isFinished(state: unknown): boolean
  /** Joueur « au tour » (null si aucun — partie finie, phase simultanée…). */
  currentActorId(state: unknown): string | null
  /** Vue par joueur (anti-triche asymétrique) — JSON prêt à envoyer. */
  clientViewJson(state: unknown, viewerId: string): string
  /** Vue spectateur NEUTRE (écran TV partagé) — JSON prêt à envoyer. */
  spectatorViewJson(state: unknown): string
  /** Fragment de réponse de la route action (compat des shapes client existants). */
  actionResponse(state: unknown, viewerId: string): Record<string, unknown>
  /** Quitter en cours de partie → marqué « parti » (3 min pour revenir). Null = no-op. */
  markLeft(state: unknown, userId: string, at: number): unknown
  /** Retour d'un joueur parti (tant qu'un bot ne l'a pas remplacé). Null = impossible. */
  rejoin(state: unknown, userId: string): unknown
}

// ─── Petit Buveur ────────────────────────────────────────────────────────────

const petitBuveurAdapter: GameAdapter = {
  minPlayers: 2,
  // Pas de plafond historique pour le Petit Buveur — on n'introduit pas de
  // régression : borne haute purement théorique.
  maxPlayers: 99,
  parse: (json) => parseEngineState(json),
  serialize: (state) => serializeEngineState(state as EngineState),
  applyAction(rawState, userId, body) {
    const state = rawState as EngineState
    if (body.action === 'replace-left') {
      const replaced = replaceExpiredWithBots(state, Date.now(), ONLINE_REPLACE_GRACE_MS)
      if (!replaced) return { ok: false, error: 'NOTHING_TO_REPLACE', status: 409 }
      return { ok: true, state: replaced }
    }
    if (body.action === 'bot') {
      const result = applyBotAction(state)
      if (!result.ok) return { ok: false, error: result.error, status: 403 }
      return { ok: true, state: result.state }
    }
    const input =
      body.action === 'resolve'
        ? {
            type: 'resolve' as const,
            choice:
              body.choice && typeof body.choice === 'object'
                ? (body.choice as Record<string, unknown>)
                : undefined,
          }
        : { type: 'roll' as const }
    const result = applyRoomAction(state, userId, input)
    if (!result.ok) return { ok: false, error: result.error, status: 403 }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertPlayerToBot(state as EngineState, userId),
  isFinished: (state) => (state as EngineState).phase === 'finished',
  currentActorId: (state) => currentPlayerId(state as EngineState),
  clientViewJson: (state) => JSON.stringify(toClientView(state as EngineState)),
  spectatorViewJson: (state) => JSON.stringify(toClientView(state as EngineState)),
  actionResponse: (state) => ({ view: toClientView(state as EngineState) }),
  markLeft: (state, userId, at) => markPlayerLeft(state as EngineState, userId, at),
  rejoin: (state, userId) => rejoinPlayer(state as EngineState, userId),
}

// ─── Toucher-Coulé ───────────────────────────────────────────────────────────

const toucherCouleAdapter: GameAdapter = {
  // Informatif : la capacité réelle dépend du format d'équipes (settings.tcMode),
  // gérée par les branches dédiées du lobby/join (bots de complément).
  minPlayers: 1,
  maxPlayers: 8,
  parse: (json) => parseTCState(json),
  serialize: (state) => serializeTCState(state as TCState),
  applyAction(rawState, userId, body) {
    const state = rawState as TCState
    let input: TCRoomActionInput
    if (body.action === 'place' && Array.isArray(body.ships)) {
      input = { type: 'place', ships: body.ships as number[][] }
    } else if (body.action === 'fire' && typeof body.cell === 'number') {
      input = { type: 'fire', cell: body.cell, bomb: body.bomb === true }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left' }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyTCRoomAction(state, userId, input)
    if (!result.ok) return { ok: false, error: result.error, status: 403 }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertTCPlayerToBot(state as TCState, userId),
  isFinished: (state) => (state as TCState).phase === 'finished',
  currentActorId: (state) => currentTCPlayerId(state as TCState),
  clientViewJson: (state, viewerId) => tcClientViewJson(state as TCState, viewerId),
  spectatorViewJson: (state) => tcSpectatorViewJson(state as TCState),
  actionResponse: (state, viewerId) => ({
    view: toTCClientView(state as TCState, viewerId),
    viewJson: tcClientViewJson(state as TCState, viewerId),
  }),
  markLeft(rawState, userId, at) {
    const state = rawState as TCState
    const player = state.players.find((p) => p.id === userId && !p.isBot)
    if (!player || state.phase === 'finished' || player.leftAt) return null
    return reduceTC(state, { type: 'LEAVE', playerId: userId, at })
  },
  rejoin(rawState, userId) {
    const state = rawState as TCState
    const player = state.players.find((p) => p.id === userId && !p.isBot && p.leftAt)
    if (!player) return null
    return reduceTC(state, { type: 'REJOIN', playerId: userId })
  },
}

// ─── Le Menteur ──────────────────────────────────────────────────────────────

const menteurAdapter: GameAdapter = {
  // 2 humains par défaut ; avec l'option bots du lobby, un joueur seul peut
  // lancer (buildMenteurState comble jusqu'à 2).
  minPlayers: 2,
  maxPlayers: MENTEUR_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseMenteurState(json),
  serialize: (state) => serializeMenteurState(state as MenteurState),
  applyAction(rawState, userId, body) {
    const state = rawState as MenteurState
    let input: MenteurRoomActionInput
    if (
      body.action === 'bid' &&
      typeof body.qty === 'number' &&
      typeof body.face === 'number'
    ) {
      input = { type: 'bid', qty: body.qty, face: body.face }
    } else if (body.action === 'dudo') {
      input = { type: 'dudo' }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyMenteurRoomAction(state, userId, input)
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        status: result.error === 'NOTHING_TO_REPLACE' ? 409 : 403,
      }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertMenteurPlayerToBot(state as MenteurState, userId),
  isFinished: (state) => (state as MenteurState).phase === 'finished',
  currentActorId: (state) => currentMenteurActorId(state as MenteurState),
  clientViewJson: (state, viewerId) => menteurClientViewJson(state as MenteurState, viewerId),
  spectatorViewJson: (state) => menteurSpectatorViewJson(state as MenteurState),
  actionResponse: (state, viewerId) => ({
    view: toMenteurClientView(state as MenteurState, viewerId),
    viewJson: menteurClientViewJson(state as MenteurState, viewerId),
  }),
  markLeft: (state, userId, at) => markMenteurPlayerLeft(state as MenteurState, userId, at),
  rejoin: (state, userId) => rejoinMenteurPlayer(state as MenteurState, userId),
}

// ─── L'Imposteur ─────────────────────────────────────────────────────────────

const imposteurAdapter: GameAdapter = {
  // 3 humains par défaut (déduction sociale) ; avec l'option bots du lobby,
  // un joueur seul peut lancer (buildImposteurState comble jusqu'à 3).
  minPlayers: IMPOSTEUR_MIN_PLAYERS,
  maxPlayers: IMPOSTEUR_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseImposteurState(json),
  serialize: (state) => serializeImposteurState(state as ImposteurState),
  applyAction(rawState, userId, body) {
    const state = rawState as ImposteurState
    let input: ImposteurRoomActionInput
    if (body.action === 'clue' && typeof body.text === 'string') {
      input = { type: 'clue', text: body.text }
    } else if (body.action === 'vote' && typeof body.targetId === 'string') {
      input = { type: 'vote', targetId: body.targetId }
    } else if (body.action === 'advance' && typeof body.phaseKey === 'string') {
      input = { type: 'advance', phaseKey: body.phaseKey }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyImposteurRoomAction(state, userId, input)
    if (!result.ok) {
      // Les erreurs de tick (déjà avancé / pas encore l'heure) sont des 409
      // « conflits » attendus, pas des interdictions.
      const conflict = ['NOTHING_TO_REPLACE', 'NOT_EXPIRED', 'PHASE_CHANGED'].includes(
        result.error
      )
      return { ok: false, error: result.error, status: conflict ? 409 : 403 }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertImposteurPlayerToBot(state as ImposteurState, userId),
  isFinished: (state) => (state as ImposteurState).phase === 'finished',
  currentActorId: (state) => currentImposteurActorId(state as ImposteurState),
  clientViewJson: (state, viewerId) => imposteurClientViewJson(state as ImposteurState, viewerId),
  spectatorViewJson: (state) => imposteurSpectatorViewJson(state as ImposteurState),
  actionResponse: (state, viewerId) => ({
    view: toImposteurClientView(state as ImposteurState, viewerId),
    viewJson: imposteurClientViewJson(state as ImposteurState, viewerId),
  }),
  markLeft: (state, userId, at) => markImposteurPlayerLeft(state as ImposteurState, userId, at),
  rejoin: (state, userId) => rejoinImposteurPlayer(state as ImposteurState, userId),
}

// ─── Le Grand Pillaveur (quiz) ───────────────────────────────────────────────

const quizAdapter: GameAdapter = {
  // 2 humains par défaut ; avec l'option bots du lobby, un joueur seul peut
  // lancer (buildQuizState comble jusqu'à 2).
  minPlayers: 2,
  maxPlayers: QUIZ_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseQuizState(json),
  serialize: (state) => serializeQuizState(state as QuizState),
  applyAction(rawState, userId, body) {
    const state = rawState as QuizState
    let input: QuizRoomActionInput
    if (body.action === 'answer' && typeof body.choice === 'number') {
      input = { type: 'answer', choice: body.choice }
    } else if (body.action === 'advance' && typeof body.phaseKey === 'string') {
      input = { type: 'advance', phaseKey: body.phaseKey }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyQuizRoomAction(state, userId, input)
    if (!result.ok) {
      const conflict = ['NOTHING_TO_REPLACE', 'NOT_EXPIRED', 'PHASE_CHANGED'].includes(
        result.error
      )
      return { ok: false, error: result.error, status: conflict ? 409 : 403 }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertQuizPlayerToBot(state as QuizState, userId),
  isFinished: (state) => (state as QuizState).phase === 'finished',
  currentActorId: () => currentQuizActorId(),
  clientViewJson: (state, viewerId) => quizClientViewJson(state as QuizState, viewerId),
  spectatorViewJson: (state) => quizSpectatorViewJson(state as QuizState),
  actionResponse: (state, viewerId) => ({
    view: toQuizClientView(state as QuizState, viewerId),
    viewJson: quizClientViewJson(state as QuizState, viewerId),
  }),
  markLeft: (state, userId, at) => markQuizPlayerLeft(state as QuizState, userId, at),
  rejoin: (state, userId) => rejoinQuizPlayer(state as QuizState, userId),
}

// ─── Loup-Garou ──────────────────────────────────────────────────────────────

const loupGarouAdapter: GameAdapter = {
  // 3 humains par défaut (déduction sociale) ; avec l'option bots du lobby,
  // un joueur seul peut lancer (buildLGState comble jusqu'à 3).
  minPlayers: LG_MIN_PLAYERS,
  maxPlayers: LG_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseLGState(json),
  serialize: (state) => serializeLGState(state as LGState),
  applyAction(rawState, userId, body) {
    const state = rawState as LGState
    let input: LGRoomActionInput
    if (body.action === 'guard-protect' && typeof body.targetId === 'string') {
      input = { type: 'guard-protect', targetId: body.targetId }
    } else if (body.action === 'raven-mark' && typeof body.targetId === 'string') {
      input = { type: 'raven-mark', targetId: body.targetId }
    } else if (body.action === 'seer-peek' && typeof body.targetId === 'string') {
      input = { type: 'seer-peek', targetId: body.targetId }
    } else if (body.action === 'wolf-vote' && typeof body.targetId === 'string') {
      input = { type: 'wolf-vote', targetId: body.targetId }
    } else if (
      body.action === 'witch' &&
      (body.witchAction === 'save' || body.witchAction === 'kill' || body.witchAction === 'none')
    ) {
      input = {
        type: 'witch',
        witchAction: body.witchAction,
        targetId: typeof body.targetId === 'string' ? body.targetId : undefined,
      }
    } else if (body.action === 'hunter-shot' && typeof body.targetId === 'string') {
      input = { type: 'hunter-shot', targetId: body.targetId }
    } else if (body.action === 'debate-skip') {
      input = { type: 'debate-skip' }
    } else if (body.action === 'day-vote' && typeof body.targetId === 'string') {
      input = { type: 'day-vote', targetId: body.targetId }
    } else if (body.action === 'advance' && typeof body.phaseKey === 'string') {
      input = { type: 'advance', phaseKey: body.phaseKey }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyLGRoomAction(state, userId, input)
    if (!result.ok) {
      const conflict = ['NOTHING_TO_REPLACE', 'NOT_EXPIRED', 'PHASE_CHANGED', 'NOT_BOT_TURN'].includes(
        result.error
      )
      return { ok: false, error: result.error, status: conflict ? 409 : 403 }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertLGPlayerToBot(state as LGState, userId),
  isFinished: (state) => (state as LGState).phase === 'finished',
  currentActorId: (state) => currentLGActorId(state as LGState),
  clientViewJson: (state, viewerId) => lgClientViewJson(state as LGState, viewerId),
  spectatorViewJson: (state) => lgSpectatorViewJson(state as LGState),
  actionResponse: (state, viewerId) => ({
    view: toLGClientView(state as LGState, viewerId),
    viewJson: lgClientViewJson(state as LGState, viewerId),
  }),
  markLeft: (state, userId, at) => markLGPlayerLeft(state as LGState, userId, at),
  rejoin: (state, userId) => rejoinLGPlayer(state as LGState, userId),
}

// ─── 1220 ────────────────────────────────────────────────────────────────────

const game1220Adapter: GameAdapter = {
  // Jeu de paris simultané ; avec l'option bots du lobby, un joueur seul peut
  // lancer (buildGame1220State comble jusqu'à 2).
  minPlayers: GAME_1220_MIN_PLAYERS,
  maxPlayers: GAME_1220_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseGame1220State(json),
  serialize: (state) => serializeGame1220State(state as Game1220State),
  applyAction(rawState, userId, body) {
    const state = rawState as Game1220State
    let input: Game1220RoomActionInput
    if (body.action === 'set-draft' && body.choices && typeof body.choices === 'object') {
      input = { type: 'set-draft', choices: body.choices as Partial<Choices1220> }
    } else if (body.action === 'ready') {
      input = { type: 'ready' }
    } else if (body.action === 'roll') {
      input = { type: 'roll' }
    } else if (body.action === 'end') {
      input = { type: 'end' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyGame1220RoomAction(state, userId, input)
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        status: result.error === 'NOTHING_TO_REPLACE' ? 409 : 403,
      }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertGame1220PlayerToBot(state as Game1220State, userId),
  isFinished: (state) => (state as Game1220State).phase === 'finished',
  currentActorId: (state) => currentGame1220ActorId(state as Game1220State),
  clientViewJson: (state) => game1220ClientViewJson(state as Game1220State),
  spectatorViewJson: (state) => game1220SpectatorViewJson(state as Game1220State),
  actionResponse: (state) => ({
    view: toGame1220ClientView(state as Game1220State),
    viewJson: game1220ClientViewJson(state as Game1220State),
  }),
  markLeft: (state, userId, at) => markGame1220PlayerLeft(state as Game1220State, userId, at),
  rejoin: (state, userId) => rejoinGame1220Player(state as Game1220State, userId),
}

// ─── Purple ──────────────────────────────────────────────────────────────────

const purpleAdapter: GameAdapter = {
  // Jeu de paris tour par tour ; avec l'option bots du lobby, un joueur seul
  // peut lancer (buildPurpleState comble jusqu'à 2).
  minPlayers: PURPLE_MIN_PLAYERS,
  maxPlayers: PURPLE_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parsePurpleState(json),
  serialize: (state) => serializePurpleState(state as PurpleState),
  applyAction(rawState, userId, body) {
    const state = rawState as PurpleState
    let input: PurpleRoomActionInput
    if (body.action === 'bet' && typeof body.bet === 'string') {
      input = { type: 'bet', bet: body.bet as PurpleBet }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'pass') {
      input = { type: 'pass' }
    } else if (body.action === 'close-reveal') {
      input = { type: 'close-reveal' }
    } else if (body.action === 'end') {
      input = { type: 'end' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyPurpleRoomAction(state, userId, input)
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        status: result.error === 'NOTHING_TO_REPLACE' ? 409 : 403,
      }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertPurplePlayerToBot(state as PurpleState, userId),
  isFinished: (state) => (state as PurpleState).phase === 'finished',
  currentActorId: (state) => currentPurpleActorId(state as PurpleState),
  clientViewJson: (state) => purpleClientViewJson(state as PurpleState),
  spectatorViewJson: (state) => purpleSpectatorViewJson(state as PurpleState),
  actionResponse: (state) => ({
    view: toPurpleClientView(state as PurpleState),
    viewJson: purpleClientViewJson(state as PurpleState),
  }),
  markLeft: (state, userId, at) => markPurplePlayerLeft(state as PurpleState, userId, at),
  rejoin: (state, userId) => rejoinPurplePlayer(state as PurpleState, userId),
}

// ─── Le Grand Bluff ──────────────────────────────────────────────────────────

const bluffAdapter: GameAdapter = {
  // 3 humains par défaut ; avec l'option bots du lobby, un joueur seul peut
  // lancer (buildBluffState comble jusqu'à 3).
  minPlayers: BLUFF_MIN_PLAYERS,
  maxPlayers: BLUFF_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseBluffState(json),
  serialize: (state) => serializeBluffState(state as BluffState),
  applyAction(rawState, userId, body) {
    const state = rawState as BluffState
    let input: BluffRoomActionInput
    if (body.action === 'submit-fake' && typeof body.text === 'string') {
      input = { type: 'submit-fake', text: body.text }
    } else if (body.action === 'vote' && typeof body.candidateId === 'string') {
      input = { type: 'vote', candidateId: body.candidateId }
    } else if (body.action === 'advance' && typeof body.phaseKey === 'string') {
      input = { type: 'advance', phaseKey: body.phaseKey }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyBluffRoomAction(state, userId, input)
    if (!result.ok) {
      const conflict = ['NOTHING_TO_REPLACE', 'NOT_EXPIRED', 'PHASE_CHANGED'].includes(
        result.error
      )
      return { ok: false, error: result.error, status: conflict ? 409 : 403 }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertBluffPlayerToBot(state as BluffState, userId),
  isFinished: (state) => (state as BluffState).phase === 'finished',
  currentActorId: (state) => currentBluffActorId(state as BluffState),
  clientViewJson: (state, viewerId) => bluffClientViewJson(state as BluffState, viewerId),
  spectatorViewJson: (state) => bluffSpectatorViewJson(state as BluffState),
  actionResponse: (state, viewerId) => ({
    view: toBluffClientView(state as BluffState, viewerId),
    viewJson: bluffClientViewJson(state as BluffState, viewerId),
  }),
  markLeft: (state, userId, at) => markBluffPlayerLeft(state as BluffState, userId, at),
  rejoin: (state, userId) => rejoinBluffPlayer(state as BluffState, userId),
}

// ─── Qui est l'Espion ? ──────────────────────────────────────────────────────

const espionAdapter: GameAdapter = {
  // 3 humains par défaut ; avec l'option bots du lobby, un joueur seul peut
  // lancer (buildEspionState comble jusqu'à 3).
  minPlayers: ESPION_MIN_PLAYERS,
  maxPlayers: ESPION_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseEspionState(json),
  serialize: (state) => serializeEspionState(state as EspionState),
  applyAction(rawState, userId, body) {
    const state = rawState as EspionState
    let input: EspionRoomActionInput
    if (body.action === 'accuse' && typeof body.targetId === 'string') {
      input = { type: 'accuse', targetId: body.targetId }
    } else if (body.action === 'support') {
      input = { type: 'support' }
    } else if (body.action === 'guess-location' && typeof body.location === 'string') {
      input = { type: 'guess-location', location: body.location }
    } else if (body.action === 'advance' && typeof body.phaseKey === 'string') {
      input = { type: 'advance', phaseKey: body.phaseKey }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyEspionRoomAction(state, userId, input)
    if (!result.ok) {
      const conflict = ['NOTHING_TO_REPLACE', 'NOT_EXPIRED', 'PHASE_CHANGED'].includes(
        result.error
      )
      return { ok: false, error: result.error, status: conflict ? 409 : 403 }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertEspionPlayerToBot(state as EspionState, userId),
  isFinished: (state) => (state as EspionState).phase === 'finished',
  currentActorId: (state) => currentEspionActorId(state as EspionState),
  clientViewJson: (state, viewerId) => espionClientViewJson(state as EspionState, viewerId),
  spectatorViewJson: (state) => espionSpectatorViewJson(state as EspionState),
  actionResponse: (state, viewerId) => ({
    view: toEspionClientView(state as EspionState, viewerId),
    viewJson: espionClientViewJson(state as EspionState, viewerId),
  }),
  markLeft: (state, userId, at) => markEspionPlayerLeft(state as EspionState, userId, at),
  rejoin: (state, userId) => rejoinEspionPlayer(state as EspionState, userId),
}

// ─── Tabou Vocal ─────────────────────────────────────────────────────────────

const tabouAdapter: GameAdapter = {
  // 1 humain suffit pour lancer : buildTabouPlayers comble chaque équipe
  // jusqu'à 2 avec des bots (contrainte du moteur), + les bots choisis par
  // l'hôte au-delà.
  minPlayers: TABOU_MIN_PLAYERS,
  maxPlayers: TABOU_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseTabouState(json),
  serialize: (state) => serializeTabouState(state as TabouState),
  applyAction(rawState, userId, body) {
    const state = rawState as TabouState
    let input: TabouRoomActionInput
    if (body.action === 'found') {
      input = { type: 'found' }
    } else if (body.action === 'pass') {
      input = { type: 'pass' }
    } else if (body.action === 'taboo-called') {
      input = { type: 'taboo-called' }
    } else if (body.action === 'advance' && typeof body.phaseKey === 'string') {
      input = { type: 'advance', phaseKey: body.phaseKey }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyTabouRoomAction(state, userId, input)
    if (!result.ok) {
      const conflict = ['NOTHING_TO_REPLACE', 'NOT_EXPIRED', 'PHASE_CHANGED'].includes(
        result.error
      )
      return { ok: false, error: result.error, status: conflict ? 409 : 403 }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertTabouPlayerToBot(state as TabouState, userId),
  isFinished: (state) => (state as TabouState).phase === 'finished',
  currentActorId: (state) => currentTabouActorId(state as TabouState),
  clientViewJson: (state, viewerId) => tabouClientViewJson(state as TabouState, viewerId),
  spectatorViewJson: (state) => tabouSpectatorViewJson(state as TabouState),
  actionResponse: (state, viewerId) => ({
    view: toTabouClientView(state as TabouState, viewerId),
    viewJson: tabouClientViewJson(state as TabouState, viewerId),
  }),
  markLeft: (state, userId, at) => markTabouPlayerLeft(state as TabouState, userId, at),
  rejoin: (state, userId) => rejoinTabouPlayer(state as TabouState, userId),
}

// ─── Crobard ─────────────────────────────────────────────────────────────────

const crobardAdapter: GameAdapter = {
  // 1 humain suffit pour lancer : buildCrobardState comble jusqu'au minimum
  // avec des bots choisis par l'hôte.
  minPlayers: CROBARD_MIN_PLAYERS,
  maxPlayers: CROBARD_MAX_PLAYERS,
  botsFillable: true,
  parse: (json) => parseCrobardState(json),
  serialize: (state) => serializeCrobardState(state as CrobardState),
  applyAction(rawState, userId, body) {
    const state = rawState as CrobardState
    let input: CrobardRoomActionInput
    if (body.action === 'choose-word' && typeof body.index === 'number') {
      input = { type: 'choose-word', index: body.index }
    } else if (
      body.action === 'draw-stroke' &&
      body.stroke &&
      typeof body.stroke === 'object' &&
      Array.isArray((body.stroke as { points?: unknown }).points)
    ) {
      input = { type: 'draw-stroke', stroke: body.stroke as Stroke }
    } else if (body.action === 'clear') {
      input = { type: 'clear' }
    } else if (body.action === 'guess' && typeof body.text === 'string') {
      input = { type: 'guess', text: body.text }
    } else if (body.action === 'advance' && typeof body.phaseKey === 'string') {
      input = { type: 'advance', phaseKey: body.phaseKey }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyCrobardRoomAction(state, userId, input)
    if (!result.ok) {
      // Une réponse fausse/proche n'est PAS une erreur de validation — c'est
      // une issue normale du jeu, jamais persistée dans l'état partagé.
      if (result.error === 'GUESS_WRONG' || result.error === 'GUESS_CLOSE') {
        return { ok: false, error: result.error, status: 200 }
      }
      const conflict = ['NOTHING_TO_REPLACE', 'NOT_EXPIRED', 'PHASE_CHANGED'].includes(
        result.error
      )
      return { ok: false, error: result.error, status: conflict ? 409 : 403 }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertCrobardPlayerToBot(state as CrobardState, userId),
  isFinished: (state) => (state as CrobardState).phase === 'finished',
  currentActorId: (state) => currentCrobardActorId(state as CrobardState),
  clientViewJson: (state, viewerId) => crobardClientViewJson(state as CrobardState, viewerId),
  spectatorViewJson: (state) => crobardSpectatorViewJson(state as CrobardState),
  actionResponse: (state, viewerId) => ({
    view: toCrobardClientView(state as CrobardState, viewerId),
    viewJson: crobardClientViewJson(state as CrobardState, viewerId),
  }),
  markLeft: (state, userId, at) => markCrobardPlayerLeft(state as CrobardState, userId, at),
  rejoin: (state, userId) => rejoinCrobardPlayer(state as CrobardState, userId),
}

// ─── Téléphone Dessiné ───────────────────────────────────────────────────────

const telephoneAdapter: GameAdapter = {
  // Pas de complément par bots au lancement (botsFillable: false) : un
  // maillon tenu par un bot dès le départ casserait l'effet de surprise
  // final. Le remplacement en cours de partie reste possible.
  minPlayers: TELEPHONE_MIN_PLAYERS,
  maxPlayers: TELEPHONE_MAX_PLAYERS,
  parse: (json) => parseTelephoneState(json),
  serialize: (state) => serializeTelephoneState(state as TelephoneState),
  applyAction(rawState, userId, body) {
    const state = rawState as TelephoneState
    let input: TelephoneRoomActionInput
    if (body.action === 'write' && typeof body.text === 'string') {
      input = { type: 'write', text: body.text }
    } else if (
      body.action === 'draw-stroke' &&
      body.stroke &&
      typeof body.stroke === 'object' &&
      Array.isArray((body.stroke as { points?: unknown }).points)
    ) {
      input = { type: 'draw-stroke', stroke: body.stroke as Stroke }
    } else if (body.action === 'clear') {
      input = { type: 'clear' }
    } else if (body.action === 'submit') {
      input = { type: 'submit' }
    } else if (body.action === 'advance' && typeof body.phaseKey === 'string') {
      input = { type: 'advance', phaseKey: body.phaseKey }
    } else if (body.action === 'continue') {
      input = { type: 'continue' }
    } else if (body.action === 'previous') {
      input = { type: 'previous' }
    } else if (body.action === 'bot') {
      input = { type: 'bot' }
    } else if (body.action === 'replace-left') {
      input = { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }
    } else {
      return { ok: false, error: 'Action invalide', status: 400 }
    }
    const result = applyTelephoneRoomAction(state, userId, input)
    if (!result.ok) {
      const conflict = ['NOTHING_TO_REPLACE', 'NOT_EXPIRED', 'PHASE_CHANGED'].includes(
        result.error
      )
      return { ok: false, error: result.error, status: conflict ? 409 : 403 }
    }
    return { ok: true, state: result.state }
  },
  convertToBot: (state, userId) => convertTelephonePlayerToBot(state as TelephoneState, userId),
  isFinished: (state) => (state as TelephoneState).phase === 'finished',
  currentActorId: (state) => currentTelephoneActorId(state as TelephoneState),
  clientViewJson: (state, viewerId) => telephoneClientViewJson(state as TelephoneState, viewerId),
  spectatorViewJson: (state) => telephoneSpectatorViewJson(state as TelephoneState),
  actionResponse: (state, viewerId) => ({
    view: toTelephoneClientView(state as TelephoneState, viewerId),
    viewJson: telephoneClientViewJson(state as TelephoneState, viewerId),
  }),
  markLeft: (state, userId, at) => markTelephonePlayerLeft(state as TelephoneState, userId, at),
  rejoin: (state, userId) => rejoinTelephonePlayer(state as TelephoneState, userId),
}

// ─── Registre ────────────────────────────────────────────────────────────────

export const GAME_ADAPTERS: Record<string, GameAdapter> = {
  'petit-buveur': petitBuveurAdapter,
  'toucher-coule': toucherCouleAdapter,
  menteur: menteurAdapter,
  imposteur: imposteurAdapter,
  quiz: quizAdapter,
  'loup-garou': loupGarouAdapter,
  '1220': game1220Adapter,
  purple: purpleAdapter,
  bluff: bluffAdapter,
  espion: espionAdapter,
  tabou: tabouAdapter,
  crobard: crobardAdapter,
  'telephone-dessine': telephoneAdapter,
}

export function getGameAdapter(gameId: string | null | undefined): GameAdapter | null {
  return gameId ? GAME_ADAPTERS[gameId] ?? null : null
}

/** Jeux dont l'état vit côté serveur (liste dérivée du registre). */
export const SERVER_AUTHORITATIVE_GAMES = Object.keys(GAME_ADAPTERS)
