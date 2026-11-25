/**
 * « Quel jeu fait le plus boire ? » sur tout le site — la forme de la réponse
 * de GET /api/stats/game-drinks, partagée par la route et la page. Module PUR
 * (le serveur et ses compteurs : game-drinks-server.ts).
 */

export type SiteDrinkRow = {
  gameId: string
  drinks: number
  plays: number
  /** Gorgées moyennes par joueur et par partie : ce qui classe les jeux. */
  perPlay: number
  localPlays: number
  onlinePlays: number
}

export type SiteDrinkRanking = {
  /** Fenêtre du classement, en jours de Paris. */
  days: number
  /** Participations minimales pour qu'un jeu soit classé. */
  minPlays: number
  games: SiteDrinkRow[]
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0

function parseRow(raw: unknown): SiteDrinkRow | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const { gameId, drinks, plays, perPlay, localPlays, onlinePlays } = row
  if (typeof gameId !== 'string' || !isCount(drinks) || !isCount(plays) || plays === 0) return null
  if (typeof perPlay !== 'number' || !Number.isFinite(perPlay) || perPlay < 0) return null
  if (!isCount(localPlays) || !isCount(onlinePlays)) return null
  return { gameId, drinks, plays, perPlay, localPlays, onlinePlays }
}

/** Réponse relue côté navigateur : null si illisible, lignes mal formées écartées. */
export function parseSiteDrinkRanking(body: unknown): SiteDrinkRanking | null {
  if (!body || typeof body !== 'object') return null
  const { days, minPlays, games } = body as Record<string, unknown>
  if (!isCount(days) || !isCount(minPlays) || !Array.isArray(games)) return null
  return { days, minPlays, games: games.map(parseRow).filter((row): row is SiteDrinkRow => row !== null) }
}
