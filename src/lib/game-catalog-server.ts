import { prisma } from '@/lib/prisma'
import { errorTrace } from '@/lib/error-trace'
import { parisDayOffset } from '@/lib/paris-time'
import {
  STAFF_TOGGLEABLE_GAME_IDS,
  parseHiddenGameIds,
  rankPopularGames,
  type GameCatalogState,
  type GamePlayCounts,
} from '@/lib/game-catalog'

/**
 * Côté serveur du catalogue réglé par l'équipe (logique pure : game-catalog.ts).
 *
 * - Les jeux cachés vivent dans SiteSetting (clé `games.hiddenIds`, texte JSON) :
 *   la table existe déjà, aucune migration.
 * - La popularité compte les parties des 30 derniers jours : lancements en
 *   ligne (OnlineGameSession) et débuts de partie en local (LocalGameDaily).
 *
 * Trois caches mémoire sur globalThis (un module peut être recopié dans
 * plusieurs bundles, comme pour src/lib/landing-stats-server.ts), chacun avec
 * sa requête en vol partagée. Tous sont RÉSILIENTS : une erreur de lecture
 * (table absente d'une base locale pas migrée, base indisponible) ne remonte
 * jamais — dernière valeur connue, ou valeur vide, gardée jusqu'à la fin du
 * délai pour ne pas retenter à chaque requête. Seule l'ÉCRITURE
 * (`setGameHidden`) laisse remonter ses erreurs.
 */

export const HIDDEN_GAMES_SETTING_KEY = 'games.hiddenIds'
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
  counts: CacheEntry<GamePlayCounts>
  state: CacheEntry<GameCatalogState>
}

const newEntry = <T>(value: T): CacheEntry<T> => ({ value, freshUntil: 0, inFlight: null, generation: 0 })

const globalForCache = globalThis as unknown as { __lpGameCatalogCaches?: CatalogCaches }

const caches: CatalogCaches = globalForCache.__lpGameCatalogCaches ?? {
  hidden: newEntry<string[]>([]),
  counts: newEntry<GamePlayCounts>({}),
  state: newEntry<GameCatalogState>({ hiddenIds: [], popular: { local: [], online: [] } }),
}
if (!globalForCache.__lpGameCatalogCaches) globalForCache.__lpGameCatalogCaches = caches

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
  resetEntry(caches.counts, forget ? {} : undefined)
  resetEntry(caches.state, forget ? { hiddenIds: [], popular: { local: [], online: [] } } : undefined)
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
export async function setGameHidden(
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
    const [hiddenIds, counts] = await Promise.all([getStaffHiddenGameIds(), getGamePlayCounts30d()])
    return {
      hiddenIds,
      popular: {
        local: rankPopularGames(counts, hiddenIds, 'local'),
        online: rankPopularGames(counts, hiddenIds, 'online'),
      },
    }
  })
}
