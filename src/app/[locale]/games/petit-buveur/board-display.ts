import type { PetitBuveurCastState } from '@/lib/cast-types'
import type { AmbianceMode } from './ambiance'
import type { PetitBuveurT } from './case-config'

type Positioned = { id: string; position: number }

/**
 * Case AFFICHÉE d'un pion : l'état saute à la position finale, le pion marche
 * case par case (useSteppedPositions). HUD, classement et surbrillance lisent
 * cette valeur pour ne pas annoncer l'arrivée avant le pion.
 */
export function shownPosition(player: Positioned, shown: Record<string, number>): number {
  return shown[player.id] ?? player.position
}

/** Classement par case affichée, du premier au dernier (ordre de jeu conservé à égalité). */
export function rankByShownPosition<T extends Positioned>(players: readonly T[], shown: Record<string, number>): T[] {
  return [...players].sort((a, b) => shownPosition(b, shown) - shownPosition(a, shown))
}

export type BoardHighlights = { leader: number; active: number }

export function boardHighlights(
  players: readonly Positioned[],
  currentIndex: number,
  shown: Record<string, number>
): BoardHighlights {
  const current = players[currentIndex]
  return {
    leader: players.length > 0 ? Math.max(...players.map(p => shownPosition(p, shown))) : -1,
    active: current ? shownPosition(current, shown) : -1,
  }
}

export function boardHighlightClass(index: number, { leader, active }: BoardHighlights): string {
  if (index === active && index === leader) return 'pb-board-highlight-both'
  if (index === active) return 'pb-board-highlight-active'
  if (index === leader) return 'pb-board-highlight-leader'
  return ''
}

/** Signal TV (dé ou case) : `seq` ne redescend jamais, même après un remontage du jeu (changement de langue). */
export function nextCastCue<T extends object>(
  prev: { seq: number } | null | undefined,
  payload: T,
  now: number
): T & { seq: number } {
  return { ...payload, seq: Math.max((prev?.seq ?? 0) + 1, now) }
}

export function buildLocalCastState(input: {
  players: readonly { id: string; name: string; position: number; drinks: number }[]
  currentPlayer: number
  winnerId: string | null
  dice: { value: number; seq: number } | null
  reveal: { caseType: string; seq: number } | null
  ambiance: AmbianceMode
}): PetitBuveurCastState {
  return {
    castKind: 'petit-buveur',
    players: input.players.map(p => ({ id: p.id, name: p.name, position: p.position, drinks: p.drinks })),
    currentPlayer: input.currentPlayer,
    phase: input.winnerId ? 'finished' : 'playing',
    winner: input.winnerId,
    dice: input.dice,
    reveal: input.reveal,
    ambiance: input.ambiance,
  }
}

export type SlotPart = string | { slot: string }

const slotMarker = (name: string) => `__SLOT_${name}__`

/**
 * Traduit une phrase dont certains paramètres sont des composants (nom de
 * joueur stylé) : next-intl n'accepte de nœud React qu'entre balises, or les
 * messages du jeu portent des `{player}` simples.
 */
export function translateWithSlots(
  t: PetitBuveurT,
  key: string,
  slots: readonly string[],
  plain?: Record<string, string | number>
): SlotPart[] {
  const values: Record<string, string | number> = { ...plain }
  for (const slot of slots) values[slot] = slotMarker(slot)
  return splitSlots(t(key, values), slots)
}

export function splitSlots(text: string, slots: readonly string[]): SlotPart[] {
  if (slots.length === 0) return text ? [text] : []
  const bySlot = new Map(slots.map(s => [slotMarker(s), s]))
  const pattern = new RegExp(`(${[...bySlot.keys()].join('|')})`)
  return text
    .split(pattern)
    .filter(part => part !== '')
    .map(part => (bySlot.has(part) ? { slot: bySlot.get(part)! } : part))
}
