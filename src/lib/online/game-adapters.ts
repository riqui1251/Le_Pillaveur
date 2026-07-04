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
  maxPlayers: 6,
  parse: (json) => parseTCState(json),
  serialize: (state) => serializeTCState(state as TCState),
  applyAction(rawState, userId, body) {
    const state = rawState as TCState
    let input: TCRoomActionInput
    if (body.action === 'place' && Array.isArray(body.ships)) {
      input = { type: 'place', ships: body.ships as number[][] }
    } else if (body.action === 'fire' && typeof body.cell === 'number') {
      input = { type: 'fire', cell: body.cell }
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
  // Un joueur seul peut lancer : les bots comblent jusqu'à 2 joueurs
  // (buildMenteurState) — même philosophie que le Toucher-Coulé.
  minPlayers: 1,
  maxPlayers: MENTEUR_MAX_PLAYERS,
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

// ─── Registre ────────────────────────────────────────────────────────────────

export const GAME_ADAPTERS: Record<string, GameAdapter> = {
  'petit-buveur': petitBuveurAdapter,
  'toucher-coule': toucherCouleAdapter,
  menteur: menteurAdapter,
}

export function getGameAdapter(gameId: string | null | undefined): GameAdapter | null {
  return gameId ? GAME_ADAPTERS[gameId] ?? null : null
}

/** Jeux dont l'état vit côté serveur (liste dérivée du registre). */
export const SERVER_AUTHORITATIVE_GAMES = Object.keys(GAME_ADAPTERS)
