import type { MatchOutcome } from '@/lib/online/match-results'
import type { PcOnlineState } from './online-shared'

/**
 * Issue d'une partie en ligne : participation seule (id à mettre dans PARTICIPATION_ONLY_GAMES).
 * « Le moins d'explosions gagne » désigne souvent la moitié de la table ex æquo : compter ces
 * victoires gonflerait les taux de victoire du classement.
 */
export function patateChaudeMatchOutcomes(state: unknown): MatchOutcome[] {
  const players = (state as Partial<PcOnlineState> | null)?.players
  if (!Array.isArray(players)) return []
  return players.map((p) => ({ playerId: p.id, isBot: p.isBot, won: false }))
}
