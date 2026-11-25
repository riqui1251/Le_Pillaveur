import type { AdminGameCategoriesResponse } from '@/app/api/admin/game-categories/route'
import {
  GAME_CATEGORY_LIMITS,
  cleanCategoryName,
  isGameCategoryId,
  normalizeCategoryGameIds,
  normalizeCategoryNames,
  type GameCategory,
  type GameCategoryNames,
} from '@/lib/game-catalog'

/**
 * Lecture défensive de GET/POST/PATCH/DELETE /api/admin/game-categories : une
 * page d'erreur du proxy ou la réponse d'un serveur plus ancien doit donner
 * une erreur, jamais une liste vide qui laisserait croire qu'aucune catégorie
 * n'existe (et inviterait à en recréer).
 */

function parseCategory(raw: unknown): GameCategory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entry = raw as Record<string, unknown>
  const names = normalizeCategoryNames(entry.names)
  if (!isGameCategoryId(entry.id) || !names || !Array.isArray(entry.gameIds)) return null
  return { id: entry.id, names, gameIds: normalizeCategoryGameIds(entry.gameIds) }
}

export function parseAdminGameCategories(body: unknown): AdminGameCategoriesResponse | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  if (typeof value.canEdit !== 'boolean' || !Array.isArray(value.categories)) return null
  const categories: GameCategory[] = []
  for (const raw of value.categories) {
    const category = parseCategory(raw)
    if (!category) return null
    categories.push(category)
  }
  return { canEdit: value.canEdit, categories }
}

/** Champs de saisie des noms : le français est obligatoire, les autres langues facultatives. */
export type CategoryNameInputs = { fr: string; en: string; es: string; it: string }

export const EMPTY_NAME_INPUTS: CategoryNameInputs = { fr: '', en: '', es: '', it: '' }

export function nameInputsOf(names: GameCategoryNames): CategoryNameInputs {
  return { fr: names.fr, en: names.en ?? '', es: names.es ?? '', it: names.it ?? '' }
}

/**
 * Saisie → noms à envoyer : null tant que le nom français n'est pas valide. Une
 * autre langue vide est omise, une trop longue refusée (null) plutôt que
 * tronquée en silence.
 */
export function namesFromInputs(inputs: CategoryNameInputs): GameCategoryNames | null {
  const fr = cleanCategoryName(inputs.fr)
  if (!fr) return null
  const names: GameCategoryNames = { fr }
  for (const locale of ['en', 'es', 'it'] as const) {
    if (!inputs[locale].trim()) continue
    const name = cleanCategoryName(inputs[locale])
    if (!name) return null
    names[locale] = name
  }
  return names
}

export function canAddCategory(count: number): boolean {
  return count < GAME_CATEGORY_LIMITS.maxCategories
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** Recherche de jeu par titre, sans tenir compte des accents ni de la casse ; vide = tous. */
export function filterGameIds(ids: readonly string[], query: string, titleOf: (id: string) => string): string[] {
  const needle = fold(query)
  if (!needle) return [...ids]
  return ids.filter((id) => fold(titleOf(id)).includes(needle))
}

/** Catégories où un jeu est rangé. */
export function categoryIdsOfGame(categories: readonly GameCategory[], gameId: string): string[] {
  return categories.filter((category) => category.gameIds.includes(gameId)).map((category) => category.id)
}

/**
 * Empreinte du rangement (ordre, noms, jeux) : deux listes qui disent la même chose ont la même
 * empreinte, donc le catalogue de l'appareil ne déclenche une relecture que pour un vrai changement.
 */
export function categoriesSignature(categories: readonly GameCategory[]): string {
  return JSON.stringify(categories.map((category) => [category.id, category.names, [...category.gameIds].sort()]))
}
