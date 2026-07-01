import { BOARD_SIZE, CASES_INTERACTIVE, needsTarget, type CaseType, type Difficulty, type EngineCase } from './types'
import { rngFromState, hashSeed, type RngState, type SeededRng } from './rng'
import { generateCase } from './case-generator'

/**
 * Moteur Petit Buveur — pur, déterministe, serveur-autoritaire.
 *
 * `reduce(state, action)` ne dépend que de l'état (RNG inclus via `rngState`)
 * et de l'action : rejouer la même graine + la même suite d'actions reproduit
 * exactement la partie. Aucune dépendance UI ni i18n.
 *
 * PÉRIMÈTRE DE CETTE ITÉRATION (cœur) :
 *  - lancer de dé, déplacement, condition de victoire, enchaînement des tours
 *    (gestion de `skipNextTurn` et `anchored`) ;
 *  - effets DIRECTS appliqués fidèlement (gorgées solo/groupe, avance/recul,
 *    case-bonus, recul-groupe, grappin, pont, loterie, malédiction, protection,
 *    ancre, passe-tour) ;
 *  - cases INTERACTIVES (roue, vote, échange, téléport, pile/face, dé de la honte,
 *    défi-chaîne, chance, double-case, roue-defis) : passage en `pending`, résolues
 *    par une action `RESOLVE_INTERACTION`. La logique fine par case (ciblage,
 *    modales) sera complétée dans la slice suivante — ici une résolution par
 *    défaut déterministe garantit que la partie progresse toujours.
 */

export interface EnginePlayer {
  id: string
  name: string
  position: number
  drinks: number
  protected: boolean
  cursed: number
  skipNextTurn: boolean
  anchored: boolean
}

export interface EngineSettings {
  difficulty: Difficulty
  /** Gorgées par défi (donnée i18n canonique). */
  defiDrinks: number[]
}

export type EnginePhase = 'playing' | 'awaiting-interaction' | 'finished'

export interface LogEntry {
  turn: number
  playerId: string
  message: string
}

export interface EngineState {
  /** Version logique (incrémentée à chaque action appliquée). */
  version: number
  /** Position persistée du RNG. */
  rngState: RngState
  settings: EngineSettings
  players: EnginePlayer[]
  /** Index du joueur courant. */
  currentPlayer: number
  turnCount: number
  lastDice: number | null
  lastCase: EngineCase | null
  /** Case en attente de résolution. `needsTarget` : un joueur cible doit être choisi. */
  pending: { caseType: CaseType; playerId: string; needsTarget: boolean } | null
  phase: EnginePhase
  /** Id du joueur gagnant, ou null. */
  winner: string | null
  log: LogEntry[]
}

/** Choix joueur pour résoudre une case interactive (cible, côté de pièce…). */
export type InteractionChoice = { targetId?: string; side?: 'pile' | 'face' }

export type EngineAction =
  | { type: 'ROLL'; playerId: string }
  | { type: 'RESOLVE_INTERACTION'; playerId: string; choice?: InteractionChoice }

export type EnginePlayerInit = { id: string; name: string }

export class EngineError extends Error {}

const LOG_LIMIT = 40

function clampPos(pos: number): number {
  return Math.max(0, Math.min(BOARD_SIZE - 1, pos))
}

export function createInitialState(
  players: EnginePlayerInit[],
  settings: EngineSettings,
  seed: string | number
): EngineState {
  return {
    version: 0,
    rngState: hashSeed(seed),
    settings,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      position: 0,
      drinks: 0,
      protected: false,
      cursed: 0,
      skipNextTurn: false,
      anchored: false,
    })),
    currentPlayer: 0,
    turnCount: 1,
    lastDice: null,
    lastCase: null,
    pending: null,
    phase: 'playing',
    winner: null,
    log: [],
  }
}

function pushLog(log: LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log.slice(-(LOG_LIMIT - 1)), entry]
}

/** Ajoute (ou retire) des gorgées en respectant la protection. */
function addDrinks(p: EnginePlayer, n: number): void {
  if (p.protected && n > 0) {
    p.protected = false
    return
  }
  p.drinks = Math.max(0, p.drinks + n)
}

/** Applique l'effet direct d'une case (mute la copie `players`). */
function applyCaseEffect(
  players: EnginePlayer[],
  actorIndex: number,
  c: EngineCase,
  rng: SeededRng
): void {
  const actor = players[actorIndex]

  switch (c.type) {
    // Gorgées sur l'acteur
    case 'gorgée':
    case 'defi':
    case 'solo':
    case 'question':
    case 'vote':
    case 'inversion':
    case 'double-peine':
    case 'roulette-russe':
    case 'de-honte':
    case 'bombe':
      addDrinks(actor, c.effect)
      break
    // Tout le monde boit
    case 'tous':
      players.forEach((p) => addDrinks(p, c.effect))
      break
    // Déplacement de l'acteur
    case 'avance':
    case 'case-bonus':
    case 'miroir-inverse':
      actor.position = clampPos(actor.position + c.effect)
      break
    case 'recul':
      actor.position = clampPos(actor.position + c.effect) // effect = -1
      break
    // Les joueurs derrière reculent d'une case
    case 'recul-groupe':
      players.forEach((p) => {
        if (p.position < actor.position) p.position = clampPos(p.position - 1)
      })
      break
    // L'acteur rejoint le joueur juste devant lui
    case 'grappin': {
      const ahead = players
        .filter((p) => p.position > actor.position)
        .sort((a, b) => a.position - b.position)[0]
      if (ahead) actor.position = ahead.position
      break
    }
    // Pile/face déterministe : tous ceux sur la case avancent ou reculent
    case 'pont': {
      const delta = rng.chance(0.5) ? 1 : -1
      players.forEach((p) => {
        if (p.position === actor.position) p.position = clampPos(p.position + delta)
      })
      break
    }
    // Deux joueurs au hasard : l'un boit 2, l'autre avance d'une case
    case 'loterie': {
      const pool = players.filter((p) => p.id !== actor.id)
      if (pool.length >= 2) {
        const shuffled = rng.shuffle(pool)
        addDrinks(shuffled[0], 2)
        shuffled[1].position = clampPos(shuffled[1].position + 1)
      }
      break
    }
    // Statuts
    case 'protection':
      actor.protected = true
      break
    case 'malediction':
      actor.cursed += 1
      addDrinks(actor, c.effect)
      break
    case 'ancre':
      actor.anchored = true
      break
    case 'passe-tour':
      actor.skipNextTurn = true
      break
    // Sans effet direct ou résolu ailleurs
    case 'normal':
    default:
      break
  }
}

/**
 * Résout une case interactive (mute `players`). Porté fidèlement depuis game.tsx.
 * Les cases sans logique dédiée retombent sur l'effet numérique par défaut.
 */
function resolveInteractionCase(
  players: EnginePlayer[],
  actorIndex: number,
  caseType: CaseType,
  lastCase: EngineCase | null,
  rng: SeededRng,
  choice: InteractionChoice | undefined
): void {
  const actor = players[actorIndex]

  switch (caseType) {
    // Dé de la honte : dé 1-6 → ≤2 rien, 3-4 boit 2, 5 avance +1, 6 recule -1.
    case 'de-honte': {
      const r = rng.int(1, 6)
      if (r > 2 && r <= 4) addDrinks(actor, 2)
      else if (r === 5) actor.position = clampPos(actor.position + 1)
      else if (r === 6) actor.position = clampPos(actor.position - 1)
      break
    }
    // Pile ou face : l'acteur mise sur une cible + un côté ; si perdu, la cible boit.
    case 'pile-face': {
      const flip: 'pile' | 'face' = rng.chance(0.5) ? 'pile' : 'face'
      const side = choice?.side ?? 'pile'
      const target = choice?.targetId
        ? players.find((p) => p.id === choice.targetId)
        : players.find((_, i) => i !== actorIndex)
      const drinks = lastCase?.effect || 2
      if (target && side !== flip) addDrinks(target, drinks)
      break
    }
    default:
      // Résolution par défaut (à enrichir case par case ultérieurement).
      if (lastCase) applyCaseEffect(players, actorIndex, lastCase, rng)
      break
  }
}

/** Consomme la protection si active (bloque un effet néfaste). Retourne true si bloqué. */
function consumeProtectionIfAny(p: EnginePlayer): boolean {
  if (p.protected) {
    p.protected = false
    return true
  }
  return false
}

/** Id du joueur ayant atteint la dernière case, ou null. */
function findWinner(players: EnginePlayer[]): string | null {
  const w = players.find((p) => p.position === BOARD_SIZE - 1)
  return w ? w.id : null
}

/**
 * Applique une case à la CIBLE choisie (mute `players`). Porté fidèlement depuis
 * game.tsx#applyEffectToPlayer. `lastDice` = dernier déplacement (pour « copie »).
 */
function applyCaseToTarget(
  players: EnginePlayer[],
  target: EnginePlayer,
  c: EngineCase,
  rng: SeededRng,
  lastDice: number | null,
  lastCase: EngineCase | null
): void {
  switch (c.type) {
    case 'gorgée':
    case 'defi':
    case 'question':
      addDrinks(target, c.effect)
      break
    case 'tous':
      players.forEach((p) => {
        if (p.id !== target.id) addDrinks(p, c.effect)
      })
      break
    case 'avance':
    case 'recul':
      if (consumeProtectionIfAny(target)) break
      if (c.type === 'recul' && target.position === 0) break
      target.position = clampPos(target.position + c.effect)
      break
    case 'bombe':
      if (consumeProtectionIfAny(target)) break
      players.forEach((p) => addDrinks(p, p.id === target.id ? c.effect * 2 : c.effect))
      break
    case 'protection':
      target.protected = true
      break
    case 'malediction':
      if (consumeProtectionIfAny(target)) break
      target.cursed = c.effect || 3
      break
    case 'miroir': {
      const sorted = [...players].sort((a, b) => b.position - a.position)
      const positions = sorted.map((p) => p.position)
      players.forEach((p) => {
        const si = sorted.findIndex((sp) => sp.id === p.id)
        p.position = positions[positions.length - 1 - si]
      })
      break
    }
    case 'piege':
      addDrinks(target, target.position + 1)
      break
    case 'passe-tour':
      target.skipNextTurn = true
      break
    case 'double-peine':
      addDrinks(target, c.effect * 2)
      break
    case 'copie':
      if (consumeProtectionIfAny(target)) break
      target.position = clampPos(target.position + (lastDice ?? 0))
      break
    case 'roulette-russe':
      if (consumeProtectionIfAny(target)) break
      if (rng.chance(1 / 3)) addDrinks(target, c.effect)
      break
    case 'ancre':
      target.anchored = true
      break
    case 'inversion': {
      if (consumeProtectionIfAny(target)) break
      const last = players.reduce((min, p) => (p.position < min.position ? p : min))
      addDrinks(last, c.effect)
      break
    }
    case 'melange': {
      if (consumeProtectionIfAny(target)) break
      const shuffled = rng.shuffle(players.map((p) => p.position))
      players.forEach((p, i) => {
        p.position = shuffled[i]
      })
      break
    }
    case 'rewind':
      if (lastCase && lastCase.type !== 'rewind') {
        applyCaseToTarget(players, target, lastCase, rng, lastDice, null)
      }
      break
    // 'normal', 'miroir-inverse', 'repetition'… : pas d'effet ciblé (simplifié).
    default:
      break
  }
}

export function reduce(state: EngineState, action: EngineAction): EngineState {
  if (state.phase === 'finished') {
    throw new EngineError('GAME_FINISHED')
  }

  const actorIndex = state.currentPlayer
  const actor = state.players[actorIndex]

  if (action.type === 'ROLL') {
    if (state.phase !== 'playing') throw new EngineError('NOT_PLAYING')
    if (state.pending) throw new EngineError('INTERACTION_PENDING')
    if (!actor || actor.id !== action.playerId) throw new EngineError('NOT_YOUR_TURN')

    const rng = rngFromState(state.rngState)
    const players = state.players.map((p) => ({ ...p }))
    const me = players[actorIndex]

    // Ancré : on saute le déplacement et on consomme le statut.
    if (me.anchored) {
      me.anchored = false
      const turn = advanceTurnOnPlayers(players, actorIndex, state.turnCount)
      return {
        ...state,
        version: state.version + 1,
        rngState: rng.getState(),
        players,
        currentPlayer: turn.currentPlayer,
        turnCount: turn.turnCount,
        lastDice: null,
        log: pushLog(state.log, { turn: state.turnCount, playerId: me.id, message: 'anchored-skip' }),
      }
    }

    const dice = rng.int(1, 6)
    me.position = clampPos(me.position + dice)

    // Victoire : atteindre la dernière case.
    if (me.position === BOARD_SIZE - 1) {
      return {
        ...state,
        version: state.version + 1,
        rngState: rng.getState(),
        players,
        lastDice: dice,
        lastCase: null,
        phase: 'finished',
        winner: me.id,
        log: pushLog(state.log, { turn: state.turnCount, playerId: me.id, message: 'win' }),
      }
    }

    const generated = generateCase(rng, {
      difficulty: state.settings.difficulty,
      defiDrinks: state.settings.defiDrinks,
    })

    // Case à cible OU interactive : on attend la résolution du joueur.
    const interactive = CASES_INTERACTIVE.has(generated.type)
    const targeted = needsTarget(generated.type)
    if (interactive || targeted) {
      return {
        ...state,
        version: state.version + 1,
        rngState: rng.getState(),
        players,
        lastDice: dice,
        lastCase: generated,
        pending: { caseType: generated.type, playerId: me.id, needsTarget: targeted },
        phase: 'awaiting-interaction',
        log: pushLog(state.log, { turn: state.turnCount, playerId: me.id, message: `case:${generated.type}` }),
      }
    }

    // Case auto-résolue (no-target) : effet direct.
    applyCaseEffect(players, actorIndex, generated, rng)
    const winnerAfterCase = findWinner(players)
    if (winnerAfterCase) {
      return {
        ...state,
        version: state.version + 1,
        rngState: rng.getState(),
        players,
        lastDice: dice,
        lastCase: generated,
        phase: 'finished',
        winner: winnerAfterCase,
        log: pushLog(state.log, { turn: state.turnCount, playerId: winnerAfterCase, message: 'win' }),
      }
    }
    const turn = advanceTurnOnPlayers(players, actorIndex, state.turnCount)
    return {
      ...state,
      version: state.version + 1,
      rngState: rng.getState(),
      players,
      currentPlayer: turn.currentPlayer,
      turnCount: turn.turnCount,
      lastDice: dice,
      lastCase: generated,
      log: pushLog(state.log, { turn: state.turnCount, playerId: me.id, message: `case:${generated.type}` }),
    }
  }

  if (action.type === 'RESOLVE_INTERACTION') {
    if (state.phase !== 'awaiting-interaction' || !state.pending) {
      throw new EngineError('NO_PENDING_INTERACTION')
    }
    if (state.pending.playerId !== action.playerId) throw new EngineError('NOT_YOUR_INTERACTION')

    const rng = rngFromState(state.rngState)
    const players = state.players.map((p) => ({ ...p }))

    if (state.pending.needsTarget && state.lastCase) {
      // Case à cible : le joueur choisit qui subit l'effet.
      const target =
        (action.choice?.targetId
          ? players.find((p) => p.id === action.choice!.targetId)
          : undefined) ??
        players.find((_, i) => i !== actorIndex) ??
        players[actorIndex]
      applyCaseToTarget(players, target, state.lastCase, rng, state.lastDice, null)
    } else {
      resolveInteractionCase(players, actorIndex, state.pending.caseType, state.lastCase, rng, action.choice)
    }

    // Victoire éventuelle (un joueur poussé sur la dernière case par l'effet).
    const winnerId = findWinner(players)
    if (winnerId) {
      return {
        ...state,
        version: state.version + 1,
        rngState: rng.getState(),
        players,
        pending: null,
        phase: 'finished',
        winner: winnerId,
        log: pushLog(state.log, { turn: state.turnCount, playerId: winnerId, message: 'win' }),
      }
    }

    const turn = advanceTurnOnPlayers(players, actorIndex, state.turnCount)
    return {
      ...state,
      version: state.version + 1,
      rngState: rng.getState(),
      players,
      currentPlayer: turn.currentPlayer,
      turnCount: turn.turnCount,
      pending: null,
      phase: 'playing',
      log: pushLog(state.log, {
        turn: state.turnCount,
        playerId: action.playerId,
        message: `resolved:${state.pending.caseType}`,
      }),
    }
  }

  throw new EngineError('UNKNOWN_ACTION')
}

/** Variante d'advanceTurn opérant sur une copie de joueurs déjà clonée. */
function advanceTurnOnPlayers(
  players: EnginePlayer[],
  from: number,
  turnCount: number
): { currentPlayer: number; turnCount: number } {
  const n = players.length
  let idx = from
  let tc = turnCount
  for (let step = 0; step < n; step += 1) {
    idx = (idx + 1) % n
    if (idx === 0) tc += 1
    if (players[idx].skipNextTurn) {
      players[idx].skipNextTurn = false
      continue
    }
    return { currentPlayer: idx, turnCount: tc }
  }
  return { currentPlayer: from, turnCount: tc }
}

/** Aide de test/serveur : id du joueur courant. */
export function currentPlayerId(state: EngineState): string | null {
  return state.players[state.currentPlayer]?.id ?? null
}
