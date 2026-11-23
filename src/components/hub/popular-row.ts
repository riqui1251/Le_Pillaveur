import { hasContentIn, type GameMeta } from '@/lib/games'
import { POPULAR_LIMIT, isGameListed, isPlayableIn, type GameCatalogMode } from '@/lib/game-catalog'

/**
 * Rangée « Les plus joués en ce moment » du hub (module pur, testé).
 *
 * `candidates` = les jeux que la page montre déjà (visibilité, Sans alcool,
 * langue, recherche : tout filtre de la page est appliqué AVANT) ; la rangée
 * ne ressort jamais un jeu que le reste de la page écarte. Les ids viennent
 * du serveur (useGameCatalog().popular[mode]), du plus au moins joué.
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
}: {
  candidates: readonly G[]
  popularIds: readonly string[]
  hiddenIds: readonly string[]
  mode: GameCatalogMode
  locale: string
  limit?: number
}): { games: G[]; ranked: boolean } {
  const eligible = candidates.filter(
    (game) => isGameListed(game, hiddenIds) && isPlayableIn(game, mode) && hasContentIn(game, locale)
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
 * Catalogue de la landing : jeux cachés écartés, jeux mis en avant d'abord
 * (les plus joués en local puis en ligne, sans doublon), puis le reste dans
 * l'ordre du catalogue. `fallback` sert quand le serveur n'a rien donné
 * (base illisible) : les jeux phares du code, jamais une grille sans repère.
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
}: {
  games: readonly G[]
  hiddenIds: readonly string[]
  popular: Record<GameCatalogMode, readonly string[]>
  fallback: Record<GameCatalogMode, readonly string[]>
}): { games: G[]; highlightedIds: Set<string>; ranked: boolean } {
  const listed = games.filter((game) => isGameListed(game, hiddenIds))
  const byId = new Map(listed.map((game) => [game.id, game]))
  const merge = (source: Record<GameCatalogMode, readonly string[]>) =>
    [...new Set([...source.local, ...source.online])].filter((id) => byId.has(id))

  let highlighted = merge(popular)
  const ranked = highlighted.length > 0
  if (!ranked) highlighted = merge(fallback)
  const highlightedIds = new Set(highlighted)

  return {
    games: [
      ...highlighted.map((id) => byId.get(id) as G),
      ...listed.filter((game) => !highlightedIds.has(game.id)),
    ],
    highlightedIds,
    ranked,
  }
}
