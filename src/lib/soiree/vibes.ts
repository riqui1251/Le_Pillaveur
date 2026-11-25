import type { GameDrinkLevel } from '@/lib/games'

/**
 * Les ambiances du Mode Soirée. Fichier sans dépendance vers program.ts ni
 * game-catalog.ts : le catalogue réglé par l'équipe et le tirage du programme
 * s'en servent tous les deux, un import croisé ferait un cycle.
 */
export const SOIREE_VIBES = ['apero', 'monte', 'grosse'] as const
export type SoireeVibe = (typeof SOIREE_VIBES)[number]

export function isSoireeVibe(value: unknown): value is SoireeVibe {
  return typeof value === 'string' && (SOIREE_VIBES as readonly string[]).includes(value)
}

/**
 * Ambiances où un jeu peut être tiré tant que l'équipe n'a rien coché : elles
 * découlent de son niveau « Fait boire » (Peu → apéro et ça monte ; Moyen →
 * les trois ; Beaucoup → ça monte et grosse soirée), dans l'ordre de SOIREE_VIBES.
 */
export function defaultVibesForLevel(level: GameDrinkLevel): SoireeVibe[] {
  if (level === 1) return ['apero', 'monte']
  if (level === 3) return ['monte', 'grosse']
  return ['apero', 'monte', 'grosse']
}
