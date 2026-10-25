import { evaluatePlayerRoll1220, type Choices1220 } from '@/lib/game-1220'
import { createRng, rngFromState, type RngState } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import { defaultChoices1220, parseChoices1220, parseChoicesPatch1220, playableChoices1220 } from './choices'

export { defaultChoices1220 }

/**
 * Moteur pur du 1220 en ligne — SERVEUR-AUTORITAIRE.
 *
 * Contrairement aux autres jeux, il n'y a pas de tour : chaque joueur règle
 * ses propres paris en phase `setup` (parité/plage/chiffres), puis en phase
 * `play` N'IMPORTE QUEL joueur peut déclencher un lancer partagé (d12+d20)
 * évalué contre les paris de TOUT LE MONDE. Entre deux lancers, chacun peut
 * modifier ses paris (`SET_BETS`), comme en local. Rien à cacher entre
 * joueurs : une seule vue sert joueur et spectateur, sans la graine des dés
 * (elle prédirait le prochain lancer — voir toGame1220ClientView).
 *
 * La mise en place est SIMULTANÉE : aucun acteur unique, donc l'anti-AFK
 * commun (`replace-afk`, qui vise le joueur au tour) ne s'y applique pas. Elle
 * est bornée par une HORLOGE DE PHASE : à l'échéance, n'importe quel client
 * envoie `advance` et les retardataires sont déclarés prêts — sans quoi un
 * seul joueur parti boire fige la table indéfiniment.
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

export type Game1220State = TimedPhaseState & {
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
  /** `choices` vient du client tel quel : le moteur le valide champ par champ. */
  | { type: 'SET_DRAFT'; playerId: string; choices: unknown }
  /** Phase `play` : paris complets qui remplacent ceux du joueur dès le lancer suivant. */
  | { type: 'SET_BETS'; playerId: string; choices: unknown }
  | { type: 'READY'; playerId: string }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'ROLL'; playerId: string }
  | { type: 'END'; playerId: string }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class Game1220EngineError extends Error {}

export const GAME_1220_MIN_PLAYERS = 2
export const GAME_1220_MAX_PLAYERS = 16
/** Durée max de la mise en place — même délai de grâce que l'anti-AFK commun. */
export const GAME_1220_SETUP_MS = 3 * 60 * 1000
const HISTORY_LIMIT = 15
/**
 * Lancers joués avant qu'une partie compte pour la progression (XP, série,
 * succès) : sans fin fixée, « Terminer » sitôt les paris réglés les créditait
 * en quelques secondes, comme au Purple. Compté sur l'historique, qui en garde
 * HISTORY_LIMIT : le seuil doit rester en dessous.
 */
export const GAME_1220_MIN_ROLLS_FOR_RESULTS = 5

/** La partie a-t-elle été assez jouée pour compter (voir GAME_1220_MIN_ROLLS_FOR_RESULTS) ? */
export function game1220CountsForResults(state: Pick<Game1220State, 'history'>): boolean {
  return state.history.length >= GAME_1220_MIN_ROLLS_FOR_RESULTS
}

export function createGame1220State(
  players: { id: string; name: string; isBot?: boolean }[],
  seed: string | number,
  now: number = Date.now()
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
    rngState: createRng(seed).getState(),
    players: players.map((p) => ({ id: p.id, name: p.name, isBot: Boolean(p.isBot), leftAt: null })),
    ...enterPhase(0, 'setup', GAME_1220_SETUP_MS, now),
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
    .map((p) => ({ playerId: p.id, name: p.name, ...playableChoices1220(state.draft[p.id]) }))
  return {
    ...state,
    version: state.version + 1,
    setupReady,
    // La phase `play` n'a pas d'échéance : n'importe qui peut lancer les dés.
    ...enterPhase(state.phaseSeq, 'play', null),
    phase: 'play',
    configs,
  }
}

export function reduceGame1220(state: Game1220State, action: Game1220Action): Game1220State {
  switch (action.type) {
    case 'SET_DRAFT': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new Game1220EngineError('UNKNOWN_PLAYER')
      if (state.phase !== 'setup') throw new Game1220EngineError('WRONG_PHASE')
      if (state.setupReady.includes(action.playerId)) throw new Game1220EngineError('ALREADY_READY')
      // Un conflit boire/donner reste permis ici (étape d'une modification en
      // deux touchers) : READY le refuse.
      const patch = parseChoicesPatch1220(action.choices)
      if (!patch) throw new Game1220EngineError('INVALID_CHOICE')
      const current = state.draft[action.playerId] ?? defaultChoices1220()
      return {
        ...state,
        version: state.version + 1,
        draft: { ...state.draft, [action.playerId]: { ...current, ...patch } },
      }
    }

    case 'SET_BETS': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new Game1220EngineError('UNKNOWN_PLAYER')
      if (state.phase !== 'play' || !state.configs) throw new Game1220EngineError('WRONG_PHASE')
      const choices = parseChoices1220(action.choices)
      if (!choices) throw new Game1220EngineError('INVALID_CHOICE')
      if (choices.drinkNumber === choices.giveNumber) throw new Game1220EngineError('CLASH')
      const config: Config1220 = { playerId: player.id, name: player.name, ...choices }
      // Un joueur revenu après le verrouillage n'avait aucun pari : il en pose.
      const known = state.configs.some((c) => c.playerId === player.id)
      return {
        ...state,
        version: state.version + 1,
        configs: known
          ? state.configs.map((c) => (c.playerId === player.id ? config : c))
          : [...state.configs, config],
      }
    }

    case 'READY': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.leftAt) throw new Game1220EngineError('UNKNOWN_PLAYER')
      if (state.phase !== 'setup') throw new Game1220EngineError('WRONG_PHASE')
      const draft = state.draft[action.playerId]
      if (!draft) throw new Game1220EngineError('NO_DRAFT')
      const choices = parseChoices1220(draft)
      if (!choices) throw new Game1220EngineError('INVALID_CHOICE')
      if (choices.drinkNumber === choices.giveNumber) throw new Game1220EngineError('CLASH')
      if (state.setupReady.includes(action.playerId)) return state
      return lockConfigsIfAllReady(state, [...state.setupReady, action.playerId])
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new Game1220EngineError(check.error)
      if (state.phase !== 'setup') throw new Game1220EngineError('NOTHING_TO_ADVANCE')
      // Échéance de mise en place : les retardataires partent avec les choix
      // affichés à l'écran. Un brouillon en conflit (même chiffre boire/donner)
      // ou invalide n'aurait jamais passé le bouton « prêt » → retour aux choix
      // par défaut plutôt que de verrouiller une config illégale.
      const active = activePlayerIds(state)
      // Table vide (tout le monde parti) : rien à verrouiller — sans ce garde,
      // le tick resterait éligible et réécrirait l'état en boucle.
      if (active.length === 0) throw new Game1220EngineError('NOTHING_TO_ADVANCE')
      const draft = { ...state.draft }
      for (const id of active) draft[id] = playableChoices1220(draft[id])
      return lockConfigsIfAllReady(
        { ...state, draft },
        Array.from(new Set([...state.setupReady, ...active]))
      )
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
      return {
        ...state,
        version: state.version + 1,
        ...enterPhase(state.phaseSeq, 'finished', null),
        phase: 'finished',
      }
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

/**
 * La même vue sert joueur et spectateur TV. `phaseKey` accompagne l'état pour
 * que les clients renvoient l'échéance qu'ils ont vue. Seule la graine reste
 * au serveur : elle permettait de calculer le prochain lancer avant de parier,
 * y compris depuis l'écran TV public.
 */
export function toGame1220ClientView(state: Game1220State) {
  const { rngState: _rngState, ...visible } = state
  return { ...visible, phaseKey: phaseKey(state) }
}
