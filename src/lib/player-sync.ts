import {
  type Player,
  type PlayerStats,
  type PlayerPreferences,
  getStoredPlayers,
  savePlayers,
  dedupePlayersById,
} from '@/lib/players'
import { getSafeStorage } from '@/lib/storage'

function playerKey(player: Player): string {
  return player.name.trim().toLowerCase()
}

function mergeGameStats(
  a: PlayerStats['gameStats'],
  b: PlayerStats['gameStats'],
): NonNullable<PlayerStats['gameStats']> {
  const gameIds = new Set([
    ...Object.keys(a ?? {}),
    ...Object.keys(b ?? {}),
  ])
  const merged: NonNullable<PlayerStats['gameStats']> = {}
  for (const gameId of gameIds) {
    const ga = a?.[gameId]
    const gb = b?.[gameId]
    merged[gameId] = {
      gamesPlayed: Math.max(ga?.gamesPlayed ?? 0, gb?.gamesPlayed ?? 0),
      wins: Math.max(ga?.wins ?? 0, gb?.wins ?? 0),
      totalDrinks: Math.max(ga?.totalDrinks ?? 0, gb?.totalDrinks ?? 0),
    }
  }
  return merged
}

function mergeStats(a: PlayerStats, b: PlayerStats): PlayerStats {
  const lastA = a.lastPlayed ?? 0
  const lastB = b.lastPlayed ?? 0
  return {
    gamesPlayed: Math.max(a.gamesPlayed, b.gamesPlayed),
    wins: Math.max(a.wins, b.wins),
    totalDrinks: Math.max(a.totalDrinks, b.totalDrinks),
    favoriteGame: lastA >= lastB ? a.favoriteGame ?? b.favoriteGame : b.favoriteGame ?? a.favoriteGame,
    lastPlayed: Math.max(lastA, lastB) || undefined,
    gameStats: mergeGameStats(a.gameStats, b.gameStats),
  }
}

function pickPreferences(a: Player, b: Player): PlayerPreferences {
  const lastA = a.stats.lastPlayed ?? a.createdAt
  const lastB = b.stats.lastPlayed ?? b.createdAt
  const newer = lastA >= lastB ? a : b
  const older = lastA >= lastB ? b : a
  return { ...older.preferences, ...newer.preferences }
}

function mergePlayerPair(cloudPlayer: Player, localPlayer: Player): Player {
  return {
    id: cloudPlayer.id,
    name: cloudPlayer.name,
    createdAt: Math.min(cloudPlayer.createdAt, localPlayer.createdAt),
    stats: mergeStats(cloudPlayer.stats, localPlayer.stats),
    preferences: pickPreferences(cloudPlayer, localPlayer),
  }
}

/** Fusionne deux listes (même nom = même joueur, stats cumulées au max). */
export function mergePlayerLists(local: Player[], cloud: Player[]): Player[] {
  const byKey = new Map<string, Player>()

  for (const player of cloud) {
    byKey.set(playerKey(player), player)
  }

  for (const player of local) {
    const key = playerKey(player)
    const existing = byKey.get(key)
    byKey.set(key, existing ? mergePlayerPair(existing, player) : player)
  }

  return dedupePlayersById([...byKey.values()].sort((a, b) => a.createdAt - b.createdAt))
}

/**
 * Délai au-delà duquel le nuage est tenu pour injoignable. Hors ligne franc,
 * le navigateur échoue tout de suite ; un Wi-Fi sans internet, lui, laisse la
 * requête PENDRE — et usePlayers attend la synchro avant d'afficher la liste :
 * la page des joueurs restait sur son écran de chargement, sans fin.
 */
export const CLOUD_TIMEOUT_MS = 8000

function fetchCloud(init: RequestInit): Promise<Response> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), CLOUD_TIMEOUT_MS) : null
  return fetch('/api/players/local', { credentials: 'include', ...init, signal: controller?.signal }).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

export async function fetchCloudPlayers(): Promise<Player[]> {
  const res = await fetchCloud({})
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.players) ? data.players : []
}

// ─── « Le nuage est en retard sur ce poste » ─────────────────────────────────
// Hors ligne (jeux locaux servis par le service worker), les gestes sur la
// table — joueur supprimé, renommé, couleur changée — ne partent pas. Sans
// marque, la resynchro du retour du réseau FUSIONNAIT la copie du nuage,
// périmée : le joueur supprimé ressuscitait, le renommé revenait en doublon.
// Tant que la marque est là, la prochaine resynchro POUSSE la liste locale
// telle quelle. Risque assumé : un changement fait sur un AUTRE appareil
// pendant la coupure est écrasé — rare pour une table qui se joue sur un seul
// téléphone. En localStorage, car la coupure peut durer plus que l'onglet.
//
// La marque porte l'identifiant du COMPTE concerné : un geste fait sans
// session (app ouverte hors ligne, /api/auth/me injoignable) est dû au
// dernier compte vu sur l'appareil ; un autre compte qui se connecte ensuite
// n'en hérite pas (il fusionne, comme avant).

/** Identifiant du compte dont le nuage attend la liste locale. */
export const CLOUD_BEHIND_KEY = 'game_players_cloud_behind'
/** Dernier compte dont ce poste a joint le nuage. */
export const LAST_CLOUD_ACCOUNT_KEY = 'game_players_last_account'

let currentAccount: string | null = null

function readStorage(key: string): string | null {
  const storage = getSafeStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  const storage = getSafeStorage()
  if (!storage) return
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    // quota ou navigation privée : la marque vit en mémoire seulement
  }
}

/** Le compte au nom duquel usePlayers parle au nuage (null : visiteur). */
export function setCloudAccount(userId: string | null | undefined): void {
  currentAccount = userId ?? null
  if (userId) writeStorage(LAST_CLOUD_ACCOUNT_KEY, userId)
}

/**
 * Note qu'un geste local n'a pas atteint le nuage — pour le compte courant,
 * ou à défaut le dernier vu sur l'appareil. Un vrai visiteur (jamais de
 * compte ici) n'a pas de nuage : rien à noter.
 */
export function markCloudBehind(): void {
  const account = currentAccount ?? readStorage(LAST_CLOUD_ACCOUNT_KEY)
  if (account) writeStorage(CLOUD_BEHIND_KEY, account)
}

function clearCloudBehind(): void {
  writeStorage(CLOUD_BEHIND_KEY, null)
}

export function isCloudBehindFor(userId: string): boolean {
  return readStorage(CLOUD_BEHIND_KEY) === userId
}

// Poussées parties mais pas encore enregistrées : tant qu'il en reste, le
// nuage est en retard sur ce poste. Partagé entre toutes les instances de
// usePlayers (page, barre des joueurs…), qui écrivent le même stockage.
const pushesInFlight = new Set<Promise<boolean>>()

export function pushPlayersToCloud(players: Player[]): Promise<boolean> {
  const push = (async () => {
    let res: Response
    try {
      res = await fetchCloud({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players }),
      })
    } catch (error) {
      markCloudBehind()
      throw error
    }
    // La marque ne sert qu'aux pannes RÉSEAU (branche catch) : une réponse
    // HTTP prouve que le nuage est joignable. Un refus définitif (4xx :
    // modération d'un pseudo, session perdue) la lève — repousser la même
    // liste échouerait pareil, et la resynchro doit retrouver la fusion
    // habituelle ; une panne passagère (5xx) la laisse, pour réessayer.
    if (res.ok || (res.status >= 400 && res.status < 500)) clearCloudBehind()
    return res.ok
  })()
  pushesInFlight.add(push)
  const settle = () => { pushesInFlight.delete(push) }
  push.then(settle, settle)
  return push
}

const PLAYERS_PUSH_DEBOUNCE_MS = 800

// Une seule poussée différée pour tout l'onglet : chaque instance de
// usePlayers programmait la sienne, autant de PUT identiques par changement.
let scheduledPushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Pousse la liste du stockage dans 800 ms ; un nouvel appel repousse
 * l'échéance. La liste est lue au départ, pas à la programmation : c'est
 * toujours la plus récente qui part.
 */
export function schedulePlayersPush(): void {
  if (scheduledPushTimer) clearTimeout(scheduledPushTimer)
  scheduledPushTimer = setTimeout(() => {
    scheduledPushTimer = null
    pushPlayersToCloud(getStoredPlayers()).catch(() => {})
  }, PLAYERS_PUSH_DEBOUNCE_MS)
}

/** Fait partir tout de suite la poussée programmée, puis attend toutes celles en route. */
export async function flushPlayersPush(): Promise<void> {
  if (scheduledPushTimer) {
    clearTimeout(scheduledPushTimer)
    scheduledPushTimer = null
    pushPlayersToCloud(getStoredPlayers()).catch(() => {})
  }
  await Promise.allSettled([...pushesInFlight])
}

/**
 * Écarte de la réponse du nuage les joueurs ajoutés, modifiés, renommés ou
 * supprimés sur ce poste PENDANT l'aller-retour : la réponse a été lue avant
 * ces gestes, sa version les annulerait (fusion par nom, sans date de
 * modification). Les joueurs inconnus d'ici au départ restent : ce sont les
 * ajouts d'un autre appareil.
 */
function withoutPlayersChangedMeanwhile(cloud: Player[], before: Player[], local: Player[]): Player[] {
  const beforeByKey = new Map(before.map((player) => [playerKey(player), JSON.stringify(player)]))
  const localByKey = new Map(local.map((player) => [playerKey(player), JSON.stringify(player)]))
  return cloud.filter((player) => {
    const key = playerKey(player)
    const atStart = beforeByKey.get(key)
    return atStart === undefined || localByKey.get(key) === atStart
  })
}

/**
 * Aligne le localStorage avec le cloud : fusion, upload si besoin, retourne la liste finale.
 *
 * Appelée à chaque retour sur la page (focus, visibilitychange, pageshow) : un
 * geste de l'utilisateur la suit souvent de quelques millisecondes — dans le
 * panneau navigateur de l'app de bureau, chaque clic redonne le focus. Elle ne
 * doit donc jamais écraser un changement local :
 *  - fait AVANT elle et pas encore arrivé au nuage → poussé et attendu d'abord ;
 *  - fait PENDANT ses requêtes → liste relue à la réponse, la version du nuage
 *    des joueurs touchés entre-temps est écartée, et la liste rendue est celle
 *    du stockage à la toute fin (pas un instantané d'avant l'envoi) ;
 *  - fait HORS LIGNE (marque « nuage en retard » pour `userId`) → la liste
 *    locale est poussée telle quelle, sans fusion.
 *
 * Navigateur hors ligne : rejette tout de suite (usePlayers retombe sur la
 * liste locale) — pas la peine d'attendre un délai pour l'apprendre.
 */
export async function syncLocalWithCloud(userId?: string): Promise<Player[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('offline')
  const before = getStoredPlayers()
  await flushPlayersPush()
  if (userId && isCloudBehindFor(userId)) {
    const pushed = await pushPlayersToCloud(getStoredPlayers())
    if (pushed) return getStoredPlayers()
    // Refus définitif (4xx) : la marque est levée, on repart sur la fusion
    // habituelle ; panne passagère (5xx) : elle reste, prochaine resynchro.
    if (isCloudBehindFor(userId)) throw new Error('cloud_behind')
  }
  // Marque d'un autre compte : sans objet pour celui-ci, qui fusionne comme avant.
  if (userId) clearCloudBehind()
  const cloud = await fetchCloudPlayers()
  const local = getStoredPlayers()
  const merged = mergePlayerLists(local, withoutPlayersChangedMeanwhile(cloud, before, local))

  savePlayers(merged)

  const cloudJson = JSON.stringify(cloud)
  const mergedJson = JSON.stringify(merged)
  if (mergedJson !== cloudJson) {
    await pushPlayersToCloud(merged)
  }

  return getStoredPlayers()
}
