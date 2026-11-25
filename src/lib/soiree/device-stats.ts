import type { Player } from '@/lib/players'
import type { SoireeHistoryEntry } from './summary'

// « Quel jeu fait le plus boire ? », partie « Chez vous » — calculée SUR
// L'APPAREIL à partir de ce que les jeux locaux enregistrent déjà pour chaque
// joueur (Player.stats.gameStats : parties et gorgées par jeu) et de
// l'historique des soirées. Rien de ce module ne part au serveur : le
// classement de tout le site vient de compteurs anonymes à part
// (src/lib/game-drinks-server.ts, GET /api/stats/game-drinks).

export type GameDrinkStat = {
  gameId: string
  /** Gorgées enregistrées pour ce jeu, tous joueurs confondus. */
  drinks: number
  /** Participations : une partie jouée par un joueur (somme des gamesPlayed). */
  plays: number
  /** Gorgées moyennes par joueur et par partie : ce qui classe les jeux. */
  perPlay: number
  /** Le joueur qui y a le plus bu, et combien. */
  topPlayerId: string | null
  topDrinks: number
}

/**
 * Les jeux de `gameIds`, du plus arrosé au moins arrosé, dès `minPlays`
 * participations — une seule partie ne dit rien d'un jeu.
 */
export function gameDrinkStats(players: readonly Player[], gameIds: readonly string[], minPlays = 2): GameDrinkStat[] {
  const wanted = new Set(gameIds)
  const byGame = new Map<string, GameDrinkStat>()
  for (const player of players) {
    for (const [gameId, stats] of Object.entries(player.stats?.gameStats ?? {})) {
      if (!wanted.has(gameId)) continue
      const drinks = Math.max(0, stats.totalDrinks ?? 0)
      const plays = Math.max(0, stats.gamesPlayed ?? 0)
      const row = byGame.get(gameId) ?? { gameId, drinks: 0, plays: 0, perPlay: 0, topPlayerId: null, topDrinks: 0 }
      row.drinks += drinks
      row.plays += plays
      if (drinks > row.topDrinks) {
        row.topDrinks = drinks
        row.topPlayerId = player.id
      }
      byGame.set(gameId, row)
    }
  }
  return [...byGame.values()]
    .filter((row) => row.plays >= minPlays)
    .map((row) => ({ ...row, perPlay: row.drinks / row.plays }))
    .sort((a, b) => b.perPlay - a.perPlay || b.drinks - a.drinks || a.gameId.localeCompare(b.gameId))
}

export type DrinkerStat = { playerId: string; drinks: number; plays: number }

/** Les joueurs de l'appareil, du plus gros buveur au plus sobre (tous jeux locaux). */
export function topDrinkers(players: readonly Player[], limit = 5): DrinkerStat[] {
  return players
    .map((p) => ({ playerId: p.id, drinks: Math.max(0, p.stats?.totalDrinks ?? 0), plays: Math.max(0, p.stats?.gamesPlayed ?? 0) }))
    .filter((row) => row.drinks > 0)
    .sort((a, b) => b.drinks - a.drinks || a.plays - b.plays)
    .slice(0, limit)
}

export type SoireeHistoryStats = {
  count: number
  /** Soirées avec alcool seulement : sans alcool, personne n'a bu. */
  drinkingCount: number
  totalDrinks: number
  averageDrinks: number
  record: SoireeHistoryEntry | null
  /** Le jeu le plus souvent au programme des soirées jouées. */
  favoriteGameId: string | null
  favoriteGameRounds: number
}

export function historyStats(history: readonly SoireeHistoryEntry[]): SoireeHistoryStats {
  const drinking = history.filter((entry) => !entry.soft)
  const drinksOf = (entry: SoireeHistoryEntry) => entry.rounds.reduce((sum, r) => sum + r.drinks, 0)
  const totalDrinks = drinking.reduce((sum, entry) => sum + drinksOf(entry), 0)
  const record = drinking.reduce<SoireeHistoryEntry | null>(
    (best, entry) => (drinksOf(entry) > (best ? drinksOf(best) : 0) ? entry : best),
    null
  )
  const rounds = new Map<string, number>()
  for (const entry of history) for (const r of entry.rounds) rounds.set(r.gameId, (rounds.get(r.gameId) ?? 0) + 1)
  let favoriteGameId: string | null = null
  let favoriteGameRounds = 0
  for (const [gameId, n] of rounds) {
    if (n > favoriteGameRounds) {
      favoriteGameId = gameId
      favoriteGameRounds = n
    }
  }
  return {
    count: history.length,
    drinkingCount: drinking.length,
    totalDrinks,
    averageDrinks: drinking.length ? totalDrinks / drinking.length : 0,
    record,
    favoriteGameId,
    favoriteGameRounds,
  }
}

/** Gorgées d'une soirée de l'historique. */
export function historyDrinks(entry: SoireeHistoryEntry): number {
  return entry.rounds.reduce((sum, r) => sum + r.drinks, 0)
}
