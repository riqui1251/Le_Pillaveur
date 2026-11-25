import { GAMES, type GameDifficulty, type GameDrinkLevel, type GameMeta } from '@/lib/games'
import { SOIREE_CANDIDATE_IDS, SOIREE_GAME_IDS } from '@/lib/soiree/catalog'
import { SOIREE_VIBES, defaultVibesForLevel, type SoireeVibe } from '@/lib/soiree/vibes'

/**
 * CATALOGUE DES JEUX TEL QUE L'ÉQUIPE LE RÈGLE — logique pure, partagée par
 * le serveur et le navigateur (aucun accès base ici) :
 * - les jeux cachés depuis la Supervision, EN PLUS des `hidden` du code ;
 * - la difficulté réglée depuis la Supervision, qui remplace celle du code ;
 * - le niveau « fait boire » (barème 1 à 3), réglé de la même façon ;
 * - les catégories créées par l'équipe, des rubriques de jeux du hub ;
 * - les ambiances du Mode Soirée où chaque jeu peut être tiré ;
 * - les jeux mis en avant, choisis par la popularité des 30 derniers jours ;
 * - les jeux ajoutés au Mode Soirée ou sortis de sa liste par défaut ;
 * - les jeux mis à la une à la main, en tête du hub et de la vitrine.
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
  /**
   * Ambiances du Mode Soirée cochées par l'équipe (id → ambiances, dans l'ordre
   * de SOIREE_VIBES), les SEULS jeux concernés : sans entrée, les ambiances
   * découlent du niveau « fait boire » (gameVibes). Une liste vide est permise.
   */
  vibes: Record<string, SoireeVibe[]>
  /**
   * Écarts de l'équipe à la liste par défaut du Mode Soirée (id → ajouté ou
   * sorti), les SEULS candidats concernés : jamais une valeur égale au défaut.
   */
  soiree: Record<string, boolean>
  /** Jeux mis à la une par l'équipe, dans l'ordre de mise à la une, au plus FEATURED_LIMIT. */
  featured: string[]
  /** Jeux classés par mode, du plus joué au moins joué, au plus POPULAR_RANKED_LIMIT : un affichage coupe à POPULAR_LIMIT APRÈS avoir écarté les jeux à la une. */
  popular: Record<GameCatalogMode, string[]>
}

export const EMPTY_GAME_CATALOG: GameCatalogState = {
  hiddenIds: [],
  difficulty: {},
  drinkLevel: {},
  categories: [],
  vibes: {},
  soiree: {},
  featured: [],
  popular: { local: [], online: [] },
}

/** Combien de jeux la rangée « les plus joués » met en avant, par mode. */
export const POPULAR_LIMIT = 4

/** Combien de jeux l'équipe peut mettre à la une : au-delà, la rangée n'est plus une sélection. */
export const FEATURED_LIMIT = 8

/**
 * Combien d'ids le serveur classe par mode : les jeux à la une sont retirés de
 * « Les plus joués » APRÈS le classement et ne sont pas remplacés, il en faut
 * donc FEATURED_LIMIT de réserve pour que la rangée garde POPULAR_LIMIT jeux.
 * Chaque affichage coupe à POPULAR_LIMIT une fois les jeux à la une exclus.
 */
export const POPULAR_RANKED_LIMIT = POPULAR_LIMIT + FEATURED_LIMIT

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

/** Les candidats du Mode Soirée que le code n'a pas retirés, dans l'ordre du catalogue : ceux que l'équipe peut ajouter ou sortir. */
const SOIREE_TOGGLEABLE_GAME_IDS: readonly string[] = SOIREE_CANDIDATE_IDS.filter((id) => STAFF_TOGGLEABLE_GAME_IDS.includes(id))

/** Les jeux dont l'équipe règle les ambiances : tout candidat du Mode Soirée, même hors de la liste par défaut (on peut les régler avant de les ajouter). */
export const VIBE_GAME_IDS: readonly string[] = SOIREE_TOGGLEABLE_GAME_IDS

const CODE_SOIREE_GAME_IDS: ReadonlySet<string> = new Set(SOIREE_GAME_IDS)

function parseJsonOrValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/**
 * Écarts à la liste du Mode Soirée stockés (texte JSON de SiteSetting, ou objet
 * déjà lu) : candidats basculables seulement, booléens, et jamais une valeur
 * égale au défaut du code (revenir au défaut = ne rien stocker), dans l'ordre
 * du catalogue. Illisible → {} : un réglage abîmé ne doit pas changer la soirée.
 */
export function parseSoireeOverrides(raw: unknown): Record<string, boolean> {
  const value = parseJsonOrValue(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const stored = value as Record<string, unknown>
  const overrides: Record<string, boolean> = {}
  for (const id of SOIREE_TOGGLEABLE_GAME_IDS) {
    const on = stored[id]
    if (typeof on === 'boolean' && on !== CODE_SOIREE_GAME_IDS.has(id)) overrides[id] = on
  }
  return overrides
}

/**
 * Jeux à la une stockés (texte JSON de SiteSetting, ou tableau déjà lu) : ids
 * basculables seulement, sans doublon, dans l'ordre de mise à la une, au plus
 * FEATURED_LIMIT. Illisible → [].
 */
export function parseFeaturedGameIds(raw: unknown): string[] {
  const value = parseJsonOrValue(raw)
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const id of value) {
    if (ids.length >= FEATURED_LIMIT) break
    if (typeof id !== 'string' || seen.has(id) || !STAFF_TOGGLEABLE_GAME_IDS.includes(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

/**
 * Ambiances stockées (texte JSON de SiteSetting, ou objet déjà lu) : ids du
 * Mode Soirée basculables seulement, ambiances connues sans doublon dans
 * l'ordre de SOIREE_VIBES, liste vide gardée (« aucune ambiance » est un choix).
 * Une entrée au mauvais format est écartée seule. Illisible → {}.
 */
export function parseVibeOverrides(raw: unknown): Record<string, SoireeVibe[]> {
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
  const overrides: Record<string, SoireeVibe[]> = {}
  for (const id of VIBE_GAME_IDS) {
    const list = stored[id]
    if (!Array.isArray(list)) continue
    overrides[id] = SOIREE_VIBES.filter((vibe) => list.includes(vibe))
  }
  return overrides
}

/** Ambiances effectives d'un jeu : le réglage de l'équipe, sinon celles de son niveau « fait boire » effectif. */
export function gameVibes(
  gameId: string,
  vibeOverrides: Readonly<Record<string, readonly SoireeVibe[]>>,
  drinkLevelOverrides: Readonly<Record<string, GameDrinkLevel>>
): SoireeVibe[] {
  const override = vibeOverrides[gameId]
  return override ? [...override] : defaultVibesForLevel(gameDrinkLevel(gameId, drinkLevelOverrides))
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
 * Le serveur en classe POPULAR_RANKED_LIMIT (voir cette constante) ; les rangées
 * en gardent POPULAR_LIMIT après exclusion des jeux à la une.
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
 * `drinkLevel`, `categories`, `vibes`, `soiree` et `featured` sont facultatifs
 * (réponse d'un serveur plus ancien, copie gardée sur l'appareil avant ces
 * champs) : absents, ils valent {}, [], {}, {} et [].
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
    vibes: parseVibeOverrides(raw.vibes),
    soiree: parseSoireeOverrides(raw.soiree),
    featured: parseFeaturedGameIds(raw.featured),
    popular: { local: ids(byMode.local), online: ids(byMode.online) },
  }
}
