import { GAMES, hasContentIn, type GameMeta } from '@/lib/games'
import { isGameListed } from '@/lib/game-catalog'

/**
 * Collections de jeux — les pages /jeux/<collection> (« jeux à boire »,
 * « à 2 joueurs », « sans alcool », « seul avec des bots », « en grand groupe »).
 *
 * Chaque collection est un FILTRE sur le registre (src/lib/games.ts), jamais
 * une liste tenue à la main : un jeu qui gagne des bots ou un mode Soft (ou
 * une variante locale sans alcool) entre dans la collection tout seul, et un
 * jeu masqué en sort de même. Les textes (titre, description, intro) vivent dans le catalogue i18n sous
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
  'jeux-a-boire',
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
 * écartés avant, voir `gamesInCollection`), dans la langue de la page.
 */
const CRITERIA: Record<CollectionSlug, (game: GameMeta, locale: string | undefined) => boolean> = {
  // Le niveau par défaut du registre, pas le réglage de l'équipe : une page
  // indexée ne change pas de liste au gré de la Supervision. Seuil 3 hors
  // ♦ : au niveau 2, les jeux d'ambiance (quiz, Dilemmes, Front Collé…) où
  // la gorgée n'est qu'une pénalité seraient entrés.
  'jeux-a-boire': (game) => game.suit === 'diamond' || game.drinkLevel >= 3,
  'a-2-joueurs': playableByTwo,
  // Mode Soft en ligne, ou jeu local dont l'ambiance Sans alcool réécrit
  // toute la partie (les jeux de dés locaux, eux, gardent leurs gorgées).
  'sans-alcool': (game) => Boolean(game.softModeReady) || Boolean(game.localSoftReady),
  // Les bots complètent une table EN LIGNE : un jeu local n'en a pas. Et la
  // table ne s'ouvre que dans une langue où le jeu a ses cartes (création
  // refusée sinon, content_lang_unavailable) — même filtre que le raccourci
  // « Jouer seul avec les bots » du hub.
  'seul-avec-des-bots': (game, locale) =>
    Boolean(game.botsFillable) && Boolean(game.onlineReady) && hasContentIn(game, locale),
  'en-grand-groupe': (game) => game.maxPlayers !== undefined && game.maxPlayers >= LARGE_GROUP_MIN_PLAYERS,
}

export function isCollectionSlug(value: string): value is CollectionSlug {
  return (COLLECTION_SLUGS as readonly string[]).includes(value)
}

/**
 * Les jeux d'une collection, dans l'ordre du registre — le même que le hub,
 * pour que le joueur retrouve ses repères d'une page à l'autre. Jamais un jeu
 * masqué : il n'a de page ni au hub ni au sitemap. `locale` : la langue de la
 * page (absente = fr, comme hasContentIn). `hiddenIds` : les jeux cachés par
 * l'équipe depuis la Supervision (getStaffHiddenGameIds), écartés comme ceux
 * que le code masque.
 */
export function gamesInCollection(
  slug: CollectionSlug,
  games: readonly GameMeta[] = GAMES,
  locale?: string,
  hiddenIds: readonly string[] = []
): GameMeta[] {
  const matches = CRITERIA[slug]
  return games.filter((game) => isGameListed(game, hiddenIds) && matches(game, locale))
}
