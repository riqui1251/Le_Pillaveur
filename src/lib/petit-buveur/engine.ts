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
  /** Joueur contrôlé par le serveur (remplaçant d'un humain parti/inactif). */
  isBot?: boolean
  /** Timestamp (ms) du départ du joueur en cours de partie — null/absent s'il est là. */
  leftAt?: number | null
  position: number
  drinks: number
  protected: boolean
  /** Tours restants de protection (durée : un tour de table). */
  protectionTurnsLeft?: number
  /** Tours de malédiction restants (boit 1 gorgée en début de tour). */
  cursed: number
  skipNextTurn: boolean
  anchored: boolean
  /** Défi-chaîne : lié à ce joueur (boivent ensemble). */
  linkedTo?: string
  linkedTurns?: number
  /** Miroir inversé : quand l'un boit, l'autre boit aussi. */
  mirrorDrinkTargetId?: string
  mirrorDrinkTurns?: number
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
  /** Delta de déplacement réellement appliqué (0 si le joueur était ancré, distinct de lastDice). */
  lastMoveDelta: number | null
  lastCase: EngineCase | null
  /** Case en attente de résolution. `needsTarget` : un joueur cible doit être choisi. */
  pending: { caseType: CaseType; playerId: string; needsTarget: boolean } | null
  phase: EnginePhase
  /** Id du joueur gagnant, ou null. */
  winner: string | null
  log: LogEntry[]
}

/** Choix joueur pour résoudre une case interactive (cible, côté de pièce, option…). */
export type InteractionChoice = { targetId?: string; side?: 'pile' | 'face'; option?: string }

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
    lastMoveDelta: null,
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

/** Protection active pendant un tour de table complet. */
function isProtected(p: EnginePlayer): boolean {
  return p.protected && (p.protectionTurnsLeft ?? 0) > 0
}

type Propagation = { skipMirror?: boolean; skipChain?: boolean }

/** Fait boire un joueur (gorgées > 0), avec propagation miroir/chaîne + protection. */
function addDrinks(
  players: EnginePlayer[],
  target: EnginePlayer,
  n: number,
  prop: Propagation = {}
): void {
  if (n <= 0) return
  if (isProtected(target)) return
  target.drinks += n

  if (!prop.skipMirror) {
    for (const init of players) {
      if ((init.mirrorDrinkTurns ?? 0) <= 0 || !init.mirrorDrinkTargetId) continue
      if (target.id === init.id) {
        const partner = players.find((p) => p.id === init.mirrorDrinkTargetId)
        if (partner) addDrinks(players, partner, n, { ...prop, skipMirror: true })
        break
      }
      if (target.id === init.mirrorDrinkTargetId) {
        addDrinks(players, init, n, { ...prop, skipMirror: true })
        break
      }
    }
  }

  if (!prop.skipChain) {
    for (const init of players) {
      if (!init.linkedTo || (init.linkedTurns ?? 0) <= 0) continue
      if (target.id === init.id) {
        const partner = players.find((p) => p.id === init.linkedTo)
        if (partner) addDrinks(players, partner, n, { ...prop, skipChain: true })
        break
      }
      if (target.id === init.linkedTo) {
        addDrinks(players, init, n, { ...prop, skipChain: true })
        break
      }
    }
  }
}

/** Applique une case AUTO-RÉSOLUE (no-target : solo, case-bonus, recul-groupe, grappin, pont, loterie). */
function applyCaseEffect(
  players: EnginePlayer[],
  actorIndex: number,
  c: EngineCase,
  rng: SeededRng
): void {
  const actor = players[actorIndex]

  switch (c.type) {
    case 'solo':
      addDrinks(players, actor, c.effect)
      break
    case 'case-bonus':
      actor.position = clampPos(actor.position + c.effect)
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
        addDrinks(players, shuffled[0], 2)
        shuffled[1].position = clampPos(shuffled[1].position + 1)
      }
      break
    }
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
      if (r > 2 && r <= 4) addDrinks(players, actor, 2)
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
      if (target && side !== flip) addDrinks(players, target, drinks)
      break
    }
    // Roue : 15 segments, 1 sur 3 « safe » (0), sinon 1-12 gorgées pour l'acteur.
    case 'roue': {
      const seg = rng.pickIndex(15)
      const value = (seg + 1) % 3 === 0 ? 0 : rng.int(1, 12)
      if (value > 0) addDrinks(players, actor, value)
      break
    }
    // Roue des défis : ~1 fois sur 2, gorgées ; sinon défi (approximé sans pénalité).
    case 'roue-defis':
      if (rng.chance(0.5)) addDrinks(players, actor, 2)
      break
    // Chance : l'acteur avance de 2 cases.
    case 'chance':
      actor.position = clampPos(actor.position + 2)
      break
    // Téléport : l'acteur échange sa position avec le leader ou le dernier.
    case 'teleport': {
      const which = choice?.option === 'last' ? 'last' : 'leader'
      const partner =
        which === 'leader'
          ? players.reduce((m, p) => (p.position > m.position ? p : m))
          : players.reduce((m, p) => (p.position < m.position ? p : m))
      if (partner && partner.id !== actor.id) {
        const ap = actor.position
        actor.position = partner.position
        partner.position = ap
      }
      break
    }
    // Vote : la cible désignée boit (effet ou 3 par défaut).
    case 'vote': {
      const target =
        (choice?.targetId ? players.find((p) => p.id === choice.targetId) : undefined) ??
        players.find((_, i) => i !== actorIndex)
      if (target) addDrinks(players, target, lastCase?.effect || 3)
      break
    }
    // Défi-chaîne : l'acteur se lie à la cible (boivent ensemble pendant N tours).
    case 'defi-chaine': {
      const target = choice?.targetId ? players.find((p) => p.id === choice.targetId) : undefined
      if (target && target.id !== actor.id) {
        actor.linkedTo = target.id
        actor.linkedTurns = lastCase?.effect || 5
      }
      break
    }
    // Échange : l'acteur échange sa position avec la cible choisie.
    case 'echange': {
      const target =
        (choice?.targetId ? players.find((p) => p.id === choice.targetId) : undefined) ??
        players.find((_, i) => i !== actorIndex)
      if (target && target.id !== actor.id) {
        const ap = actor.position
        actor.position = target.position
        target.position = ap
      }
      break
    }
    default:
      // Résolution par défaut (à enrichir case par case ultérieurement).
      if (lastCase) applyCaseEffect(players, actorIndex, lastCase, rng)
      break
  }
}

/** Décrémente la durée de protection de tous les joueurs (expire après un tour de table). */
function tickProtection(players: EnginePlayer[]): void {
  players.forEach((p) => {
    if (!p.protected || p.protectionTurnsLeft == null) return
    p.protectionTurnsLeft -= 1
    if (p.protectionTurnsLeft <= 0) {
      p.protected = false
      p.protectionTurnsLeft = undefined
    }
  })
}

/** Fin du tour de l'initiateur : décrémente ses liens miroir/chaîne. */
function tickInitiatorLinks(p: EnginePlayer): void {
  if ((p.mirrorDrinkTurns ?? 0) > 0) {
    p.mirrorDrinkTurns = (p.mirrorDrinkTurns ?? 1) - 1
    if ((p.mirrorDrinkTurns ?? 0) <= 0) p.mirrorDrinkTargetId = undefined
  }
  if (p.linkedTo && (p.linkedTurns ?? 0) > 0) {
    p.linkedTurns = (p.linkedTurns ?? 1) - 1
    if ((p.linkedTurns ?? 0) <= 0) p.linkedTo = undefined
  }
}

/** Début du tour : malédiction (boit 1 gorgée si non protégé), décrémente la malédiction. */
function applyCurseAtTurnStart(players: EnginePlayer[], p: EnginePlayer): void {
  if (p.cursed <= 0) return
  if (!isProtected(p)) addDrinks(players, p, 1)
  p.cursed -= 1
}

/** Id du joueur ayant atteint la dernière case, ou null. */
function findWinner(players: EnginePlayer[]): string | null {
  const w = players.find((p) => p.position === BOARD_SIZE - 1)
  return w ? w.id : null
}

/**
 * Applique une case à la CIBLE choisie (mute `players`). Porté fidèlement depuis
 * game.tsx#applyEffectToPlayer. `lastMoveDelta` = delta réellement appliqué au dernier
 * déplacement (0 si ancré), utilisé par « copie » — distinct du dé brut (`lastDice`).
 */
function applyCaseToTarget(
  players: EnginePlayer[],
  actor: EnginePlayer,
  target: EnginePlayer,
  c: EngineCase,
  rng: SeededRng,
  lastMoveDelta: number | null,
  lastCase: EngineCase | null
): void {
  switch (c.type) {
    case 'gorgée':
    case 'defi':
    case 'question':
      addDrinks(players, target, c.effect)
      break
    case 'tous':
      players.forEach((p) => {
        if (p.id !== target.id) addDrinks(players, p, c.effect)
      })
      break
    case 'avance':
    case 'recul':
      if (isProtected(target)) break
      if (c.type === 'recul' && target.position === 0) break
      target.position = clampPos(target.position + c.effect)
      break
    case 'bombe':
      if (isProtected(target)) break
      players.forEach((p) => addDrinks(players, p, p.id === target.id ? c.effect * 2 : c.effect))
      break
    case 'protection':
      target.protected = true
      target.protectionTurnsLeft = Math.max(players.length, 1)
      break
    case 'malediction':
      if (isProtected(target)) break
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
      addDrinks(players, target, target.position + 1)
      break
    case 'passe-tour':
      target.skipNextTurn = true
      break
    case 'double-peine':
      addDrinks(players, target, c.effect * 2)
      break
    case 'copie':
      if (isProtected(target)) break
      target.position = clampPos(target.position + (lastMoveDelta ?? 0))
      break
    case 'roulette-russe':
      if (isProtected(target)) break
      if (rng.chance(1 / 3)) addDrinks(players, target, c.effect)
      break
    case 'ancre':
      target.anchored = true
      break
    case 'inversion': {
      if (isProtected(target)) break
      const last = players.reduce((min, p) => (p.position < min.position ? p : min))
      addDrinks(players, last, c.effect)
      break
    }
    case 'melange': {
      if (isProtected(target)) break
      const shuffled = rng.shuffle(players.map((p) => p.position))
      players.forEach((p, i) => {
        p.position = shuffled[i]
      })
      break
    }
    // Miroir inversé : lie l'acteur à la cible (boivent ensemble N tours).
    case 'miroir-inverse':
      actor.mirrorDrinkTargetId = target.id
      actor.mirrorDrinkTurns = c.effect || 1
      break
    case 'rewind':
      if (lastCase && lastCase.type !== 'rewind') {
        applyCaseToTarget(players, actor, target, lastCase, rng, lastMoveDelta, null)
      }
      break
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

    // Ancré : le dé est lancé normalement mais le déplacement est annulé (delta 0) ;
    // une case est quand même tirée et résolue sur la case actuelle (fidèle au mode local).
    const wasAnchored = me.anchored
    if (wasAnchored) me.anchored = false

    const dice = rng.int(1, 6)
    const moveDelta = wasAnchored ? 0 : dice
    me.position = clampPos(me.position + moveDelta)

    // Victoire : atteindre la dernière case.
    if (me.position === BOARD_SIZE - 1) {
      return {
        ...state,
        version: state.version + 1,
        rngState: rng.getState(),
        players,
        lastDice: dice,
        lastMoveDelta: moveDelta,
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
        lastMoveDelta: moveDelta,
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
        lastMoveDelta: moveDelta,
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
      lastMoveDelta: moveDelta,
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
      applyCaseToTarget(players, players[actorIndex], target, state.lastCase, rng, state.lastMoveDelta, null)
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
  // Fin du tour de l'initiateur : liens miroir/chaîne. Puis durée de protection (tous).
  if (players[from]) tickInitiatorLinks(players[from])
  tickProtection(players)

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
    // Début du tour du nouveau joueur : malédiction.
    applyCurseAtTurnStart(players, players[idx])
    return { currentPlayer: idx, turnCount: tc }
  }
  return { currentPlayer: from, turnCount: tc }
}

/** Aide de test/serveur : id du joueur courant. */
export function currentPlayerId(state: EngineState): string | null {
  return state.players[state.currentPlayer]?.id ?? null
}
