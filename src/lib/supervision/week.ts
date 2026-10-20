import type { ActiveAccountsStats } from '@/lib/active-accounts-server'
import { parisDayOffset } from '@/lib/paris-time'

/**
 * « Cette semaine » de la Salle — module PUR : les quatre chiffres de 7 jours
 * tirés du tableau des comptes actifs, et le premier jour réellement mesuré
 * quand la source est plus jeune que la fenêtre.
 */

/**
 * Comptes actifs et joueurs uniques viennent du journal des parties OU des
 * visites : la plus ancienne des deux sources ouvre leur couverture.
 */
export function accountsCoverageSince(coverage: ActiveAccountsStats['coverage']): string {
  const { journalSince, visitsSince } = coverage
  return visitsSince && visitsSince < journalSince ? visitsSince : journalSince
}

/**
 * Premier jour mesuré si la fenêtre de `days` jours de Paris (aujourd'hui
 * compris, lue à l'heure du calcul : la valeur est mise en cache) commence
 * AVANT la source ; null quand la fenêtre est entièrement couverte. Un
 * intitulé « 7 jours » promettrait sinon des jours qui n'existent pas.
 */
export function partialSince(days: number, computedAt: Date, since: string): string | null {
  return parisDayOffset(days - 1, computedAt) < since ? since : null
}

export type WeekFigures = {
  activeAccounts: number
  /** Dont comptes invités. */
  guests: number
  returning: number
  /** Parties en ligne lancées sur les 7 derniers jours de la série, aujourd'hui compris. */
  launches: number
  /** Premier jour mesuré des comptes (actifs, revenants) si la fenêtre le précède. */
  accountsSince: string | null
  /** Idem pour les parties, tirées du seul journal. */
  launchesSince: string | null
}

export function weekFigures(
  stats: Pick<ActiveAccountsStats, 'computedAt' | 'coverage' | 'accounts' | 'series'>
): WeekFigures {
  const computedAt = new Date(stats.computedAt)
  // La série couvre 14 jours de Paris jusqu'au jour du calcul : ses 7 derniers
  // points sont la même fenêtre que `accounts.active.d7`. Les jours d'avant le
  // journal y valent 0, ce que dit `launchesSince`.
  const launches = stats.series.slice(-7).reduce((sum, day) => sum + (Number.isFinite(day.launches) ? day.launches : 0), 0)
  return {
    activeAccounts: stats.accounts.active.d7,
    guests: stats.accounts.guests.d7,
    returning: stats.accounts.returning.d7,
    launches,
    accountsSince: partialSince(7, computedAt, accountsCoverageSince(stats.coverage)),
    launchesSince: partialSince(7, computedAt, stats.coverage.journalSince),
  }
}
