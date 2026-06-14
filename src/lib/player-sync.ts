import {
  type Player,
  type PlayerStats,
  type PlayerPreferences,
  getStoredPlayers,
  savePlayers,
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

  return [...byKey.values()].sort((a, b) => a.createdAt - b.createdAt)
}

export async function fetchCloudPlayers(): Promise<Player[]> {
  const res = await fetch('/api/players/local', { credentials: 'include' })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data.players) ? data.players : []
}

export async function pushPlayersToCloud(players: Player[]): Promise<boolean> {
  const res = await fetch('/api/players/local', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ players }),
  })
  return res.ok
}

/**
 * Aligne le localStorage avec le cloud : fusion, upload si besoin, retourne la liste finale.
 */
export async function syncLocalWithCloud(): Promise<Player[]> {
  const local = getStoredPlayers()
  const cloud = await fetchCloudPlayers()
  const merged = mergePlayerLists(local, cloud)

  savePlayers(merged)

  const cloudJson = JSON.stringify(cloud)
  const mergedJson = JSON.stringify(merged)
  if (mergedJson !== cloudJson) {
    await pushPlayersToCloud(merged)
  }

  return merged
}
