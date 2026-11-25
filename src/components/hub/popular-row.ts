import { hasContentIn, type GameMeta } from '@/lib/games'
import { FEATURED_LIMIT, POPULAR_LIMIT, isGameListed, isPlayableIn, type GameCatalogMode } from '@/lib/game-catalog'

/**
 * Rangée « Les plus joués en ce moment » du hub (module pur, testé).
 *
 * `candidates` = les jeux que la page montre déjà (visibilité, Sans alcool,
 * langue, recherche : tout filtre de la page est appliqué AVANT) ; la rangée
 * ne ressort jamais un jeu que le reste de la page écarte. Les ids viennent
 * du serveur (useGameCatalog().popular[mode]), du plus au moins joué : il en classe
 * POPULAR_RANKED_LIMIT, la rangée n'en garde que `limit` une fois les jeux exclus.
 *
 * `ranked` dit d'où vient la rangée : true = classement du serveur (jeux
 * réellement joués, aucun complément) ; false = repli sur les jeux phares du
 * code (`featured`) jouables ici, quand le filtre vide la liste (catalogue
 * pas encore lu, aucune partie, jeux populaires absents dans cette langue ou
 * en Sans alcool). L'appelant titre la rangée en conséquence : un jeu sans
 * partie ne se présente jamais comme populaire. Rien à montrer → [].
 */
export function buildPopularRow<G extends GameMeta>({
  candidates,
  popularIds,
  hiddenIds,
  mode,
  locale,
  limit = POPULAR_LIMIT,
  excludeIds = [],
}: {
  candidates: readonly G[]
  popularIds: readonly string[]
  hiddenIds: readonly string[]
  mode: GameCatalogMode
  locale: string
  limit?: number
  /** Jeux déjà montrés ailleurs (la rangée « À la une ») : la rangée ne les répète pas. */
  excludeIds?: readonly string[]
}): { games: G[]; ranked: boolean } {
  const eligible = candidates.filter(
    (game) =>
      isGameListed(game, hiddenIds) && isPlayableIn(game, mode) && hasContentIn(game, locale) && !excludeIds.includes(game.id)
  )
  const byId = new Map(eligible.map((game) => [game.id, game]))
  const pick = (ids: readonly string[]): G[] => {
    const seen = new Set<string>()
    const picked: G[] = []
    for (const id of ids) {
      const game = byId.get(id)
      if (!game || seen.has(id)) continue
      seen.add(id)
      picked.push(game)
      if (picked.length >= limit) break
    }
    return picked
  }

  const fromServer = pick(popularIds)
  if (fromServer.length > 0) return { games: fromServer, ranked: true }

  return { games: pick(eligible.filter((game) => game.featured).map((game) => game.id)), ranked: false }
}

/**
 * Rangée « À la une » du hub : les jeux que l'équipe a mis en avant depuis la
 * Supervision, dans l'ordre de mise à la une. Mêmes filtres que « Les plus
 * joués » (`candidates` déjà filtrés par la page : recherche, catégorie, Sans
 * alcool ; ici la visibilité, le mode et la langue) : un jeu que le reste de la
 * page écarte n'y paraît jamais. Aucun jeu à la une → [] (pas de rangée).
 */
export function buildFeaturedRow<G extends GameMeta>({
  candidates,
  featuredIds,
  hiddenIds,
  mode,
  locale,
  limit = FEATURED_LIMIT,
}: {
  candidates: readonly G[]
  featuredIds: readonly string[]
  hiddenIds: readonly string[]
  mode: GameCatalogMode
  locale: string
  limit?: number
}): G[] {
  const byId = new Map(
    candidates
      .filter((game) => isGameListed(game, hiddenIds) && isPlayableIn(game, mode) && hasContentIn(game, locale))
      .map((game) => [game.id, game])
  )
  const picked: G[] = []
  for (const id of new Set(featuredIds)) {
    const game = byId.get(id)
    if (game) picked.push(game)
    if (picked.length >= limit) break
  }
  return picked
}

/**
 * Catalogue de la landing : jeux cachés écartés, jeux mis en avant d'abord
 * (les plus joués en local puis en ligne, sans doublon), puis le reste dans
 * l'ordre du catalogue. `fallback` sert quand le serveur n'a rien donné
 * (base illisible) : les jeux phares du code, jamais une grille sans repère.
 *
 * `featuredIds` : les jeux que l'équipe a mis à la une (ordre de mise à la une),
 * qui passent avant tout le reste, sous la pastille « À la une ».
 *
 * `ranked` : la mise en avant vient du classement (pastille « Populaire ») ;
 * sinon ce sont les jeux phares (pastille « Incontournable »), jamais un jeu
 * sans partie présenté comme populaire.
 */
export function orderLandingGames<G extends GameMeta>({
  games,
  hiddenIds,
  popular,
  fallback,
  featuredIds = [],
}: {
  games: readonly G[]
  hiddenIds: readonly string[]
  popular: Record<GameCatalogMode, readonly string[]>
  fallback: Record<GameCatalogMode, readonly string[]>
  featuredIds?: readonly string[]
}): { games: G[]; highlightedIds: Set<string>; teamFeaturedIds: Set<string>; ranked: boolean } {
  const listed = games.filter((game) => isGameListed(game, hiddenIds))
  const byId = new Map(listed.map((game) => [game.id, game]))
  const merge = (source: Record<GameCatalogMode, readonly string[]>, skip: ReadonlySet<string>, limit: number) => [
    ...new Set(
      (['local', 'online'] as const).flatMap((mode) =>
        source[mode].filter((id) => byId.has(id) && !skip.has(id)).slice(0, limit)
      )
    ),
  ]

  const teamFeatured = [...new Set(featuredIds)].filter((id) => byId.has(id)).slice(0, FEATURED_LIMIT)
  const teamFeaturedIds = new Set(teamFeatured)
  const ranked = merge(popular, new Set(), POPULAR_LIMIT).length > 0
  // Un jeu à la une garde sa pastille « À la une » : il ne passe pas deux fois.
  // L'exclusion précède la coupe à POPULAR_LIMIT par mode : le classement du
  // serveur en porte assez pour que les jeux à la une ne vident pas la rangée.
  const highlighted = ranked
    ? merge(popular, teamFeaturedIds, POPULAR_LIMIT)
    : merge(fallback, teamFeaturedIds, Number.POSITIVE_INFINITY)
  const highlightedIds = new Set(highlighted)

  return {
    games: [
      ...teamFeatured.map((id) => byId.get(id) as G),
      ...highlighted.map((id) => byId.get(id) as G),
      ...listed.filter((game) => !teamFeaturedIds.has(game.id) && !highlightedIds.has(game.id)),
    ],
    highlightedIds,
    teamFeaturedIds,
    ranked,
  }
}
