import type { GameCategory } from '@/lib/game-catalog'

/**
 * Filtres de catégories du hub (rubriques créées par l'équipe, voir
 * GameCategory). Fonctions pures : l'état (la puce choisie) vit dans GamesGrid.
 */

/**
 * Les catégories à proposer en puces : celles qui rangent au moins un jeu
 * affiché dans le catalogue (`shownIds`) — une rubrique dont tous les jeux sont
 * cachés, éteints par « Sans alcool » ou absents de cette langue ne mène à rien.
 */
export function categoriesToOffer(categories: readonly GameCategory[], shownIds: ReadonlySet<string>): GameCategory[] {
  return categories.filter((category) => category.gameIds.some((id) => shownIds.has(id)))
}

/**
 * La catégorie réellement active : `activeId` seulement si elle est encore
 * proposée. Supprimée côté serveur (ou vidée de ses jeux visibles), la puce
 * choisie retombe sur « Toutes » (null) au lieu de laisser une grille vide.
 */
export function resolveActiveCategory(offered: readonly GameCategory[], activeId: string | null): GameCategory | null {
  return activeId ? (offered.find((category) => category.id === activeId) ?? null) : null
}

/** Les jeux de la catégorie ; tous quand il n'y en a pas d'active. */
export function filterByCategory<T extends { id: string }>(games: readonly T[], category: GameCategory | null): T[] {
  if (!category) return games.slice()
  const ids = new Set(category.gameIds)
  return games.filter((game) => ids.has(game.id))
}
