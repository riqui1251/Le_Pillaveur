import { soireeMetric, soireeStandings, soireeTotals, type Soiree, type SoireeMetric, type SoireeStanding } from './state'

export type SoireeAwardKind = 'pilier' | 'survivant' | 'roi' | 'champion' | 'lanterne' | 'gros-coup' | 'arrose'

export type SoireeAward = {
  kind: SoireeAwardKind
  /** Absent pour « le jeu le plus arrosé », qui récompense un jeu. */
  playerId?: string
  gameId?: string
  value: number
}

export type SoireeMoment =
  | { kind: 'round-drinks'; gameId: string; total: number; topPlayerId: string; topValue: number }
  | { kind: 'round-win'; gameId: string; playerId: string }
  | { kind: 'streak'; playerId: string; count: number }
  | { kind: 'sober'; playerId: string }

/** Une manche jouée, vue de l'addition. */
export type SoireeGameTotal = {
  index: number
  gameId: string
  drinks: number
  wins: number
  topPlayerId: string | null
  topDrinks: number
}

export type SoireeSummary = {
  metric: SoireeMetric
  standings: SoireeStanding[]
  roundsPlayed: number
  totalDrinks: number
  totalWins: number
  /** Avec alcool : le plus chargé ; sans : la lanterne rouge. Null en cas d'égalité ou de soirée vide. */
  payerId: string | null
  games: SoireeGameTotal[]
  awards: SoireeAward[]
  moments: SoireeMoment[]
}

/** L'unique joueur qui porte le max (ou le min) — null si plusieurs le partagent. */
function uniqueExtreme(rows: readonly SoireeStanding[], key: SoireeMetric, want: 'max' | 'min'): SoireeStanding | null {
  if (rows.length === 0) return null
  const values = rows.map((r) => r[key])
  const target = want === 'max' ? Math.max(...values) : Math.min(...values)
  const holders = rows.filter((r) => r[key] === target)
  return holders.length === 1 ? holders[0] : null
}

export function soireeGameTotals(soiree: Soiree): SoireeGameTotal[] {
  return soiree.rounds.flatMap((round, index) => {
    if (round.status !== 'done') return []
    let drinks = 0
    let wins = 0
    let topPlayerId: string | null = null
    let topDrinks = 0
    for (const [playerId, tally] of Object.entries(round.results)) {
      drinks += tally.drinks
      wins += tally.wins
      if (tally.drinks > topDrinks) {
        topDrinks = tally.drinks
        topPlayerId = playerId
      }
    }
    return [{ index, gameId: round.gameId, drinks, wins, topPlayerId, topDrinks }]
  })
}

function longestWinStreaks(soiree: Soiree): Map<string, number> {
  const best = new Map<string, number>()
  const run = new Map<string, number>()
  for (const round of soiree.rounds) {
    if (round.status !== 'done') continue
    for (const id of soiree.playerIds) {
      const won = (round.results[id]?.wins ?? 0) > 0
      const now = won ? (run.get(id) ?? 0) + 1 : 0
      run.set(id, now)
      best.set(id, Math.max(best.get(id) ?? 0, now))
    }
  }
  return best
}

export function soireeSummary(soiree: Soiree): SoireeSummary {
  const metric = soireeMetric(soiree)
  const standings = soireeStandings(soiree)
  const games = soireeGameTotals(soiree)
  const totals = soireeTotals(soiree)
  const totalDrinks = games.reduce((sum, g) => sum + g.drinks, 0)
  const totalWins = games.reduce((sum, g) => sum + g.wins, 0)
  const played = games.length > 0

  const awards: SoireeAward[] = []
  const push = (kind: SoireeAwardKind, row: SoireeStanding | null, key: SoireeMetric, min = 1) => {
    if (row && row[key] >= min) awards.push({ kind, playerId: row.playerId, value: row[key] })
  }
  if (played && !soiree.soft) {
    push('pilier', uniqueExtreme(standings, 'drinks', 'max'), 'drinks')
    push('survivant', standings.length > 1 ? uniqueExtreme(standings, 'drinks', 'min') : null, 'drinks', 0)
    push('roi', uniqueExtreme(standings, 'wins', 'max'), 'wins')
  }
  if (played && soiree.soft) {
    push('champion', uniqueExtreme(standings, 'wins', 'max'), 'wins')
    push('lanterne', standings.length > 1 ? uniqueExtreme(standings, 'wins', 'min') : null, 'wins', 0)
  }
  if (!soiree.soft) {
    let coup: { playerId: string; gameId: string; value: number } | null = null
    for (const round of soiree.rounds) {
      if (round.status !== 'done') continue
      for (const [playerId, tally] of Object.entries(round.results)) {
        if (tally.drinks >= 3 && (!coup || tally.drinks > coup.value)) coup = { playerId, gameId: round.gameId, value: tally.drinks }
      }
    }
    if (coup) awards.push({ kind: 'gros-coup', ...coup })
    const wettest = games.reduce<SoireeGameTotal | null>((best, g) => (g.drinks > (best?.drinks ?? 0) ? g : best), null)
    if (wettest) awards.push({ kind: 'arrose', gameId: wettest.gameId, value: wettest.drinks })
  }

  const weighted: { moment: SoireeMoment; weight: number }[] = []
  for (const game of games) {
    if (!soiree.soft && game.drinks > 0 && game.topPlayerId) {
      weighted.push({
        moment: { kind: 'round-drinks', gameId: game.gameId, total: game.drinks, topPlayerId: game.topPlayerId, topValue: game.topDrinks },
        weight: game.drinks,
      })
    }
    if (soiree.soft) {
      const round = soiree.rounds[game.index]
      const winners = Object.entries(round.results).filter(([, t]) => t.wins > 0).map(([id]) => id)
      if (winners.length === 1) weighted.push({ moment: { kind: 'round-win', gameId: game.gameId, playerId: winners[0] }, weight: 2 })
    }
  }
  for (const [playerId, count] of longestWinStreaks(soiree)) {
    if (count >= 2) weighted.push({ moment: { kind: 'streak', playerId, count }, weight: count * 3 })
  }
  if (!soiree.soft && games.length >= 2) {
    for (const id of soiree.playerIds) {
      if ((totals[id]?.drinks ?? 0) === 0 && (totals[id]?.played ?? 0) > 0) weighted.push({ moment: { kind: 'sober', playerId: id }, weight: 5 })
    }
  }
  const moments = weighted.sort((a, b) => b.weight - a.weight).slice(0, 4).map((w) => w.moment)

  let payerId: string | null = null
  if (played) {
    const payer = soiree.soft
      ? standings.length > 1 ? uniqueExtreme(standings, 'wins', 'min') : null
      : uniqueExtreme(standings, 'drinks', 'max')
    if (payer && (soiree.soft || payer.drinks > 0)) payerId = payer.playerId
  }

  return { metric, standings, roundsPlayed: games.length, totalDrinks, totalWins, payerId, games, awards, moments }
}

/** Ce qu'une soirée laisse dans l'historique de l'appareil (src/lib/soiree/storage.ts). */
export type SoireeHistoryEntry = {
  id: string
  date: number
  bandeId: string | null
  bandeName: string
  soft: boolean
  players: { id: string; name: string }[]
  rounds: { gameId: string; drinks: number; wins: number }[]
  totals: { playerId: string; drinks: number; wins: number }[]
  payerId: string | null
}

export function toHistoryEntry(soiree: Soiree, summary: SoireeSummary, now: number): SoireeHistoryEntry {
  return {
    id: soiree.id,
    date: soiree.finishedAt ?? now,
    bandeId: soiree.bandeId,
    bandeName: soiree.bandeName,
    soft: soiree.soft,
    players: soiree.playerIds.map((id) => ({ id, name: soiree.playerNames[id] ?? '?' })),
    rounds: summary.games.map((g) => ({ gameId: g.gameId, drinks: g.drinks, wins: g.wins })),
    totals: summary.standings.map((s) => ({ playerId: s.playerId, drinks: s.drinks, wins: s.wins })),
    payerId: summary.payerId,
  }
}
