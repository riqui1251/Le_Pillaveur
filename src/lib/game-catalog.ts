import { GAMES, type GameMeta } from '@/lib/games'

/**
 * CATALOGUE DES JEUX TEL QUE L'ÉQUIPE LE RÈGLE — logique pure, partagée par
 * le serveur et le navigateur (aucun accès base ici) :
 * - les jeux cachés depuis la Supervision, EN PLUS des `hidden` du code ;
 * - les jeux mis en avant, choisis par la popularité des 30 derniers jours.
 *
 * Le serveur stocke la liste cachée dans SiteSetting (src/lib/game-catalog-server.ts)
 * et sert l'état complet par GET /api/games/catalog ; le hub, la Soirée et le
 * lobby le lisent par useGameCatalog.
 */

export type GameCatalogMode = 'local' | 'online'

export type GameCatalogState = {
  /** Jeux cachés par l'équipe (en plus des `hidden` du code), dans l'ordre du catalogue. */
  hiddenIds: string[]
  /** Jeux mis en avant par mode, du plus joué au moins joué. */
  popular: Record<GameCatalogMode, string[]>
}

export const EMPTY_GAME_CATALOG: GameCatalogState = { hiddenIds: [], popular: { local: [], online: [] } }

/** Combien de jeux la rangée « les plus joués » met en avant, par mode. */
export const POPULAR_LIMIT = 4

/** Les jeux que l'équipe peut cacher ou remettre : ceux que le code n'a pas déjà retirés. */
export const STAFF_TOGGLEABLE_GAME_IDS: readonly string[] = GAMES.filter((game) => !game.hidden).map((game) => game.id)

const KNOWN_GAME_IDS: ReadonlySet<string> = new Set(GAMES.map((game) => game.id))

/**
 * Liste cachée stockée (texte JSON de SiteSetting, ou tableau déjà lu) : ids
 * cachables seulement, sans doublon, dans l'ordre du catalogue. Illisible →
 * liste vide : un réglage abîmé ne doit jamais retirer tout le catalogue.
 */
export function parseHiddenGameIds(raw: unknown): string[] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const wanted = new Set(value.filter((id): id is string => typeof id === 'string'))
  return STAFF_TOGGLEABLE_GAME_IDS.filter((id) => wanted.has(id))
}

/** Le jeu est-il proposé aux joueurs : ni retiré du code, ni caché par l'équipe ? */
export function isGameListed(game: Pick<GameMeta, 'id' | 'hidden'>, hiddenIds: readonly string[]): boolean {
  return !game.hidden && !hiddenIds.includes(game.id)
}

/** Jouable dans ce mode : en ligne = a un écran en ligne ; local = pas réservé au multi-écrans. */
export function isPlayableIn(game: Pick<GameMeta, 'onlineReady' | 'onlineOnly'>, mode: GameCatalogMode): boolean {
  return mode === 'online' ? Boolean(game.onlineReady) : !game.onlineOnly
}

/** Parties des 30 derniers jours par jeu : lancements en ligne, débuts de partie en local. */
export type GamePlayCounts = Record<string, { online: number; local: number }>

export function totalPlays(counts: GamePlayCounts, gameId: string): number {
  const row = counts[gameId]
  return row ? Math.max(0, row.online) + Math.max(0, row.local) : 0
}

/**
 * Les jeux mis en avant dans un mode : listés, jouables dans ce mode, avec au
 * moins une partie, du plus joué au moins joué (égalité : ordre du catalogue).
 * Jamais complétée : un jeu sans partie ne passe pas pour populaire, la rangée
 * peut donc être plus courte que `limit`, voire vide (le hub et la landing
 * retombent alors sur les jeux phares du code, présentés comme tels).
 */
export function rankPopularGames(
  counts: GamePlayCounts,
  hiddenIds: readonly string[],
  mode: GameCatalogMode,
  limit: number = POPULAR_LIMIT
): string[] {
  const eligible = GAMES.filter((game) => isGameListed(game, hiddenIds) && isPlayableIn(game, mode))
  return eligible
    .map((game, order) => ({ id: game.id, plays: totalPlays(counts, game.id), order }))
    .filter((row) => row.plays > 0)
    .sort((a, b) => b.plays - a.plays || a.order - b.order)
    .slice(0, limit)
    .map((row) => row.id)
}

/**
 * Les jeux phares du code (`featured`) listés et jouables dans ce mode, dans
 * l'ordre du catalogue : le repli de la vitrine quand aucun jeu n'est classé.
 * Présentés comme « incontournables », jamais comme « populaires ».
 */
export function featuredGameIds(hiddenIds: readonly string[], mode: GameCatalogMode): string[] {
  return GAMES.filter((game) => game.featured && isGameListed(game, hiddenIds) && isPlayableIn(game, mode)).map(
    (game) => game.id
  )
}

/** Réponse de GET /api/games/catalog relue côté navigateur : null si illisible. */
export function parseGameCatalogState(body: unknown): GameCatalogState | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  const popular = raw.popular
  if (!Array.isArray(raw.hiddenIds) || !popular || typeof popular !== 'object' || Array.isArray(popular)) return null
  const ids = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && KNOWN_GAME_IDS.has(id)) : []
  const byMode = popular as Record<string, unknown>
  return {
    hiddenIds: parseHiddenGameIds(raw.hiddenIds),
    popular: { local: ids(byMode.local), online: ids(byMode.online) },
  }
}
