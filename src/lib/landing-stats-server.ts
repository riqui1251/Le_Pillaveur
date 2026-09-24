import { prisma } from '@/lib/prisma'

/**
 * Compteur « parties lancées » de la vitrine — preuve sociale ANONYME.
 *
 * La source est le journal des parties en ligne (`OnlineGameSession`, une
 * ligne par lancement — voir src/lib/online/game-sessions.ts) : on ne compte
 * que des lignes, jamais qui a joué. Aucune donnée personnelle ne transite,
 * ni vers la page, ni vers le cache.
 *
 * Ce que la vitrine affiche (`pickLaunchesStat`) :
 * - les 7 derniers jours, s'ils atteignent LAUNCHES_WEEK_MIN — un chiffre
 *   vivant ;
 * - sinon le cumul du journal, s'il atteint LAUNCHES_TOTAL_MIN — arrondi à
 *   la dizaine inférieure et annoncé « plus de N » : le journal ne remonte
 *   qu'au 10 septembre 2026 (GAME_JOURNAL_SINCE), le vrai total du site est
 *   AU MOINS celui-là ;
 * - sinon rien : un « 3 parties cette semaine » desservirait la maison plus
 *   qu'un silence.
 *
 * Cache mémoire de 15 minutes sur globalThis (même parti pris que le client
 * Prisma et le cache du guichet : un module peut être recopié dans plusieurs
 * bundles). La vitrine est rendue à CHAQUE visite d'un inconnu (cookie de
 * session lu en amont) ; sans cache, chaque visite coûterait deux count().
 * Un échec de lecture est retenu aussi — dernière valeur connue, ou rien —
 * pour ne pas retenter à chaque visite pendant une panne de base.
 */

export const LAUNCHES_CACHE_TTL_MS = 15 * 60 * 1000
/** Fenêtre glissante du chiffre « vivant ». */
export const LAUNCHES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const LAUNCHES_WEEK_MIN = 50
export const LAUNCHES_TOTAL_MIN = 100
/** Le cumul s'annonce « plus de N » : N est arrondi à ce pas, vers le bas. */
export const LAUNCHES_TOTAL_STEP = 10

export type LaunchesCounts = { week: number; total: number }
export type LaunchesStat = { period: 'week' | 'total'; count: number }

/** Ce que la vitrine affiche, ou null pour se taire. Pur. */
export function pickLaunchesStat(counts: LaunchesCounts | null): LaunchesStat | null {
  if (!counts) return null
  if (counts.week >= LAUNCHES_WEEK_MIN) return { period: 'week', count: counts.week }
  if (counts.total >= LAUNCHES_TOTAL_MIN) {
    return { period: 'total', count: Math.floor(counts.total / LAUNCHES_TOTAL_STEP) * LAUNCHES_TOTAL_STEP }
  }
  return null
}

/** Le seul morceau du client Prisma que la lecture utilise — injectable en test. */
export type LaunchesClient = {
  onlineGameSession: {
    count: (args?: { where?: { startedAt?: { gte: Date } } }) => Promise<number>
  }
}

/** Deux count() sur le journal : fenêtre glissante, puis cumul. */
export async function countLaunches(client: LaunchesClient, now: Date = new Date()): Promise<LaunchesCounts> {
  const since = new Date(now.getTime() - LAUNCHES_WINDOW_MS)
  const [week, total] = await Promise.all([
    client.onlineGameSession.count({ where: { startedAt: { gte: since } } }),
    client.onlineGameSession.count(),
  ])
  return { week, total }
}

type LaunchesCacheState = {
  counts: LaunchesCounts | null
  /** Instant (ms) à partir duquel `counts` ne vaut plus ; 0 quand rien n'est retenu. */
  freshUntil: number
  /** Chargement en cours, partagé par les visites qui arrivent entre-temps. */
  inFlight: Promise<LaunchesCounts | null> | null
}

const globalForCache = globalThis as unknown as { __lpLandingLaunchesCache?: LaunchesCacheState }

const state: LaunchesCacheState = globalForCache.__lpLandingLaunchesCache ?? {
  counts: null,
  freshUntil: 0,
  inFlight: null,
}

if (!globalForCache.__lpLandingLaunchesCache) {
  globalForCache.__lpLandingLaunchesCache = state
}

/**
 * Les compteurs depuis le cache, ou via `load` — une seule fois par TTL, même
 * sous des visites simultanées. Un échec ne lève rien : il garde la dernière
 * valeur connue (ou null) pendant un TTL entier.
 */
export async function readLaunchesCached(load: () => Promise<LaunchesCounts>): Promise<LaunchesCounts | null> {
  if (Date.now() < state.freshUntil) return state.counts
  if (state.inFlight) return state.inFlight

  const pending = load()
    .then((counts) => {
      state.counts = counts
      return counts
    })
    .catch(() => state.counts)
    .then((counts) => {
      state.freshUntil = Date.now() + LAUNCHES_CACHE_TTL_MS
      return counts
    })
    .finally(() => {
      if (state.inFlight === pending) state.inFlight = null
    })
  state.inFlight = pending
  return pending
}

/** Repart d'un cache vide (tests). */
export function invalidateLaunchesCache(): void {
  state.counts = null
  state.freshUntil = 0
  state.inFlight = null
}

/** Ce que la vitrine appelle : les vrais compteurs, mis en cache, puis la règle d'affichage. */
export async function readLandingLaunchesStat(): Promise<LaunchesStat | null> {
  return pickLaunchesStat(await readLaunchesCached(() => countLaunches(prisma)))
}
