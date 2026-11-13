import type { MatchOutcome } from '@/lib/online/match-results'
import { ranking } from './engine'
import type { VdnOnlineState } from './server-adapter'

/**
 * Issue d'une partie en ligne pour le classement et l'XP : rang
 * « compétition » sur le score (+3, +6, −1), victoire au rang 1 avec un score
 * positif (forme du Grand Bluff : le score peut être négatif).
 */
export function vueDeNezMatchOutcomes(state: unknown): MatchOutcome[] {
  const s = state as VdnOnlineState
  const rows = new Map(ranking(s.game).map((row) => [row.playerId, row]))
  return s.players.map((p) => {
    const row = rows.get(p.id)
    return {
      playerId: p.id,
      isBot: p.isBot,
      won: Boolean(row && row.score > 0 && row.rank === 1),
      rank: row?.rank,
    }
  })
}
