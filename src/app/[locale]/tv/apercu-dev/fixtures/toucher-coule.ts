import {
  botChooseCell,
  createInitialTCState,
  currentTCPlayerId,
  otherTeam,
  reduceTC,
  type TCMode,
  type TCState,
  type TeamId,
} from '@/lib/toucher-coule/engine'
import { rngFromState } from '@/lib/petit-buveur/rng'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'toucher-coule'

/** Noms longs en tête : 4v4 = 8 joueurs, le maximum du jeu. */
const LONG_NAMES = [
  'Marie-Charlotte',
  'Jean-Baptiste',
  'Léa',
  'Maxime',
  'Sofiane',
  'Camille',
  'Inès',
  'Thomas',
] as const

function newGame(mode: TCMode, members: PreviewMember[], bots: number, powerups: boolean, seed: string): TCState {
  const perTeam = members.length / 2
  const players = members.map((m, i) => ({
    id: m.userId,
    name: m.displayName,
    team: (i < perTeam ? 'A' : 'B') as TeamId,
    isBot: i >= members.length - bots,
  }))
  return createInitialTCState(players, mode, seed, { powerups })
}

function placeAll(state: TCState, except: string[] = []): TCState {
  let s = state
  for (const p of s.players) {
    if (!except.includes(p.id)) s = reduceTC(s, { type: 'AUTO_PLACE', playerId: p.id })
  }
  return s
}

function fire(state: TCState, cell: number, bomb = false): TCState {
  const playerId = currentTCPlayerId(state)
  if (!playerId) throw new Error('pas de tireur')
  return reduceTC(state, { type: 'FIRE', playerId, cell, bomb })
}

/** Tir « réaliste » du joueur au tour (IA de bot, information publique seulement). */
function aiShot(state: TCState): TCState {
  const playerId = currentTCPlayerId(state)
  if (!playerId) return state
  const rng = rngFromState(state.rngState)
  const cell = botChooseCell(state, playerId, rng)
  return reduceTC({ ...state, rngState: rng.getState() }, { type: 'FIRE', playerId, cell })
}

function aiShots(state: TCState, count: number): TCState {
  let s = state
  for (let i = 0; i < count && s.phase === 'battle'; i += 1) s = aiShot(s)
  return s
}

function shooterTarget(state: TCState): TeamId {
  const shooter = state.players.find((p) => p.id === currentTCPlayerId(state))
  return otherTeam(shooter?.team ?? 'A')
}

function freeWaterCell(state: TCState): number {
  const target = shooterTarget(state)
  const occupied = new Set(state.ships.filter((s) => s.team === target).flatMap((s) => s.cells))
  for (let c = 0; c < state.gridSize * state.gridSize; c += 1) {
    if (!occupied.has(c) && state.shotsAt[target][c] === undefined) return c
  }
  throw new Error('plus d’eau libre')
}

function unsunkShipOfTarget(state: TCState) {
  const target = shooterTarget(state)
  const ship = state.ships.find((s) => s.team === target && !s.sunk)
  if (!ship) throw new Error('aucun navire')
  return ship
}

/** Carré 2×2 vierge contenant au moins une case de navire (tir Bombe parlant). */
function bombAnchor(state: TCState): number {
  const target = shooterTarget(state)
  const n = state.gridSize
  const occupied = new Set(state.ships.filter((s) => s.team === target).flatMap((s) => s.cells))
  for (let c = 0; c < n * n; c += 1) {
    if (Math.floor(c / n) >= n - 1 || c % n >= n - 1) continue
    const cells = [c, c + 1, c + n, c + n + 1]
    if (cells.some((x) => state.shotsAt[target][x] !== undefined)) continue
    if (cells.some((x) => occupied.has(x))) return c
  }
  throw new Error('pas de carré')
}

function unsunkLeft(state: TCState, team: TeamId): number {
  return state.ships.filter((s) => s.team === team && !s.sunk).length
}

/** Touche (sans couler) un navire de `ownerId` : donne le bandeau « Touché » le plus long, avec un nom long. */
function hitOn(state: TCState, ownerId: string): TCState {
  const owner = state.players.find((p) => p.id === ownerId)
  let s = state
  for (let i = 0; i < 200 && s.phase === 'battle'; i += 1) {
    const shooter = s.players.find((p) => p.id === currentTCPlayerId(s))
    if (shooter && owner && shooter.team !== owner.team) break
    s = aiShot(s)
  }
  const target = shooterTarget(s)
  const open = (ship: TCState['ships'][number]) => ship.cells.filter((c) => s.shotsAt[target][c] === undefined)
  const ship =
    s.ships.find((x) => x.ownerId === ownerId && !x.sunk && open(x).length >= 2) ??
    s.ships.find((x) => x.team === target && !x.sunk && open(x).length >= 2)
  if (!ship) throw new Error('aucun navire à toucher')
  return fire(s, open(ship)[0])
}

function step(label: string, state: TCState, members: PreviewMember[]): TvPreviewStep {
  return {
    label,
    room: onlineRoom(GAME, state, {
      members,
      currentTurnUserId: currentTCPlayerId(state),
      stateVersion: state.version,
    }),
  }
}

function battle4v4(): TvPreviewFixture {
  const members = previewMembers(8, LONG_NAMES)
  const placed = placeAll(newGame('4v4', members, 2, true, 'apercu-tc-4v4'))
  const steps: TvPreviewStep[] = [step('début de bataille', placed, members)]

  let s = fire(placed, freeWaterCell(placed))
  steps.push(step('à l’eau (le tireur boit)', s, members))

  const ship = unsunkShipOfTarget(s)
  s = fire(s, ship.cells[0])
  steps.push(step('touché (le tireur rejoue)', s, members))
  for (const c of ship.cells.slice(1)) s = fire(s, c)
  steps.push(step('coulé', s, members))

  s = fire(s, freeWaterCell(s))
  s = fire(s, bombAnchor(s), true)
  steps.push(step('bombe 2×2', s, members))

  s = aiShots(s, 70)
  s = reduceTC(s, { type: 'LEAVE', playerId: 'u2', at: Date.now() - 60_000 })
  steps.push(step('mi-partie + joueur parti', s, members))

  s = reduceTC(s, { type: 'LEAVE', playerId: 'u1', at: Date.now() - 20_000 })
  s = reduceTC(s, { type: 'LEAVE', playerId: 'u3', at: Date.now() })
  s = hitOn(s, 'u1')
  steps.push(step('3 joueurs partis + touché sur un nom long', s, members))

  for (let i = 0; i < 400 && s.phase === 'battle' && unsunkLeft(s, 'A') > 1 && unsunkLeft(s, 'B') > 1; i += 1) {
    s = aiShot(s)
  }
  steps.push(step('fin de partie : un seul navire restant + 3 joueurs partis', s, members))
  return { id: 'bataille-4v4', label: 'Bataille 4v4 (8 joueurs, noms longs, bombes)', steps }
}

function placement4v4(): TvPreviewFixture {
  const members = previewMembers(8, LONG_NAMES)
  const fresh = newGame('4v4', members, 0, false, 'apercu-tc-placement')
  const partial = placeAll(fresh, ['u1', 'u2', 'u6'])
  return {
    id: 'placement-4v4',
    label: 'Placement 4v4 (5/8 prêts)',
    steps: [step('placement en cours', fresh, members), step('5 joueurs prêts', partial, members)],
  }
}

function placement1v1(): TvPreviewFixture {
  const members = previewMembers(2, ['Hugo', 'Nora'])
  const fresh = newGame('1v1', members, 0, false, 'apercu-tc-placement-1v1')
  return {
    id: 'placement-1v1',
    label: 'Placement 1v1 (1/2 prêt)',
    steps: [step('placement en cours', fresh, members), step('1 joueur prêt', placeAll(fresh, ['u2']), members)],
  }
}

function duel1v1(): TvPreviewFixture {
  const members = previewMembers(2, ['Hugo', 'Nora'])
  const placed = placeAll(newGame('1v1', members, 1, false, 'apercu-tc-1v1'))
  const mid = aiShots(placed, 14)
  let end = mid
  for (let i = 0; i < 400 && end.phase === 'battle'; i += 1) end = aiShot(end)
  return {
    id: 'duel-1v1',
    label: 'Duel 1v1 (grille 8×8, peu de joueurs)',
    steps: [step('début', placed, members), step('mi-partie', mid, members), step('fin (TvVictory)', end, members)],
  }
}

function team(mode: TCMode, count: number, id: string, label: string): TvPreviewFixture {
  const members = previewMembers(count, LONG_NAMES)
  const placed = placeAll(newGame(mode, members, 1, true, `apercu-tc-${mode}`))
  return { id, label, steps: [step('mi-partie', aiShots(placed, 30), members)] }
}

export function build(): TvPreviewFixture[] {
  return [
    placement4v4(),
    placement1v1(),
    battle4v4(),
    team('3v3', 6, 'bataille-3v3', 'Bataille 3v3 (grille 12×12)'),
    team('2v2', 4, 'bataille-2v2', 'Bataille 2v2 (grille 10×10)'),
    duel1v1(),
  ]
}
