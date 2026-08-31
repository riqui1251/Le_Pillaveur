import { createRng, rngFromState, type SeededRng } from '@/lib/petit-buveur/rng'

/**
 * Moteur pur Toucher-Coulé (bataille navale par équipes) — SERVEUR-AUTORITAIRE.
 *
 * Deux équipes (A/B) partagent chacune UNE grille où chaque joueur place ses
 * navires. Les équipes tirent à tour de rôle sur la grille adverse (alternance
 * A/B, rotation des joueurs dans chaque équipe) ; toucher fait rejouer.
 * La grille grandit avec le nombre de joueurs (donc de navires).
 *
 * ANTI-TRICHE : les positions des navires ennemis ne quittent jamais le serveur
 * tant qu'elles ne sont pas touchées (voir `toClientView`).
 */

export type TCMode = '1v1' | '2v2' | '3v3' | '4v4'
export type TeamId = 'A' | 'B'

export type TCModeConfig = {
  playersPerTeam: number
  /** Tailles des navires que CHAQUE joueur place. */
  shipSizesPerPlayer: number[]
  gridSize: number
}

export const TC_MODES: Record<TCMode, TCModeConfig> = {
  '1v1': { playersPerTeam: 1, shipSizesPerPlayer: [4, 3, 2], gridSize: 8 },
  '2v2': { playersPerTeam: 2, shipSizesPerPlayer: [4, 3], gridSize: 10 },
  '3v3': { playersPerTeam: 3, shipSizesPerPlayer: [4, 3], gridSize: 12 },
  '4v4': { playersPerTeam: 4, shipSizesPerPlayer: [4, 3], gridSize: 14 },
}

export type TCPlayer = {
  id: string
  name: string
  team: TeamId
  isBot: boolean
  placed: boolean
  /** Gorgées cumulées à boire (règles apéro : raté = tireur boit, touché = propriétaire boit). */
  drinks: number
  shotsFired: number
  shotsHit: number
  /** Timestamp (ms) du départ du joueur en cours de partie — null/absent s'il est là. */
  leftAt?: number | null
  /** Power-up "Bombe" (tir 2×2) disponible — un seul usage par partie, accordé si la règle est activée. */
  hasBomb: boolean
}

/** Délai de grâce avant qu'un joueur parti soit remplacé par un bot. */
export const TC_REJOIN_GRACE_MS = 3 * 60 * 1000

export type TCShip = {
  id: string
  ownerId: string
  team: TeamId
  cells: number[]
  hits: number[]
  sunk: boolean
}

export type TCShotResult = 'miss' | 'hit' | 'sunk'

/** Résultat d'UNE cellule d'un tir "Bombe" (2×2). */
export type TCBombCellResult = { cell: number; result: TCShotResult; shipOwnerId: string | null }

export type TCLastShot = {
  shooterId: string
  targetTeam: TeamId
  cell: number
  result: TCShotResult
  shipOwnerId: string | null
  winningShot: boolean
  /** Tir "Bombe" (2×2) : détail des 4 cellules ; absent pour un tir simple. */
  bombResults?: TCBombCellResult[]
}

export type TCState = {
  mode: TCMode
  gridSize: number
  phase: 'placement' | 'battle' | 'finished'
  players: TCPlayer[]
  ships: TCShip[]
  /** Tirs reçus par la grille de chaque équipe (cellule → résultat). */
  shotsAt: Record<TeamId, Record<number, 'hit' | 'miss'>>
  /** Ordre de tir global (alternance A/B), ids de joueurs. */
  turnOrder: string[]
  currentTurnIndex: number
  turnCount: number
  winner: TeamId | null
  lastShot: TCLastShot | null
  rematchVotes: string[]
  version: number
  rngState: number
  /** Power-up "Bombe" activé pour la partie (choix hôte, figé au lancement). */
  rulePowerups: boolean
}

export type TCAction =
  | { type: 'PLACE'; playerId: string; ships: number[][] }
  | { type: 'AUTO_PLACE'; playerId: string }
  | { type: 'FIRE'; playerId: string; cell: number; bomb?: boolean }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number }

export class TCEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'TCEngineError'
  }
}

export function otherTeam(team: TeamId): TeamId {
  return team === 'A' ? 'B' : 'A'
}

export function currentTCPlayerId(state: TCState): string | null {
  if (state.phase !== 'battle') return null
  return state.turnOrder[state.currentTurnIndex] ?? null
}

/** Vrai si les cellules forment une ligne droite contiguë (horizontale ou verticale). */
function isStraightLine(cells: number[], gridSize: number): boolean {
  if (cells.length === 0) return false
  const sorted = [...cells].sort((a, b) => a - b)
  if (new Set(sorted).size !== sorted.length) return false
  if (sorted.some((c) => c < 0 || c >= gridSize * gridSize)) return false
  const rows = sorted.map((c) => Math.floor(c / gridSize))
  const cols = sorted.map((c) => c % gridSize)
  const sameRow = rows.every((r) => r === rows[0])
  const sameCol = cols.every((c) => c === cols[0])
  if (sameRow) return sorted.every((c, i) => i === 0 || c === sorted[i - 1] + 1)
  if (sameCol) return sorted.every((c, i) => i === 0 || c === sorted[i - 1] + gridSize)
  return false
}

function teamShipCells(state: TCState, team: TeamId): Set<number> {
  const occupied = new Set<number>()
  for (const ship of state.ships) {
    if (ship.team !== team) continue
    for (const c of ship.cells) occupied.add(c)
  }
  return occupied
}

/** Multiset de tailles identique à la config du mode. */
function sizesMatchConfig(ships: number[][], expected: number[]): boolean {
  if (ships.length !== expected.length) return false
  const got = ships.map((s) => s.length).sort((a, b) => a - b)
  const want = [...expected].sort((a, b) => a - b)
  return got.every((v, i) => v === want[i])
}

/** Génère un placement aléatoire valide pour un joueur (utilisé par les bots et le bouton Aléatoire). */
export function randomPlacement(
  sizes: number[],
  gridSize: number,
  occupied: Set<number>,
  rng: SeededRng
): number[][] {
  const taken = new Set(occupied)
  const result: number[][] = []
  for (const size of sizes) {
    let placedShip: number[] | null = null
    for (let attempt = 0; attempt < 300 && !placedShip; attempt += 1) {
      const horizontal = rng.chance(0.5)
      const row = rng.int(0, gridSize - (horizontal ? 1 : size))
      const col = rng.int(0, gridSize - (horizontal ? size : 1))
      const cells: number[] = []
      for (let i = 0; i < size; i += 1) {
        cells.push(horizontal ? row * gridSize + col + i : (row + i) * gridSize + col)
      }
      if (cells.every((c) => !taken.has(c))) placedShip = cells
    }
    if (!placedShip) throw new TCEngineError('PLACEMENT_IMPOSSIBLE')
    for (const c of placedShip) taken.add(c)
    result.push(placedShip)
  }
  return result
}

export type TCInitialPlayer = {
  id: string
  name: string
  team: TeamId
  isBot: boolean
}

export function createInitialTCState(
  players: TCInitialPlayer[],
  mode: TCMode,
  seed: string | number,
  rules: { powerups?: boolean } = {}
): TCState {
  const config = TC_MODES[mode]
  const teamA = players.filter((p) => p.team === 'A')
  const teamB = players.filter((p) => p.team === 'B')
  if (teamA.length !== config.playersPerTeam || teamB.length !== config.playersPerTeam) {
    throw new TCEngineError('INVALID_TEAMS')
  }

  // Alternance A/B pour l'ordre de tir global.
  const turnOrder: string[] = []
  for (let i = 0; i < config.playersPerTeam; i += 1) {
    turnOrder.push(teamA[i].id, teamB[i].id)
  }

  const rulePowerups = Boolean(rules.powerups)

  return {
    mode,
    gridSize: config.gridSize,
    phase: 'placement',
    players: players.map((p) => ({
      ...p,
      placed: false,
      drinks: 0,
      shotsFired: 0,
      shotsHit: 0,
      hasBomb: rulePowerups,
    })),
    ships: [],
    shotsAt: { A: {}, B: {} },
    turnOrder,
    currentTurnIndex: 0,
    turnCount: 1,
    winner: null,
    lastShot: null,
    rematchVotes: [],
    version: 1,
    rngState: createRng(seed).getState(),
    rulePowerups,
  }
}

function applyPlacement(state: TCState, playerId: string, shipsCells: number[][]): TCState {
  if (state.phase !== 'placement') throw new TCEngineError('NOT_PLACEMENT_PHASE')
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new TCEngineError('UNKNOWN_PLAYER')
  if (player.placed) throw new TCEngineError('ALREADY_PLACED')

  const config = TC_MODES[state.mode]
  if (!sizesMatchConfig(shipsCells, config.shipSizesPerPlayer)) {
    throw new TCEngineError('INVALID_SHIP_SIZES')
  }
  const occupied = teamShipCells(state, player.team)
  for (const cells of shipsCells) {
    if (!isStraightLine(cells, state.gridSize)) throw new TCEngineError('INVALID_SHIP_SHAPE')
    for (const c of cells) {
      if (occupied.has(c)) throw new TCEngineError('SHIPS_OVERLAP')
      occupied.add(c)
    }
  }

  const newShips: TCShip[] = shipsCells.map((cells, i) => ({
    id: `${playerId}-ship-${i}`,
    ownerId: playerId,
    team: player.team,
    cells: [...cells].sort((a, b) => a - b),
    hits: [],
    sunk: false,
  }))

  const players = state.players.map((p) => (p.id === playerId ? { ...p, placed: true } : p))
  const allPlaced = players.every((p) => p.placed)

  return {
    ...state,
    players,
    ships: [...state.ships, ...newShips],
    phase: allPlaced ? 'battle' : 'placement',
    version: state.version + 1,
  }
}

function applyFire(state: TCState, playerId: string, cell: number, bomb = false): TCState {
  if (state.phase !== 'battle') throw new TCEngineError('NOT_BATTLE_PHASE')
  if (currentTCPlayerId(state) !== playerId) throw new TCEngineError('NOT_YOUR_TURN')
  const shooter = state.players.find((p) => p.id === playerId)
  if (!shooter) throw new TCEngineError('UNKNOWN_PLAYER')

  const targetTeam = otherTeam(shooter.team)
  if (cell < 0 || cell >= state.gridSize * state.gridSize) throw new TCEngineError('CELL_OUT_OF_BOUNDS')

  let cellsToResolve = [cell]
  if (bomb) {
    if (!state.rulePowerups) throw new TCEngineError('POWERUPS_DISABLED')
    if (!shooter.hasBomb) throw new TCEngineError('NO_BOMB_CHARGE')
    const row = Math.floor(cell / state.gridSize)
    const col = cell % state.gridSize
    if (row >= state.gridSize - 1 || col >= state.gridSize - 1) throw new TCEngineError('BOMB_OUT_OF_BOUNDS')
    cellsToResolve = [cell, cell + 1, cell + state.gridSize, cell + state.gridSize + 1]
  }
  for (const c of cellsToResolve) {
    if (state.shotsAt[targetTeam][c] !== undefined) throw new TCEngineError('CELL_ALREADY_SHOT')
  }

  const players = state.players.map((p) => ({ ...p }))
  const ships = state.ships.map((s) => ({ ...s, cells: [...s.cells], hits: [...s.hits] }))
  const me = players.find((p) => p.id === playerId)!
  me.shotsFired += 1
  if (bomb) me.hasBomb = false

  const shotsAt: TCState['shotsAt'] = {
    A: { ...state.shotsAt.A },
    B: { ...state.shotsAt.B },
  }

  const bombResults: TCBombCellResult[] = []
  let anyHit = false
  for (const c of cellsToResolve) {
    const hitShip = ships.find((s) => s.team === targetTeam && s.cells.includes(c))
    if (!hitShip) {
      shotsAt[targetTeam][c] = 'miss'
      bombResults.push({ cell: c, result: 'miss', shipOwnerId: null })
      continue
    }
    anyHit = true
    shotsAt[targetTeam][c] = 'hit'
    me.shotsHit += 1
    hitShip.hits.push(c)
    const owner = players.find((p) => p.id === hitShip.ownerId)
    if (owner) owner.drinks += 1
    let result: TCShotResult = 'hit'
    if (hitShip.hits.length === hitShip.cells.length) {
      hitShip.sunk = true
      result = 'sunk'
      if (owner) owner.drinks += 2
    }
    bombResults.push({ cell: c, result, shipOwnerId: hitShip.ownerId })
  }
  // Raté (tir simple, ou bombe entièrement dans l'eau) : le tireur boit.
  if (!anyHit) me.drinks += 1

  const enemyFleetSunk = ships.filter((s) => s.team === targetTeam).every((s) => s.sunk)
  let phase: TCState['phase'] = state.phase
  let winner: TeamId | null = state.winner
  if (enemyFleetSunk) {
    phase = 'finished'
    winner = shooter.team
    for (const p of players) {
      if (p.team === targetTeam) p.drinks += 3
    }
  }

  // Touché (au moins une cellule) → le tireur rejoue ; raté partout → la main passe.
  const advance = !anyHit
  const primary =
    bombResults.find((r) => r.result === 'sunk') ??
    bombResults.find((r) => r.result === 'hit') ??
    bombResults[0]

  return {
    ...state,
    players,
    ships,
    shotsAt,
    phase,
    winner,
    currentTurnIndex: advance ? (state.currentTurnIndex + 1) % state.turnOrder.length : state.currentTurnIndex,
    turnCount: advance ? state.turnCount + 1 : state.turnCount,
    lastShot: {
      shooterId: playerId,
      targetTeam,
      cell: primary.cell,
      result: primary.result,
      shipOwnerId: primary.shipOwnerId,
      winningShot: enemyFleetSunk,
      ...(bomb ? { bombResults } : {}),
    },
    version: state.version + 1,
  }
}

export function reduceTC(state: TCState, action: TCAction): TCState {
  switch (action.type) {
    case 'PLACE':
      return applyPlacement(state, action.playerId, action.ships)
    case 'AUTO_PLACE': {
      if (state.phase !== 'placement') throw new TCEngineError('NOT_PLACEMENT_PHASE')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player) throw new TCEngineError('UNKNOWN_PLAYER')
      if (player.placed) throw new TCEngineError('ALREADY_PLACED')
      const rng = rngFromState(state.rngState)
      const config = TC_MODES[state.mode]
      const ships = randomPlacement(
        config.shipSizesPerPlayer,
        state.gridSize,
        teamShipCells(state, player.team),
        rng
      )
      const next = applyPlacement(state, action.playerId, ships)
      return { ...next, rngState: rng.getState() }
    }
    case 'FIRE':
      return applyFire(state, action.playerId, action.cell, action.bomb)
    case 'LEAVE': {
      if (state.phase === 'finished') throw new TCEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new TCEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
    }
    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new TCEngineError('CANNOT_REJOIN')
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }
    case 'REPLACE_LEFT': {
      // Convertit en bot tous les joueurs partis depuis plus de TC_REJOIN_GRACE_MS.
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= TC_REJOIN_GRACE_MS
      )
      if (expired.length === 0) return state
      const ids = new Set(expired.map((p) => p.id))
      return {
        ...state,
        players: state.players.map((p) =>
          ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }
    default:
      throw new TCEngineError('UNKNOWN_ACTION')
  }
}

/** Fait uniquement placer les bots (sans tirer) — utilisé après un remplacement en phase placement. */
export function placeTCBots(state: TCState): TCState {
  let current = state
  for (let guard = 0; guard < 20; guard += 1) {
    if (current.phase !== 'placement') return current
    const bot = current.players.find((p) => p.isBot && !p.placed)
    if (!bot) return current
    current = reduceTC(current, { type: 'AUTO_PLACE', playerId: bot.id })
  }
  return current
}

/**
 * IA bot : chasse (tir aléatoire) puis ciblage (voisins des touches non coulées,
 * extension de ligne si deux touches alignées). N'utilise QUE l'information
 * publique (carte des tirs + navires coulés) — le bot ne triche pas.
 */
export function botChooseCell(state: TCState, botId: string, rng: SeededRng): number {
  const bot = state.players.find((p) => p.id === botId)
  if (!bot) throw new TCEngineError('UNKNOWN_PLAYER')
  const targetTeam = otherTeam(bot.team)
  const shots = state.shotsAt[targetTeam]
  const size = state.gridSize

  const sunkCells = new Set<number>()
  for (const ship of state.ships) {
    if (ship.team === targetTeam && ship.sunk) for (const c of ship.cells) sunkCells.add(c)
  }
  const openHits: number[] = []
  for (const key of Object.keys(shots)) {
    const c = Number(key)
    if (shots[c] === 'hit' && !sunkCells.has(c)) openHits.push(c)
  }

  const unshot = (c: number) => c >= 0 && c < size * size && shots[c] === undefined
  const candidates: number[] = []

  if (openHits.length >= 2) {
    // Deux touches alignées → prolonger la ligne aux deux extrémités.
    openHits.sort((a, b) => a - b)
    const rows = openHits.map((c) => Math.floor(c / size))
    const cols = openHits.map((c) => c % size)
    if (rows.every((r) => r === rows[0])) {
      const lo = openHits[0]
      const hi = openHits[openHits.length - 1]
      if (lo % size > 0 && unshot(lo - 1)) candidates.push(lo - 1)
      if (hi % size < size - 1 && unshot(hi + 1)) candidates.push(hi + 1)
    } else if (cols.every((c) => c === cols[0])) {
      const lo = openHits[0]
      const hi = openHits[openHits.length - 1]
      if (unshot(lo - size)) candidates.push(lo - size)
      if (unshot(hi + size)) candidates.push(hi + size)
    }
  }
  if (candidates.length === 0 && openHits.length > 0) {
    for (const hit of openHits) {
      const row = Math.floor(hit / size)
      const col = hit % size
      if (col > 0 && unshot(hit - 1)) candidates.push(hit - 1)
      if (col < size - 1 && unshot(hit + 1)) candidates.push(hit + 1)
      if (row > 0 && unshot(hit - size)) candidates.push(hit - size)
      if (row < size - 1 && unshot(hit + size)) candidates.push(hit + size)
    }
  }
  if (candidates.length > 0) return rng.pick(candidates)

  const allUnshot: number[] = []
  for (let c = 0; c < size * size; c += 1) {
    if (shots[c] === undefined) allUnshot.push(c)
  }
  if (allUnshot.length === 0) throw new TCEngineError('NO_CELL_LEFT')
  return rng.pick(allUnshot)
}

/**
 * Le bot utilise sa Bombe (si dispo) sur une case de chasse choisie par
 * `botChooseCell`, seulement si le carré 2×2 tient dans la grille et que les
 * 4 cases sont encore vierges — sinon il tire simple. ~50% de chances quand
 * l'occasion se présente (pas systématique, pour rester lisible/imprévisible).
 */
export function botShouldUseBomb(
  state: TCState,
  bot: TCPlayer,
  cell: number,
  rng: SeededRng
): boolean {
  if (!bot.hasBomb) return false
  const row = Math.floor(cell / state.gridSize)
  const col = cell % state.gridSize
  if (row >= state.gridSize - 1 || col >= state.gridSize - 1) return false
  const targetTeam = otherTeam(bot.team)
  const bombCells = [cell, cell + 1, cell + state.gridSize, cell + state.gridSize + 1]
  const bombFits = bombCells.every((c) => state.shotsAt[targetTeam][c] === undefined)
  return bombFits && rng.chance(0.5)
}

/**
 * Fait jouer les bots tant que c'est leur tour (placement puis tirs).
 * Borné pour éviter toute boucle infinie.
 */
export function advanceTCBots(state: TCState): TCState {
  let current = state
  for (let guard = 0; guard < 1000; guard += 1) {
    if (current.phase === 'placement') {
      const bot = current.players.find((p) => p.isBot && !p.placed)
      if (!bot) return current
      current = reduceTC(current, { type: 'AUTO_PLACE', playerId: bot.id })
      continue
    }
    if (current.phase === 'battle') {
      const activeId = currentTCPlayerId(current)
      const active = current.players.find((p) => p.id === activeId)
      if (!active?.isBot) return current
      const rng = rngFromState(current.rngState)
      const cell = botChooseCell(current, active.id, rng)
      const bomb = botShouldUseBomb(current, active, cell, rng)
      current = { ...reduceTC({ ...current, rngState: rng.getState() }, { type: 'FIRE', playerId: active.id, cell, bomb }) }
      continue
    }
    return current
  }
  return current
}

/** Vue client par navire : navires ennemis réduits à leurs cellules touchées tant qu'ils flottent. */
export type TCShipView = TCShip & { revealed: boolean }

export type TCClientView = Omit<TCState, 'rngState' | 'ships'> & {
  ships: TCShipView[]
  viewerTeam: TeamId | null
}

export function toTCClientView(state: TCState, viewerUserId: string): TCClientView {
  const viewer = state.players.find((p) => p.id === viewerUserId)
  const viewerTeam = viewer?.team ?? null

  const ships: TCShipView[] = state.ships.map((ship) => {
    const visible = ship.team === viewerTeam || ship.sunk
    if (visible) return { ...ship, revealed: true }
    return { ...ship, cells: [...ship.hits], revealed: false }
  })

  const view: Omit<TCState, 'rngState'> & { viewerTeam: TeamId | null } = {
    ...state,
    ships,
    viewerTeam,
  }
  delete (view as Partial<TCState>).rngState
  return view as TCClientView
}

/**
 * Vue SPECTATEUR NEUTRE (écran TV partagé) : n'appartient à AUCUNE équipe, donc
 * seuls les navires COULÉS sont révélés ; les navires intacts sont réduits à
 * leurs cases déjà touchées (comme pour un adversaire). Empêche de spoiler les
 * placements des deux équipes sur un écran vu par tout le monde.
 */
export function toTCSpectatorView(state: TCState): TCClientView {
  const ships: TCShipView[] = state.ships.map((ship) => {
    if (ship.sunk) return { ...ship, revealed: true }
    return { ...ship, cells: [...ship.hits], revealed: false }
  })

  const view: Omit<TCState, 'rngState'> & { viewerTeam: TeamId | null } = {
    ...state,
    ships,
    viewerTeam: null,
  }
  delete (view as Partial<TCState>).rngState
  return view as TCClientView
}
