import {
  COSMETICS,
  DEFAULT_ONLINE_ICON,
  ICON_SERIES,
  levelForXp,
  xpForLevel,
} from '@/lib/online/cosmetics'
import type { OnlinePreferences } from '@/lib/online-preferences'

/**
 * « Premiers pas » de la page Compte : la courte liste qui dit au nouveau
 * venu ce qu'il gagne à revenir.
 *
 * Pourquoi : au 07/10/2026, 23 joueurs de niveau 2 et plus n'avaient JAMAIS
 * touché à leur profil — ils ignoraient que les niveaux débloquent des icônes,
 * des effets de pseudo et des cadres à équiper pour leurs prochaines parties.
 * Et une première partie à plusieurs fait revenir bien plus qu'une première
 * partie solo (25/36 contre 4/21) : l'étape « avec tes potes » est là pour ça.
 *
 * Module PUR, partagé client/serveur (aucune dépendance à Prisma) : la route
 * GET /api/online/first-steps rassemble les faits, ce module en tire la liste.
 */

export type FirstStepId = 'play' | 'icon' | 'effect' | 'save' | 'friends' | 'level3'

export type FirstStep = { id: FirstStepId; done: boolean }

export type FirstStepsDto = {
  steps: FirstStep[]
  completed: number
  total: number
  xp: number
  /** XP qui manque pour atteindre le niveau 3 (0 une fois atteint). */
  xpToLevel3: number
}

export type FirstStepsInput = {
  xp: number
  prefs: Pick<OnlinePreferences, 'icon' | 'specialEffect'>
  isGuest: boolean
  /** Succès `first_game` débloqué (première partie en ligne terminée, bots compris). */
  hasFirstGame: boolean
  /** Au moins une partie journalisée avec deux comptes humains ou plus. */
  playedWithHumans: boolean
}

/** Niveau visé par la dernière étape : le premier palier qui offre un EFFET de pseudo. */
export const FIRST_STEPS_TARGET_LEVEL = 3

/**
 * Ordre d'affichage (contrat C10) : on joue d'abord, on s'habille ensuite, on
 * met le compte à l'abri, puis on revient à plusieurs et on monte de niveau.
 */
export const FIRST_STEP_ORDER: readonly FirstStepId[] = [
  'play',
  'icon',
  'effect',
  'save',
  'friends',
  'level3',
]

/**
 * Ce que gagnent les niveaux 2 et 3, DÉRIVÉ du catalogue plutôt que recopié :
 * la carte cite la série d'icônes du niveau 2 et l'effet du niveau 3 sans
 * risque de promettre un déblocage qui aurait changé de palier. Le test
 * vérifie qu'ils existent bien (Trognes, Émeraude au 07/10/2026).
 */
export const LEVEL2_ICON_SERIES_ID: string | null =
  ICON_SERIES.find((series) => series.unlockLevel === 2)?.id ?? null

export const LEVEL3_EFFECT_ID: string | null =
  COSMETICS.find((c) => c.kind === 'effect' && c.unlockLevel === FIRST_STEPS_TARGET_LEVEL)?.id ??
  null

export function computeFirstSteps(input: FirstStepsInput): FirstStepsDto {
  // XP jamais négative ni fractionnaire en base, mais la carte ne doit pas
  // afficher « plus que 300,5 XP » si une valeur exotique arrivait.
  const xp = Number.isFinite(input.xp) && input.xp > 0 ? Math.floor(input.xp) : 0
  const xpToLevel3 = Math.max(0, xpForLevel(FIRST_STEPS_TARGET_LEVEL) - xp)

  const done: Record<FirstStepId, boolean> = {
    // L'XP suffit aujourd'hui (toute partie terminée en crédite) ; le succès
    // est le filet : il dit « partie terminée » même le jour où une règle
    // d'XP ne créditerait rien (plafond, jeu sans gain).
    play: xp > 0 || input.hasFirstGame,
    // Une icône vide vaut l'icône par défaut : le serveur la remplace ainsi.
    icon: Boolean(input.prefs.icon) && input.prefs.icon !== DEFAULT_ONLINE_ICON,
    effect: input.prefs.specialEffect != null,
    save: !input.isGuest,
    friends: input.playedWithHumans,
    level3: levelForXp(xp) >= FIRST_STEPS_TARGET_LEVEL,
  }

  // « Sauvegarder » n'a de sens que pour un invité : un compte e-mail ou
  // Google ne verrait qu'une étape cochée d'office, qui gonflerait le compteur.
  const steps = FIRST_STEP_ORDER.filter((id) => id !== 'save' || input.isGuest).map((id) => ({
    id,
    done: done[id],
  }))

  return {
    steps,
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
    xp,
    xpToLevel3,
  }
}
