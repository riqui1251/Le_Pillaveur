import { evaluatePlayerRoll1220, type Choices1220 } from '@/lib/game-1220'
import { hashSeed, rngFromState, type RngState } from '@/lib/petit-buveur/rng'

/**
 * Moteur pur du 1220 en ligne — SERVEUR-AUTORITAIRE.
 *
 * Contrairement aux autres jeux, il n'y a pas de tour : chaque joueur règle
 * ses propres paris une fois en phase `setup` (parité/plage/chiffres), puis
 * en phase `play` N'IMPORTE QUEL joueur peut déclencher un lancer partagé
 * (d12+d20) évalué contre les paris de TOUT LE MONDE. Zéro info cachée →
 * aucune vue anti-triche nécessaire, la même vue sert joueur et spectateur.
 */

export type Player1220 = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
}

export type Game1220Phase = 'setup' | 'play' | 'finished'

export type RollResult1220 = {
  playerId: string
  name: string
  drinkSips: number
  giveEffective: number
  /** Identifiants structurels (pas de texte : la traduction vit côté client). */
  giveReasons: string[]
  partialHit: boolean
  partialNumbers: number[]
}

export type RollEntry1220 = { d12: number; d20: number; results: RollResult1220[] }

export type Config1220 = Choices1220 & { playerId: string; name: string }

export interface Game1220State {
  version: number
  rngState: RngState
  players: Player1220[]
  phase: Game1220Phase
  draft: Record<string, Choices1220>
  setupReady: string[]
  configs: Config1220[] | null
  lastRoll: RollEntry1220 | null
  history: RollEntry1220[]
  rematchVotes: string[]
}

export type Game1220Action =
  | { type: 'SET_DRAFT'; playerId: string; choices: Partial<Choices1220> }
  | { type: 'READY'; playerId: string }
  | { type: 'ROLL'; playerId: string }
  | { type: 'END'; playerId: string }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class Game1220EngineError extends Error {}

export const GAME_1220_MIN_PLAYERS = 2
export const GAME_1220_MAX_PLAYERS = 12
const HISTORY_LIMIT = 15

export function defaultChoices1220(): Choices1220 {
  return { parity: 'pair', band: '11-20', drinkNumber: 7, giveNumber: 13 }
}

export function createGame1220State(
  players: { id: string; name: string; isBot?: boolean }[],
  seed: string | number
): Game1220State {
  const draft: Record<string, Choices1220> = {}
  const setupReady: string[] = []
  for (const p of players) {
    draft[p.id] = defaultChoices1220()
    // Les bots ne jouent pas activement : prêts d'office avec les choix par défaut.
    if (p.isBot) setupReady.push(p.id)
  }
  return {
    version: 1,
    rngState: hashSeed(seed),
    players: players.map((p) => ({ id: p.id, name: p.name, isBot: Boolean(p.isBot), leftAt: null })),
    phase: 'setup',
    draft,
    setupReady,
    configs: null,
    lastRoll: null,
    history: [],
    rematchVotes: [],
  }
}

function activePlayerIds(state: Game1220State): string[] {
  return state.players.filter((p) => !p.leftAt).map((p) => p.id)
}

/** Verrouille les configs et passe en `play` si tous les joueurs actifs sont prêts. */
export function lockConfigsIfAllReady(state: Game1220State, setupReady: string[]): Game1220State {
  const active = activePlayerIds(state)
  const allReady = active.length > 0 && active.every((id) => setupReady.includes(id))
  if (!allReady) {
    return { ...state, version: state.version + 1, setupReady }
  }
  const configs: Config1220[] = state.players
    .filter((p) => !p.leftAt)
    .map((p) => ({ playerId: p.id, name: p.name, ...(state.draft[p.id] ?? defaultChoices1220()) }))
  return { ...state, version: state.version + 1, setupReady, phase: 'play', configs }
}

export function reduceGame1220(state: Game1220State, action: Game1220Action): Game1220State {
  switch (action.type) {
    case 'SET_DRAFT': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new Game1220EngineError('UNKNOWN_PLAYER')
      if (state.phase !== 'setup') throw new Game1220EngineError('WRONG_PHASE')
      if (state.setupReady.includes(action.playerId)) throw new Game1220EngineError('ALREADY_READY')
      const current = state.draft[action.playerId] ?? defaultChoices1220()
      return {
        ...state,
        version: state.version + 1,
        draft: { ...state.draft, [action.playerId]: { ...current, ...action.choices } },
      }
    }

    case 'READY': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new Game1220EngineError('UNKNOWN_PLAYER')
      if (state.phase !== 'setup') throw new Game1220EngineError('WRONG_PHASE')
      const choices = state.draft[action.playerId]
      if (!choices) throw new Game1220EngineError('NO_DRAFT')
      if (choices.drinkNumber === choices.giveNumber) throw new Game1220EngineError('CLASH')
      if (state.setupReady.includes(action.playerId)) return state
      return lockConfigsIfAllReady(state, [...state.setupReady, action.playerId])
    }

    case 'ROLL': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new Game1220EngineError('UNKNOWN_PLAYER')
      if (state.phase !== 'play' || !state.configs) throw new Game1220EngineError('WRONG_PHASE')
      const rng = rngFromState(state.rngState)
      const d12 = rng.int(1, 12)
      const d20 = rng.int(1, 20)
      const results: RollResult1220[] = state.configs.map((cfg) => {
        const r = evaluatePlayerRoll1220(d12, d20, cfg)
        return {
          playerId: cfg.playerId,
          name: cfg.name,
          drinkSips: r.drinkSips,
          giveEffective: r.giveEffective,
          giveReasons: r.giveReasons.map((g) => g.id),
          partialHit: r.partialHit,
          partialNumbers: r.partialNumbers,
        }
      })
      const entry: RollEntry1220 = { d12, d20, results }
      return {
        ...state,
        version: state.version + 1,
        rngState: rng.getState(),
        lastRoll: entry,
        history: [entry, ...state.history].slice(0, HISTORY_LIMIT),
      }
    }

    case 'END': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new Game1220EngineError('UNKNOWN_PLAYER')
      if (state.phase !== 'play') throw new Game1220EngineError('WRONG_PHASE')
      return { ...state, version: state.version + 1, phase: 'finished' }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new Game1220EngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new Game1220EngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      const next: Game1220State = {
        ...state,
        players: state.players.map((p) => (p.id === action.playerId ? { ...p, leftAt: action.at } : p)),
        version: state.version + 1,
      }
      // Le départ peut compléter le quorum de prêts en cours de setup.
      if (next.phase === 'setup') return lockConfigsIfAllReady(next, next.setupReady)
      return next
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new Game1220EngineError('CANNOT_REJOIN')
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.playerId ? { ...p, leftAt: null } : p)),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new Game1220EngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      const next: Game1220State = {
        ...state,
        players: state.players.map((p) => (ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p)),
        // Les nouveaux bots sont prêts d'office s'ils ne l'étaient pas déjà.
        setupReady: Array.from(new Set([...state.setupReady, ...ids])),
        version: state.version + 1,
      }
      if (next.phase === 'setup') return lockConfigsIfAllReady(next, next.setupReady)
      return next
    }

    default:
      return state
  }
}

/** Jeu simultané : jamais un tour unique. */
export function currentGame1220ActorId(_state: Game1220State): string | null {
  return null
}

/** Aucune info cachée : la même vue sert joueur et spectateur TV. */
export function toGame1220ClientView(state: Game1220State) {
  return state
}
