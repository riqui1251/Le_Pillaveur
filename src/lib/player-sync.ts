import {
  type Player,
  type PlayerStats,
  type PlayerPreferences,
  getStoredPlayers,
  savePlayers,
  dedupePlayersById,
} from '@/lib/players'

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

export async function fetchCloudPlayers(): Promise<Player[]> {
  const res = await fetch('/api/players/local', { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.players) ? data.players : []
}

// Poussées parties mais pas encore enregistrées : tant qu'il en reste, le
// nuage est en retard sur ce poste. Partagé entre toutes les instances de
// usePlayers (page, barre des joueurs…), qui écrivent le même stockage.
const pushesInFlight = new Set<Promise<boolean>>()

export function pushPlayersToCloud(players: Player[]): Promise<boolean> {
  const push = (async () => {
    const res = await fetch('/api/players/local', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ players }),
    })
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
 *    du stockage à la toute fin (pas un instantané d'avant l'envoi).
 */
export async function syncLocalWithCloud(): Promise<Player[]> {
  const before = getStoredPlayers()
  await flushPlayersPush()
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
