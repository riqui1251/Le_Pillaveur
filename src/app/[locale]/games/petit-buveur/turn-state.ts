import type { GamePlayer } from './case-types'

/** Délai d'animation du pion : 120 ms par case parcourue + 250 ms d'arrivée (useSteppedPositions). */
export const HOP_MS_PER_CASE = 120
export const HOP_SETTLE_MS = 250

/**
 * Copie profonde au niveau joueur : les résolutions modifient la copie, jamais
 * les objets de l'état React (sinon useMemo/[players] ne voit aucun changement).
 */
export function clonePlayers(players: GamePlayer[]): GamePlayer[] {
  return players.map(p => ({ ...p }))
}

export function clampBoardPosition(position: number, boardSize: number): number {
  return Math.max(0, Math.min(boardSize - 1, position))
}

/** Lancer de dé : un joueur ancré ne bouge pas et perd son ancre. */
export function applyDiceRoll(
  players: GamePlayer[],
  actorIndex: number,
  roll: number,
  boardSize: number
): { players: GamePlayer[]; moveDelta: number; from: number; to: number } {
  const next = clonePlayers(players)
  const actor = next[actorIndex]
  if (!actor) return { players: next, moveDelta: 0, from: 0, to: 0 }
  const moveDelta = actor.anchored ? 0 : roll
  const from = actor.position
  actor.position = clampBoardPosition(from + moveDelta, boardSize)
  actor.anchored = false
  return { players: next, moveDelta, from, to: actor.position }
}

/**
 * Règle 1 : premier à l'arrivée par n'importe quel déplacement. Si plusieurs y
 * sont, l'acteur gagne s'il y est, sinon le premier dans l'ordre de jeu après lui.
 */
export function detectWinner(
  players: GamePlayer[],
  actorIndex: number,
  boardSize: number
): GamePlayer | null {
  const count = players.length
  if (count === 0) return null
  const start = actorIndex >= 0 && actorIndex < count ? actorIndex : 0
  for (let offset = 0; offset < count; offset++) {
    const candidate = players[(start + offset) % count]
    if (candidate.position >= boardSize - 1) return candidate
  }
  return null
}

/** Temps pour que le pion le plus déplacé finisse son animation case par case. */
export function hopDurationMs(before: GamePlayer[], after: GamePlayer[]): number {
  let maxSteps = 0
  for (const p of after) {
    const prev = before.find(b => b.id === p.id)
    if (!prev) continue
    maxSteps = Math.max(maxSteps, Math.abs(p.position - prev.position))
  }
  return maxSteps * HOP_MS_PER_CASE + HOP_SETTLE_MS
}
