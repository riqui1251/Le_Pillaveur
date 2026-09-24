import { GAMES, type GameMeta } from '@/lib/games'

/**
 * Collections de jeux — les pages /jeux/<collection> (« à 2 joueurs »,
 * « sans alcool », « seul avec des bots », « en grand groupe »).
 *
 * Chaque collection est un FILTRE sur le registre (src/lib/games.ts), jamais
 * une liste tenue à la main : un jeu qui gagne des bots ou un mode Soft entre
 * dans la collection tout seul, et un jeu masqué en sort de même. Les textes
 * (titre, description, intro) vivent dans le catalogue i18n sous
 * `collections.<slug>` — lus par la seule page serveur, hors du socle client —
 * et la puce de chaque collection sous `hub.collections.<slug>.chip` (hub,
 * vitrine) ; ce module n'en connaît que les slugs.
 *
 * Les slugs sont IDENTIQUES dans les quatre langues : c'est le contrat avec le
 * sitemap et les alternates hreflang (src/app/sitemap.ts, src/lib/seo/…) — une
 * URL par collection et par langue, `/fr/jeux/sans-alcool` comme
 * `/en/jeux/sans-alcool`. Les renommer casserait ces liens : on ne les touche
 * pas sans redirection.
 */

export const COLLECTION_SLUGS = [
  'a-2-joueurs',
  'sans-alcool',
  'seul-avec-des-bots',
  'en-grand-groupe',
] as const

export type CollectionSlug = (typeof COLLECTION_SLUGS)[number]

/** Effectif à partir duquel une table est « un grand groupe » (borne en ligne). */
export const LARGE_GROUP_MIN_PLAYERS = 10

/** Un jeu jouable à deux : en ligne (minimum de la table) OU en local (minimum de la page du jeu). */
function playableByTwo(game: GameMeta): boolean {
  const online = game.minPlayers !== undefined && game.minPlayers <= 2
  const local = game.localMinPlayers !== undefined && game.localMinPlayers <= 2
  return online || local
}

/**
 * Le critère de chaque collection, sur un jeu VISIBLE (les masqués sont
 * écartés avant, voir `gamesInCollection`).
 */
const CRITERIA: Record<CollectionSlug, (game: GameMeta) => boolean> = {
  'a-2-joueurs': playableByTwo,
  // Le mode Soft n'existe que côté serveur : seuls les jeux en ligne le
  // proposent (les jeux de dés locaux gardent leurs gorgées).
  'sans-alcool': (game) => Boolean(game.softModeReady),
  // Les bots complètent une table EN LIGNE : un jeu local n'en a pas.
  'seul-avec-des-bots': (game) => Boolean(game.botsFillable) && Boolean(game.onlineReady),
  'en-grand-groupe': (game) => game.maxPlayers !== undefined && game.maxPlayers >= LARGE_GROUP_MIN_PLAYERS,
}

export function isCollectionSlug(value: string): value is CollectionSlug {
  return (COLLECTION_SLUGS as readonly string[]).includes(value)
}

/**
 * Les jeux d'une collection, dans l'ordre du registre — le même que le hub,
 * pour que le joueur retrouve ses repères d'une page à l'autre. Jamais un jeu
 * masqué : il n'a de page ni au hub ni au sitemap.
 */
export function gamesInCollection(slug: CollectionSlug, games: readonly GameMeta[] = GAMES): GameMeta[] {
  const matches = CRITERIA[slug]
  return games.filter((game) => !game.hidden && matches(game))
}
