import { GAMES, type GameDifficulty, type GameDrinkLevel, type GameMeta } from '@/lib/games'

/**
 * CATALOGUE DES JEUX TEL QUE L'ÉQUIPE LE RÈGLE — logique pure, partagée par
 * le serveur et le navigateur (aucun accès base ici) :
 * - les jeux cachés depuis la Supervision, EN PLUS des `hidden` du code ;
 * - la difficulté réglée depuis la Supervision, qui remplace celle du code ;
 * - le niveau « fait boire » (barème 1 à 3), réglé de la même façon ;
 * - les catégories créées par l'équipe, des rubriques de jeux du hub ;
 * - les jeux mis en avant, choisis par la popularité des 30 derniers jours.
 *
 * Le serveur stocke la liste cachée dans SiteSetting (src/lib/game-catalog-server.ts)
 * et sert l'état complet par GET /api/games/catalog ; le hub, la Soirée et le
 * lobby le lisent par useGameCatalog.
 */

export type GameCatalogMode = 'local' | 'online'

/** Nom d'une catégorie par langue : le français est obligatoire, il sert de repli. */
export type GameCategoryNames = { fr: string; en?: string; es?: string; it?: string }

export type GameCategory = {
  /** Identifiant stable, généré côté serveur : renommer une catégorie ne le change pas. */
  id: string
  names: GameCategoryNames
  /** Jeux rangés dans la catégorie, dans l'ordre du catalogue. */
  gameIds: string[]
}

export const GAME_CATEGORY_LIMITS = { maxCategories: 24, maxNameLength: 40 }

export type GameCatalogState = {
  /** Jeux cachés par l'équipe (en plus des `hidden` du code), dans l'ordre du catalogue. */
  hiddenIds: string[]
  /** Les SEULS jeux dont l'équipe a changé la difficulté (id → niveau), jamais un niveau égal à celui du code. */
  difficulty: Record<string, GameDifficulty>
  /** Les SEULS jeux dont l'équipe a changé le niveau « fait boire » (id → niveau), jamais un niveau égal à celui du code. */
  drinkLevel: Record<string, GameDrinkLevel>
  /** Rubriques de jeux créées par l'équipe, dans l'ordre où le hub les propose. */
  categories: GameCategory[]
  /** Jeux mis en avant par mode, du plus joué au moins joué. */
  popular: Record<GameCatalogMode, string[]>
}

export const EMPTY_GAME_CATALOG: GameCatalogState = {
  hiddenIds: [],
  difficulty: {},
  drinkLevel: {},
  categories: [],
  popular: { local: [], online: [] },
}

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

const CODE_DIFFICULTY: ReadonlyMap<string, GameDifficulty> = new Map(GAMES.map((game) => [game.id, game.difficulty]))
const CODE_DRINK_LEVEL: ReadonlyMap<string, GameDrinkLevel> = new Map(GAMES.map((game) => [game.id, game.drinkLevel]))

export function isGameDifficulty(value: unknown): value is GameDifficulty {
  return value === 1 || value === 2 || value === 3
}

export function isGameDrinkLevel(value: unknown): value is GameDrinkLevel {
  return value === 1 || value === 2 || value === 3
}

/**
 * Réglages de niveau stockés (texte JSON de SiteSetting, ou objet déjà lu) :
 * ids basculables seulement, niveaux entiers 1 à 3, et jamais une valeur égale
 * à celle du code (revenir au défaut = ne rien stocker), dans l'ordre du
 * catalogue. Illisible → {} : un réglage abîmé ne doit pas fausser les badges.
 * Difficulté et « fait boire » partagent les mêmes règles, d'où ce seul parseur.
 */
function parseLevelOverrides(raw: unknown, codeLevels: ReadonlyMap<string, 1 | 2 | 3>): Record<string, 1 | 2 | 3> {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const stored = value as Record<string, unknown>
  const overrides: Record<string, 1 | 2 | 3> = {}
  for (const id of STAFF_TOGGLEABLE_GAME_IDS) {
    const level = stored[id]
    if (isGameDifficulty(level) && level !== codeLevels.get(id)) overrides[id] = level
  }
  return overrides
}

/** Difficultés réglées par l'équipe (voir parseLevelOverrides). */
export function parseDifficultyOverrides(raw: unknown): Record<string, GameDifficulty> {
  return parseLevelOverrides(raw, CODE_DIFFICULTY)
}

/** Niveaux « fait boire » réglés par l'équipe (voir parseLevelOverrides). */
export function parseDrinkLevelOverrides(raw: unknown): Record<string, GameDrinkLevel> {
  return parseLevelOverrides(raw, CODE_DRINK_LEVEL)
}

/** Difficulté effective d'un jeu : le réglage de l'équipe, sinon le code, sinon Moyen. */
export function gameDifficulty(gameId: string, overrides: Readonly<Record<string, GameDifficulty>>): GameDifficulty {
  return overrides[gameId] ?? CODE_DIFFICULTY.get(gameId) ?? 2
}

/** Niveau « fait boire » effectif d'un jeu : le réglage de l'équipe, sinon le code, sinon Moyen. */
export function gameDrinkLevel(gameId: string, overrides: Readonly<Record<string, GameDrinkLevel>>): GameDrinkLevel {
  return overrides[gameId] ?? CODE_DRINK_LEVEL.get(gameId) ?? 2
}

const CATEGORY_ID_PATTERN = /^[a-z0-9-]{1,40}$/
const OTHER_CATEGORY_LOCALES = ['en', 'es', 'it'] as const

export function isGameCategoryId(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY_ID_PATTERN.test(value)
}

/**
 * Caractères sans rendu : contrôles, formats (espace de largeur nulle, marques
 * et surcharges bidi, FEFF…) et le blanc braille U+2800, que \s ne couvre pas.
 */
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}\u2800]/gu
const VISIBLE_CHAR = /[\p{L}\p{N}\p{Extended_Pictographic}]/u

/**
 * Nom saisi → nom rangé : invisibles retirés, espaces de bord retirés, espaces
 * internes repliés (« Soirée   chaude » = « Soirée chaude »). null si, une fois
 * nettoyé, le nom n'a aucun caractère visible (lettre, chiffre ou pictogramme)
 * ou dépasse la limite.
 */
export function cleanCategoryName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw
    // Une tabulation ou un saut de ligne séparent des mots : ils deviennent une espace, pas un trou.
    .replace(INVISIBLE_CHARS, (char) => (/\s/.test(char) && char !== '\uFEFF' ? ' ' : ''))
    .replace(/\s+/g, ' ')
    .trim()
  if (name.length < 1 || name.length > GAME_CATEGORY_LIMITS.maxNameLength) return null
  return VISIBLE_CHAR.test(name) ? name : null
}

/**
 * Noms d'une catégorie, nettoyés. Le français est obligatoire (null sinon) ;
 * une autre langue vide ou trop longue est simplement omise, la catégorie
 * s'affiche alors en français dans cette langue (categoryName).
 */
export function normalizeCategoryNames(raw: unknown): GameCategoryNames | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const stored = raw as Record<string, unknown>
  const fr = cleanCategoryName(stored.fr)
  if (!fr) return null
  const names: GameCategoryNames = { fr }
  for (const locale of OTHER_CATEGORY_LOCALES) {
    const name = cleanCategoryName(stored[locale])
    if (name) names[locale] = name
  }
  return names
}

/** Jeux d'une catégorie : cachables seulement, sans doublon, dans l'ordre du catalogue. */
export function normalizeCategoryGameIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const wanted = new Set(raw.filter((id): id is string => typeof id === 'string'))
  return STAFF_TOGGLEABLE_GAME_IDS.filter((id) => wanted.has(id))
}

/**
 * Catégories stockées (texte JSON de SiteSetting, ou tableau déjà lu). Une
 * entrée sans id valide ou unique, ou sans nom français lisible, est écartée
 * seule ; les jeux inconnus ou retirés du code quittent leur catégorie ; au
 * plus GAME_CATEGORY_LIMITS.maxCategories, dans l'ordre stocké. Illisible →
 * [] : un réglage abîmé ne doit jamais casser le hub.
 */
export function parseGameCategories(raw: unknown): GameCategory[] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const categories: GameCategory[] = []
  for (const entry of value) {
    if (categories.length >= GAME_CATEGORY_LIMITS.maxCategories) break
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const stored = entry as Record<string, unknown>
    if (!isGameCategoryId(stored.id) || seen.has(stored.id)) continue
    const names = normalizeCategoryNames(stored.names)
    if (!names) continue
    seen.add(stored.id)
    categories.push({ id: stored.id, names, gameIds: normalizeCategoryGameIds(stored.gameIds) })
  }
  return categories
}

/** Nom d'une catégorie dans la langue demandée, sinon en français. */
export function categoryName(category: GameCategory, locale: string): string {
  const other = (OTHER_CATEGORY_LOCALES as readonly string[]).includes(locale)
    ? category.names[locale as (typeof OTHER_CATEGORY_LOCALES)[number]]
    : undefined
  return other || category.names.fr
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

/**
 * Réponse de GET /api/games/catalog relue côté navigateur : null si illisible.
 * `drinkLevel` et `categories` sont facultatifs (réponse d'un serveur plus
 * ancien, copie gardée sur l'appareil avant ces champs) : absents, ils valent
 * {} et [].
 */
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
    difficulty: parseDifficultyOverrides(raw.difficulty),
    drinkLevel: parseDrinkLevelOverrides(raw.drinkLevel),
    categories: parseGameCategories(raw.categories),
    popular: { local: ids(byMode.local), online: ids(byMode.online) },
  }
}
