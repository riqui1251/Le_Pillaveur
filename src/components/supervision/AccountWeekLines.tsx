'use client'

import { useTranslations } from 'next-intl'
import { formatPresenceDuration, tableDurationLabel, type DurationUnits } from '@/lib/format-presence'
import { VISITS_7D_KEYS, isVisitTrackingState } from '@/lib/supervision/visit-tracking'

/** `visits7d` d'un compte de la liste (GET /api/admin/users, admins et plus). */
export type AccountWeekVisits = {
  visits: number
  activeSeconds: number
  /** VisitTrackingState ; absent d'une réponse servie avant son ajout. */
  state?: string
}

/** `play7d` d'un compte de la liste : parties du journal, durée de TABLE. */
export type AccountWeekPlay = { games: number; tableSeconds: number; estimated: boolean }

/**
 * Résumé « 7 j » d'un compte dans la liste Comptes : une ligne pour ses
 * visites, une pour ses parties en ligne.
 *
 * Sans visite, la première dit POURQUOI (équipe, vu sans visite suivie, pas
 * vu) : « aucune visite suivie » valait pour les trois, et le joueur d'une
 * table qui n'avait pas accepté les statistiques passait pour absent. La
 * seconde vient du journal des parties, écrit pour tous les joueurs d'une
 * table : les deux y ont la même durée, suivis ou non.
 *
 * Deux lignes, deux mots (« actif », « à table ») : une durée de table n'est
 * pas un temps de visite, elles ne se lisent jamais sur la même ligne.
 */
export function AccountWeekLines({
  visits,
  play,
  units,
}: {
  visits: AccountWeekVisits
  play?: AccountWeekPlay
  units: DurationUnits
}) {
  const t = useTranslations('supervision.accounts')

  const visitsLine =
    visits.visits > 0
      ? t('visits7d', {
          visits: visits.visits,
          active: formatPresenceDuration(visits.activeSeconds, units),
        })
      : isVisitTrackingState(visits.state) && visits.state !== 'tracked'
        ? t(VISITS_7D_KEYS[visits.state])
        : null

  // Parties sans durée additionnée (en cours, fin inconnue) : leur nombre
  // seul, jamais « 0 s à table ».
  const playLine =
    play && play.games > 0
      ? play.tableSeconds > 0
        ? t('play7d', {
            games: play.games,
            duration: tableDurationLabel(play.tableSeconds, play.estimated ? 'estimated' : 'reliable', units),
          })
        : t('play7dNoTime', { games: play.games })
      : null

  if (!visitsLine && !playLine) return null

  return (
    <span className="inline-flex min-w-0 flex-col gap-0.5 text-[11px] tabular-nums text-white/45">
      {visitsLine && <span className="min-w-0 break-words">{visitsLine}</span>}
      {playLine && <span className="min-w-0 break-words">{playLine}</span>}
    </span>
  )
}
