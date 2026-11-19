import type { LGClientView, LGPhase, LGRole } from './engine'

/** Rôle qui agit pendant chaque sous-phase de nuit. */
const NIGHT_ACTOR_ROLE: Readonly<Partial<Record<LGPhase, LGRole>>> = {
  'night-guard': 'salvateur',
  'night-seer': 'voyante',
  'night-raven': 'corbeau',
  'night-wolves': 'loup',
  'night-witch': 'sorciere',
}

export type LGPhaseDisplay = {
  /** Clé du libellé sous `games.loup-garou.game`. */
  labelKey: string
  /** Chrono de la phase montré ? */
  countdown: boolean
  /** Clé de l'écran central : quand elle change, l'écran rejoue son entrée. */
  screenKey: string
}

/**
 * Ce que l'écran dit de la phase en cours. Une sous-phase de nuit n'existe
 * que si son rôle est vivant : son nom, son chrono (remis à zéro à chaque
 * sous-phase, de durée propre) ou une animation à chaque passage trahiraient
 * les rôles en jeu. Qui n'agit pas (TV comprise) lit donc une nuit unique ;
 * l'acteur et le fantôme gardent la sous-phase précise.
 */
export function lgPhaseDisplay(
  view: Pick<LGClientView, 'phase' | 'phaseSeq' | 'round' | 'ghost' | 'myRole' | 'players'>,
  viewerId: string
): LGPhaseDisplay {
  const precise: LGPhaseDisplay = {
    labelKey: `phases.${view.phase}`,
    countdown: true,
    screenKey: `${view.phase}#${view.phaseSeq}`,
  }
  const actorRole = NIGHT_ACTOR_ROLE[view.phase]
  if (!actorRole || view.ghost) return precise
  const me = view.players.find((p) => p.id === viewerId)
  if (me?.alive && view.myRole === actorRole) return precise
  return { labelKey: 'phases.night', countdown: false, screenKey: `night#${view.round}` }
}
