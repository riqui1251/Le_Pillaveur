import type { MatchOutcome } from '@/lib/online/match-results'
import type { ChiffrePiegeOnlineState } from './online-state'

/**
 * Issue d'une partie en ligne : le « score » du Chiffre Piégé est un compte de
 * gorgées ou de points de PÉNALITÉ, pas un classement — participation
 * seulement, comme Purple et le 1220 (id dans PARTICIPATION_ONLY_GAMES).
 */
export function chiffrePiegeMatchOutcomes(state: unknown): MatchOutcome[] {
  const s = state as ChiffrePiegeOnlineState
  return s.players.map((p) => ({ playerId: p.id, isBot: p.isBot, won: false }))
}
