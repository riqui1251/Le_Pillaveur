import type { AdminGameVibesResponse, AdminGameVibesRow } from '@/app/api/admin/game-vibes/route'
import type { GameDrinkLevel } from '@/lib/games'
import { SOIREE_VIBES, isSoireeVibe, type SoireeVibe } from '@/lib/soiree/vibes'

/**
 * Lecture défensive de GET/PATCH /api/admin/game-vibes : une page d'erreur du
 * proxy ou la réponse d'un serveur plus ancien doit donner une erreur, jamais
 * une liste vide qui laisserait croire qu'aucun jeu ne sort en Mode Soirée.
 */

function isLevel(value: unknown): value is GameDrinkLevel {
  return value === 1 || value === 2 || value === 3
}

/** Liste d'ambiances sans valeur inconnue ni doublon ; une liste vide est valide (le jeu ne sort plus au tirage). */
function parseVibes(raw: unknown): SoireeVibe[] | null {
  if (!Array.isArray(raw)) return null
  const vibes: SoireeVibe[] = []
  for (const value of raw) {
    if (!isSoireeVibe(value) || vibes.includes(value)) return null
    vibes.push(value)
  }
  return vibes
}

function parseRow(raw: unknown): AdminGameVibesRow | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const vibes = parseVibes(row.vibes)
  const defaultVibes = parseVibes(row.defaultVibes)
  if (
    typeof row.id !== 'string' ||
    typeof row.hidden !== 'boolean' ||
    typeof row.inSoiree !== 'boolean' ||
    typeof row.defaultInSoiree !== 'boolean' ||
    !isLevel(row.drinkLevel) ||
    !vibes ||
    !defaultVibes
  ) {
    return null
  }
  return {
    id: row.id,
    hidden: row.hidden,
    inSoiree: row.inSoiree,
    defaultInSoiree: row.defaultInSoiree,
    drinkLevel: row.drinkLevel,
    vibes,
    defaultVibes,
  }
}

export function parseAdminGameVibes(body: unknown): AdminGameVibesResponse | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  if (typeof value.canEdit !== 'boolean' || !Array.isArray(value.games)) return null
  const games: AdminGameVibesRow[] = []
  for (const raw of value.games) {
    const row = parseRow(raw)
    if (!row) return null
    games.push(row)
  }
  return { canEdit: value.canEdit, games }
}

/** Réglage de l'équipe ≠ réglage par défaut du niveau « Fait boire » (les deux listes sont dans l'ordre des ambiances). */
export function isModifiedVibes(row: Pick<AdminGameVibesRow, 'vibes' | 'defaultVibes'>): boolean {
  return row.vibes.length !== row.defaultVibes.length || row.vibes.some((vibe, index) => vibe !== row.defaultVibes[index])
}

/** Ajouté ou retiré par l'équipe par rapport à la liste du code ; null quand le jeu suit le code. */
export function soireeChange(row: Pick<AdminGameVibesRow, 'inSoiree' | 'defaultInSoiree'>): 'added' | 'removed' | null {
  if (row.inSoiree === row.defaultInSoiree) return null
  return row.inSoiree ? 'added' : 'removed'
}

/** Jeux du Mode Soirée visibles, et jeux cachés qui y restent rangés (ils sortent du site, donc du tirage). */
export function soireeCounts(games: readonly AdminGameVibesRow[]): { inSoiree: number; hiddenInSoiree: number } {
  let inSoiree = 0
  let hiddenInSoiree = 0
  for (const game of games) {
    if (!game.inSoiree) continue
    if (game.hidden) hiddenInSoiree += 1
    else inSoiree += 1
  }
  return { inSoiree, hiddenInSoiree }
}

/**
 * Jeux tirables par ambiance. Un jeu hors du Mode Soirée ou caché n'est pas
 * compté : le compte doit dire combien de jeux la soirée a vraiment.
 */
export function vibeCounts(games: readonly AdminGameVibesRow[]): Record<SoireeVibe, number> {
  const counts: Record<SoireeVibe, number> = { apero: 0, monte: 0, grosse: 0 }
  for (const game of games) {
    if (game.hidden || !game.inSoiree) continue
    for (const vibe of SOIREE_VIBES) if (game.vibes.includes(vibe)) counts[vibe] += 1
  }
  return counts
}
