import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { errorTrace } from '@/lib/error-trace'
import { parisDayOffset } from '@/lib/paris-time'
import type { GameDifficulty, GameDrinkLevel } from '@/lib/games'
import {
  EMPTY_GAME_CATALOG,
  GAME_CATEGORY_LIMITS,
  STAFF_TOGGLEABLE_GAME_IDS,
  isGameDifficulty,
  isGameDrinkLevel,
  normalizeCategoryGameIds,
  normalizeCategoryNames,
  parseDifficultyOverrides,
  parseDrinkLevelOverrides,
  parseGameCategories,
  parseHiddenGameIds,
  rankPopularGames,
  type GameCatalogState,
  type GameCategory,
  type GameCategoryNames,
  type GamePlayCounts,
} from '@/lib/game-catalog'

/**
 * Côté serveur du catalogue réglé par l'équipe (logique pure : game-catalog.ts).
 *
 * - Les jeux cachés vivent dans SiteSetting (clé `games.hiddenIds`, texte JSON) :
 *   la table existe déjà, aucune migration.
 * - La difficulté réglée vit aussi dans SiteSetting (clé `games.difficulty`,
 *   objet JSON id → niveau, seulement les jeux qui diffèrent du code).
 * - Le niveau « fait boire » (clé `games.drinkLevel`, même forme que la
 *   difficulté) et les catégories de jeux (clé `games.categories`, tableau JSON
 *   ordonné) vivent aussi dans SiteSetting.
 * - La popularité compte les parties des 30 derniers jours : lancements en
 *   ligne (OnlineGameSession) et débuts de partie en local (LocalGameDaily).
 *
 * Six caches mémoire sur globalThis (un module peut être recopié dans
 * plusieurs bundles, comme pour src/lib/landing-stats-server.ts), chacun avec
 * sa requête en vol partagée. Tous sont RÉSILIENTS : une erreur de lecture
 * (table absente d'une base locale pas migrée, base indisponible) ne remonte
 * jamais — dernière valeur connue, ou valeur vide, gardée jusqu'à la fin du
 * délai pour ne pas retenter à chaque requête. Seule l'ÉCRITURE
 * (`setGameHidden`, `setGameDifficulty`, `setGameDrinkLevel`, les catégories) laisse remonter ses erreurs.
 */

export const HIDDEN_GAMES_SETTING_KEY = 'games.hiddenIds'
export const DIFFICULTY_SETTING_KEY = 'games.difficulty'
export const DRINK_LEVEL_SETTING_KEY = 'games.drinkLevel'
export const GAME_CATEGORIES_SETTING_KEY = 'games.categories'
export const HIDDEN_IDS_TTL_MS = 30_000
export const PLAY_COUNTS_TTL_MS = 10 * 60_000
export const CATALOG_STATE_TTL_MS = 60_000
export const PLAY_WINDOW_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

type CacheEntry<T> = {
  value: T
  /** Instant (ms) à partir duquel `value` ne vaut plus ; 0 = rien de retenu. */
  freshUntil: number
  inFlight: Promise<T> | null
  /** Change à chaque invalidation : une lecture partie avant ne réécrit pas le cache. */
  generation: number
}

type CatalogCaches = {
  hidden: CacheEntry<string[]>
  difficulty: CacheEntry<Record<string, GameDifficulty>>
  drinkLevel: CacheEntry<Record<string, GameDrinkLevel>>
  categories: CacheEntry<GameCategory[]>
  counts: CacheEntry<GamePlayCounts>
  state: CacheEntry<GameCatalogState>
}

const newEntry = <T>(value: T): CacheEntry<T> => ({ value, freshUntil: 0, inFlight: null, generation: 0 })

const globalForCache = globalThis as unknown as {
  __lpGameCatalogCaches?: CatalogCaches
  __lpGameCatalogWriteQueue?: Promise<unknown>
}

/**
 * Toutes les écritures du catalogue (lire la valeur stockée, la modifier, la
 * réécrire) passent l'une après l'autre : sans cela, deux écritures qui se
 * chevauchent partent de la même lecture et la seconde efface la première. Un
 * seul processus Node sert le site, une file en mémoire suffit. Une erreur
 * remonte à son appelant mais ne bloque pas la suite.
 */
function serializeWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = (globalForCache.__lpGameCatalogWriteQueue ?? Promise.resolve()).then(task)
  globalForCache.__lpGameCatalogWriteQueue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

const emptyState = (): GameCatalogState => ({
  ...EMPTY_GAME_CATALOG,
  difficulty: {},
  drinkLevel: {},
  categories: [],
  popular: { local: [], online: [] },
})

const caches: CatalogCaches = globalForCache.__lpGameCatalogCaches ?? {
  hidden: newEntry<string[]>([]),
  difficulty: newEntry<Record<string, GameDifficulty>>({}),
  drinkLevel: newEntry<Record<string, GameDrinkLevel>>({}),
  categories: newEntry<GameCategory[]>([]),
  counts: newEntry<GamePlayCounts>({}),
  state: newEntry<GameCatalogState>(emptyState()),
}
if (!globalForCache.__lpGameCatalogCaches) globalForCache.__lpGameCatalogCaches = caches
// Le rechargement à chaud garde l'objet d'avant ce champ : sans lui, la lecture planterait en dev.
caches.difficulty ??= newEntry<Record<string, GameDifficulty>>({})
caches.drinkLevel ??= newEntry<Record<string, GameDrinkLevel>>({})
caches.categories ??= newEntry<GameCategory[]>([])
// Même objet : un état gardé d'avant ces champs ferait planter gameDifficulty ou le hub, on le relit.
if (!caches.state.value.difficulty || !caches.state.value.drinkLevel || !caches.state.value.categories) {
  caches.state.value = emptyState()
  caches.state.freshUntil = 0
}

/**
 * Lecture partagée : le cache tant qu'il est frais, sinon UNE lecture même
 * sous des appels simultanés. Un échec garde la dernière valeur connue et
 * repousse la prochaine tentative d'un délai entier.
 */
function readCached<T>(
  entry: CacheEntry<T>,
  ttlMs: number,
  label: string,
  load: () => Promise<T>
): Promise<T> {
  if (Date.now() < entry.freshUntil) return Promise.resolve(entry.value)
  if (entry.inFlight) return entry.inFlight

  const generation = entry.generation
  const pending: Promise<T> = Promise.resolve()
    .then(load)
    .then(
      (value) => {
        if (entry.generation === generation) {
          entry.value = value
          entry.freshUntil = Date.now() + ttlMs
        }
        return value
      },
      (error) => {
        console.error(`game catalog: ${label} illisible:`, errorTrace(error))
        if (entry.generation === generation) entry.freshUntil = Date.now() + ttlMs
        return entry.value
      }
    )
    .finally(() => {
      if (entry.inFlight === pending) entry.inFlight = null
    })
  entry.inFlight = pending
  return pending
}

function resetEntry<T>(entry: CacheEntry<T>, empty: T | undefined): void {
  if (empty !== undefined) entry.value = empty
  entry.freshUntil = 0
  entry.inFlight = null
  entry.generation += 1
}

/**
 * Force la relecture au prochain appel (après une écriture : route PATCH). La
 * dernière valeur connue reste le repli si la relecture échoue ; `forget`
 * repart de caches vides (tests).
 */
export function invalidateGameCatalogCaches(options: { forget?: boolean } = {}): void {
  const forget = options.forget === true
  resetEntry(caches.hidden, forget ? [] : undefined)
  resetEntry(caches.difficulty, forget ? {} : undefined)
  resetEntry(caches.drinkLevel, forget ? {} : undefined)
  resetEntry(caches.categories, forget ? [] : undefined)
  resetEntry(caches.counts, forget ? {} : undefined)
  resetEntry(caches.state, forget ? emptyState() : undefined)
}

async function readHiddenSetting(): Promise<string[]> {
  const row = await prisma.siteSetting.findUnique({ where: { key: HIDDEN_GAMES_SETTING_KEY } })
  return parseHiddenGameIds(row?.value)
}

/** Les jeux cachés par l'équipe (en plus du code), dans l'ordre du catalogue. Ne lève jamais. */
export function getStaffHiddenGameIds(): Promise<string[]> {
  return readCached(caches.hidden, HIDDEN_IDS_TTL_MS, 'jeux cachés', readHiddenSetting)
}

/** Ce jeu est-il caché par l'équipe ? Ne lève jamais (base illisible = non caché). */
export async function isGameHiddenByStaff(gameId: string): Promise<boolean> {
  return (await getStaffHiddenGameIds()).includes(gameId)
}

/** Refus de cacher un jeu que l'équipe n'a pas le droit de basculer (inconnu, ou déjà retiré du code). */
export class GameNotToggleableError extends Error {
  constructor(readonly gameId: string) {
    super('game_not_toggleable')
    this.name = 'GameNotToggleableError'
  }
}

/**
 * Cache ou remet un jeu. Part de la valeur STOCKÉE (jamais du cache : deux
 * clics rapprochés ne doivent pas s'écraser sur une lecture périmée).
 * `changed` = le réglage a vraiment bougé (sert au journal de l'équipe).
 * Les erreurs de base remontent : l'équipe doit savoir que ça n'a pas pris.
 */
export function setGameHidden(
  gameId: string,
  hidden: boolean
): Promise<{ hiddenIds: string[]; changed: boolean }> {
  return serializeWrite(() => applyGameHidden(gameId, hidden))
}

async function applyGameHidden(
  gameId: string,
  hidden: boolean
): Promise<{ hiddenIds: string[]; changed: boolean }> {
  if (!STAFF_TOGGLEABLE_GAME_IDS.includes(gameId)) throw new GameNotToggleableError(gameId)

  const previous = await readHiddenSetting()
  const wanted = new Set(previous)
  if (hidden) wanted.add(gameId)
  else wanted.delete(gameId)
  const hiddenIds = STAFF_TOGGLEABLE_GAME_IDS.filter((id) => wanted.has(id))
  const changed = hiddenIds.length !== previous.length || hiddenIds.some((id, i) => id !== previous[i])

  if (changed) {
    const value = JSON.stringify(hiddenIds)
    await prisma.siteSetting.upsert({
      where: { key: HIDDEN_GAMES_SETTING_KEY },
      create: { key: HIDDEN_GAMES_SETTING_KEY, value },
      update: { value },
    })
  }
  invalidateGameCatalogCaches()
  // La valeur qu'on vient d'écrire vaut mieux que l'ancienne si la relecture échoue.
  caches.hidden.value = hiddenIds
  return { hiddenIds, changed }
}

async function readDifficultySetting(): Promise<Record<string, GameDifficulty>> {
  const row = await prisma.siteSetting.findUnique({ where: { key: DIFFICULTY_SETTING_KEY } })
  return parseDifficultyOverrides(row?.value)
}

/** Les difficultés réglées par l'équipe (id → niveau, seulement celles qui diffèrent du code). Ne lève jamais. */
export function getStaffGameDifficulty(): Promise<Record<string, GameDifficulty>> {
  return readCached(caches.difficulty, HIDDEN_IDS_TTL_MS, 'difficultés', readDifficultySetting)
}

/**
 * Règle la difficulté d'un jeu. Part de la valeur STOCKÉE (comme setGameHidden) ;
 * revenir au niveau du code SUPPRIME l'entrée. `changed` sert au journal.
 * Les erreurs de base remontent.
 */
export function setGameDifficulty(
  gameId: string,
  level: GameDifficulty
): Promise<{ difficulty: Record<string, GameDifficulty>; changed: boolean }> {
  return serializeWrite(() => applyGameDifficulty(gameId, level))
}

async function applyGameDifficulty(
  gameId: string,
  level: GameDifficulty
): Promise<{ difficulty: Record<string, GameDifficulty>; changed: boolean }> {
  if (!STAFF_TOGGLEABLE_GAME_IDS.includes(gameId) || !isGameDifficulty(level)) {
    throw new GameNotToggleableError(gameId)
  }

  const previous = await readDifficultySetting()
  // parseDifficultyOverrides écarte l'entrée égale au code et garde l'ordre du catalogue.
  const difficulty = parseDifficultyOverrides({ ...previous, [gameId]: level })
  const changed = JSON.stringify(difficulty) !== JSON.stringify(previous)

  if (changed) {
    const value = JSON.stringify(difficulty)
    await prisma.siteSetting.upsert({
      where: { key: DIFFICULTY_SETTING_KEY },
      create: { key: DIFFICULTY_SETTING_KEY, value },
      update: { value },
    })
  }
  invalidateGameCatalogCaches()
  // La valeur qu'on vient d'écrire vaut mieux que l'ancienne si la relecture échoue.
  caches.difficulty.value = difficulty
  return { difficulty, changed }
}

async function readDrinkLevelSetting(): Promise<Record<string, GameDrinkLevel>> {
  const row = await prisma.siteSetting.findUnique({ where: { key: DRINK_LEVEL_SETTING_KEY } })
  return parseDrinkLevelOverrides(row?.value)
}

/** Les niveaux « fait boire » réglés par l'équipe (id → niveau, seulement ceux qui diffèrent du code). Ne lève jamais. */
export function getStaffGameDrinkLevel(): Promise<Record<string, GameDrinkLevel>> {
  return readCached(caches.drinkLevel, HIDDEN_IDS_TTL_MS, 'niveaux « fait boire »', readDrinkLevelSetting)
}

/**
 * Règle le niveau « fait boire » d'un jeu : même logique que setGameDifficulty
 * (valeur STOCKÉE, retour au niveau du code = entrée supprimée, `changed` pour
 * le journal, erreurs de base remontées).
 */
export function setGameDrinkLevel(
  gameId: string,
  level: GameDrinkLevel
): Promise<{ drinkLevel: Record<string, GameDrinkLevel>; changed: boolean }> {
  return serializeWrite(() => applyGameDrinkLevel(gameId, level))
}

async function applyGameDrinkLevel(
  gameId: string,
  level: GameDrinkLevel
): Promise<{ drinkLevel: Record<string, GameDrinkLevel>; changed: boolean }> {
  if (!STAFF_TOGGLEABLE_GAME_IDS.includes(gameId) || !isGameDrinkLevel(level)) {
    throw new GameNotToggleableError(gameId)
  }

  const previous = await readDrinkLevelSetting()
  const drinkLevel = parseDrinkLevelOverrides({ ...previous, [gameId]: level })
  const changed = JSON.stringify(drinkLevel) !== JSON.stringify(previous)

  if (changed) {
    const value = JSON.stringify(drinkLevel)
    await prisma.siteSetting.upsert({
      where: { key: DRINK_LEVEL_SETTING_KEY },
      create: { key: DRINK_LEVEL_SETTING_KEY, value },
      update: { value },
    })
  }
  invalidateGameCatalogCaches()
  // La valeur qu'on vient d'écrire vaut mieux que l'ancienne si la relecture échoue.
  caches.drinkLevel.value = drinkLevel
  return { drinkLevel, changed }
}

async function readCategoriesSetting(): Promise<GameCategory[]> {
  const row = await prisma.siteSetting.findUnique({ where: { key: GAME_CATEGORIES_SETTING_KEY } })
  return parseGameCategories(row?.value)
}

/** Les catégories de jeux créées par l'équipe, dans leur ordre. Ne lève jamais. */
export function getGameCategories(): Promise<GameCategory[]> {
  return readCached(caches.categories, HIDDEN_IDS_TTL_MS, 'catégories', readCategoriesSetting)
}

/** Catégorie introuvable (supprimée entre-temps, ou id inventé). */
export class GameCategoryNotFoundError extends Error {
  constructor(readonly categoryId: string) {
    super('game_category_not_found')
    this.name = 'GameCategoryNotFoundError'
  }
}

/** Nom illisible (français vide ou trop long), jeu inconnu ou retiré du code, modification vide. */
export class GameCategoryInvalidError extends Error {
  constructor(readonly reason: 'names' | 'gameIds' | 'patch') {
    super('game_category_invalid')
    this.name = 'GameCategoryInvalidError'
  }
}

/** Déjà GAME_CATEGORY_LIMITS.maxCategories catégories. */
export class GameCategoryLimitError extends Error {
  constructor() {
    super('game_category_limit')
    this.name = 'GameCategoryLimitError'
  }
}

async function writeCategories(categories: GameCategory[]): Promise<void> {
  const value = JSON.stringify(categories)
  await prisma.siteSetting.upsert({
    where: { key: GAME_CATEGORIES_SETTING_KEY },
    create: { key: GAME_CATEGORIES_SETTING_KEY, value },
    update: { value },
  })
  invalidateGameCatalogCaches()
  // La valeur qu'on vient d'écrire vaut mieux que l'ancienne si la relecture échoue.
  caches.categories.value = categories
}

/** Id court, [a-z0-9-], jamais déjà pris : tiré au hasard, donc indépendant du nom (renommer ne le change pas). */
function newCategoryId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = `cat-${randomBytes(4).toString('hex')}`
    if (!taken.has(id)) return id
  }
}

/** Crée une catégorie vide, en dernière position. Part de la valeur STOCKÉE, comme les autres écritures. */
export function createGameCategory(names: GameCategoryNames): Promise<GameCategory> {
  return serializeWrite(async () => {
    const cleaned = normalizeCategoryNames(names)
    if (!cleaned) throw new GameCategoryInvalidError('names')

    const categories = await readCategoriesSetting()
    if (categories.length >= GAME_CATEGORY_LIMITS.maxCategories) throw new GameCategoryLimitError()

    const category: GameCategory = {
      id: newCategoryId(new Set(categories.map((c) => c.id))),
      names: cleaned,
      gameIds: [],
    }
    await writeCategories([...categories, category])
    return category
  })
}

/** Réécrit la catégorie `id` (lue dans la valeur stockée) seulement si `build` en change le contenu. */
async function rewriteCategory(
  id: string,
  build: (current: GameCategory) => GameCategory
): Promise<{ category: GameCategory; changed: boolean }> {
  const categories = await readCategoriesSetting()
  const index = categories.findIndex((c) => c.id === id)
  if (index === -1) throw new GameCategoryNotFoundError(id)

  const current = categories[index]
  const updated = build(current)
  const changed = JSON.stringify(updated) !== JSON.stringify(current)
  if (changed) await writeCategories(categories.map((c, i) => (i === index ? updated : c)))
  return { category: updated, changed }
}

/**
 * Renomme une catégorie et/ou change ses jeux (liste COMPLÈTE, qui remplace
 * l'ancienne). `changed` = le contenu a vraiment bougé (sert au journal).
 */
export function updateGameCategory(
  id: string,
  patch: { names?: GameCategoryNames; gameIds?: string[] }
): Promise<{ category: GameCategory; changed: boolean }> {
  return serializeWrite(async () => {
    if (patch.names === undefined && patch.gameIds === undefined) throw new GameCategoryInvalidError('patch')
    const names = patch.names === undefined ? undefined : normalizeCategoryNames(patch.names)
    if (names === null) throw new GameCategoryInvalidError('names')
    if (patch.gameIds !== undefined) {
      const valid =
        Array.isArray(patch.gameIds) && patch.gameIds.every((gameId) => STAFF_TOGGLEABLE_GAME_IDS.includes(gameId))
      if (!valid) throw new GameCategoryInvalidError('gameIds')
    }

    return rewriteCategory(id, (current) => ({
      id: current.id,
      names: names ?? current.names,
      gameIds: patch.gameIds === undefined ? current.gameIds : normalizeCategoryGameIds(patch.gameIds),
    }))
  })
}

/**
 * Ajoute ou retire UN jeu d'une catégorie, à partir de la valeur STOCKÉE : le
 * travail d'un autre équipier sur les autres jeux n'est jamais écrasé (au
 * contraire d'updateGameCategory, qui remplace la liste entière). `changed`
 * sert au journal.
 */
export function setGameInCategory(
  id: string,
  gameId: string,
  on: boolean
): Promise<{ category: GameCategory; changed: boolean }> {
  return serializeWrite(async () => {
    if (typeof gameId !== 'string' || !STAFF_TOGGLEABLE_GAME_IDS.includes(gameId) || typeof on !== 'boolean') {
      throw new GameCategoryInvalidError('gameIds')
    }
    return rewriteCategory(id, (current) => {
      const wanted = new Set(current.gameIds)
      if (on) wanted.add(gameId)
      else wanted.delete(gameId)
      return { ...current, gameIds: normalizeCategoryGameIds([...wanted]) }
    })
  })
}

/**
 * Monte ou descend une catégorie d'un cran ; au bord de la liste, rien ne bouge
 * (`changed` faux). Rend la liste complète.
 */
export function moveGameCategory(
  id: string,
  direction: 'up' | 'down'
): Promise<{ categories: GameCategory[]; changed: boolean }> {
  return serializeWrite(async () => {
    const categories = await readCategoriesSetting()
    const index = categories.findIndex((c) => c.id === id)
    if (index === -1) throw new GameCategoryNotFoundError(id)

    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= categories.length) return { categories, changed: false }

    const moved = [...categories]
    ;[moved[index], moved[target]] = [moved[target], moved[index]]
    await writeCategories(moved)
    return { categories: moved, changed: true }
  })
}

export function deleteGameCategory(id: string): Promise<void> {
  return serializeWrite(async () => {
    const categories = await readCategoriesSetting()
    if (!categories.some((c) => c.id === id)) throw new GameCategoryNotFoundError(id)
    await writeCategories(categories.filter((c) => c.id !== id))
  })
}

async function loadPlayCounts(now: Date): Promise<GamePlayCounts> {
  const since = new Date(now.getTime() - PLAY_WINDOW_DAYS * DAY_MS)
  const sinceDay = parisDayOffset(PLAY_WINDOW_DAYS, now)
  const [online, local] = await Promise.all([
    prisma.onlineGameSession.groupBy({
      by: ['gameId'],
      where: { startedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.localGameDaily.groupBy({
      by: ['gameId'],
      where: { day: { gte: sinceDay } },
      _sum: { starts: true },
    }),
  ])
  const counts: GamePlayCounts = {}
  const row = (gameId: string) => (counts[gameId] ??= { online: 0, local: 0 })
  for (const group of online) row(group.gameId).online += group._count._all
  for (const group of local) row(group.gameId).local += group._sum.starts ?? 0
  return counts
}

/**
 * Parties des 30 derniers jours par jeu : lancements en ligne (fenêtre
 * glissante de 30 × 24 h) + débuts de partie locaux (jours de Paris, depuis
 * celui d'il y a 30 jours). Cache de 10 minutes ; ne lève jamais.
 */
export function getGamePlayCounts30d(now: Date = new Date()): Promise<GamePlayCounts> {
  return readCached(caches.counts, PLAY_COUNTS_TTL_MS, 'parties sur 30 jours', () => loadPlayCounts(now))
}

/** L'état complet servi par GET /api/games/catalog. Cache de 60 s ; ne lève jamais. */
export function getGameCatalogState(): Promise<GameCatalogState> {
  return readCached(caches.state, CATALOG_STATE_TTL_MS, 'catalogue', async () => {
    const [hiddenIds, difficulty, drinkLevel, categories, counts] = await Promise.all([
      getStaffHiddenGameIds(),
      getStaffGameDifficulty(),
      getStaffGameDrinkLevel(),
      getGameCategories(),
      getGamePlayCounts30d(),
    ])
    return {
      hiddenIds,
      difficulty,
      drinkLevel,
      categories,
      popular: {
        local: rankPopularGames(counts, hiddenIds, 'local'),
        online: rankPopularGames(counts, hiddenIds, 'online'),
      },
    }
  })
}
