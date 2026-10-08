import {
  COSMETICS,
  DEFAULT_ONLINE_ICON,
  ICON_SERIES,
  PIONEER_FRAME_KEY,
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

/**
 * Récompense des Premiers pas : le cadre Pionnier, pour qui les boucle TOUS
 * avant cette date — fin mars 2027, heure de Paris (minuit le 1er avril,
 * déjà en heure d'été : +02:00).
 *
 * Pourquoi une date limite : le site est jeune (89 comptes au 07/10/2026) ;
 * ceux qui l'essuient maintenant gardent une marque que les suivants
 * n'auront plus. Sans date, le cadre deviendrait le décor de tout le monde
 * et ne dirait plus rien. Après la date, rien n'est retiré à qui l'a :
 * c'est précisément ce qui en fait la valeur.
 *
 * Un invité peut le gagner : « Sauvegarder » est l'une de SES étapes, il
 * l'obtient donc en mettant son compte à l'abri — le geste qu'on veut le
 * voir faire.
 */
export const PIONEER_DEADLINE = '2027-04-01T00:00:00+02:00'
export const PIONEER_DEADLINE_MS = Date.parse(PIONEER_DEADLINE)

/** Fenêtre ouverte : `now` strictement avant la date limite (`deadline` : ISO, celle de la route par défaut). */
export function isPioneerWindowOpen(
  now: Date | number = Date.now(),
  deadline: string = PIONEER_DEADLINE
): boolean {
  const deadlineMs = Date.parse(deadline)
  if (!Number.isFinite(deadlineMs)) return false
  return (typeof now === 'number' ? now : now.getTime()) < deadlineMs
}

/**
 * Le cadre est-il gagné MAINTENANT ? Toutes les étapes faites, fenêtre
 * ouverte. Liste vide : jamais (garde-fou — computeFirstSteps en rend
 * toujours cinq ou six).
 */
export function earnsPioneerFrame(
  progress: Pick<FirstStepsDto, 'completed' | 'total'>,
  now: Date | number = Date.now()
): boolean {
  return progress.total > 0 && progress.completed >= progress.total && isPioneerWindowOpen(now)
}

export type PioneerRewardDto = {
  /** Clé de la ligne CosmeticGrant (`frame:pionnier`). */
  key: string
  /** Le compte a le cadre — gagné ici, ou accordé avant (jamais retiré). */
  granted: boolean
  /** Date limite (ISO) : la carte cesse de promettre le cadre une fois passée. */
  deadline: string
}

/** Réponse de GET /api/online/first-steps : la liste, plus la récompense. */
export type FirstStepsResponse = FirstStepsDto & {
  /** Facultatif côté client : un serveur d'avant la récompense ne l'envoie pas. */
  reward?: PioneerRewardDto
}

export function pioneerReward(granted: boolean): PioneerRewardDto {
  return { key: PIONEER_FRAME_KEY, granted, deadline: PIONEER_DEADLINE }
}

/**
 * Ce que la carte Premiers pas dit de la récompense :
 *  - 'promise'  : à gagner — liste à finir ET date limite pas encore passée ;
 *  - 'unlocked' : accordé, pas encore porté → « L'équiper » ;
 *  - 'equipped' : équipé PENDANT cette visite → confirmation, puis plus rien
 *    aux visites suivantes ;
 *  - null       : rien à dire (date passée sans l'avoir, déjà porté, ou
 *    serveur d'avant la récompense).
 * Accordé l'emporte sur la date : un cadre gagné s'annonce même après.
 */
export type PioneerRewardState = 'promise' | 'unlocked' | 'equipped'

export function pioneerRewardState(input: {
  reward: Pick<PioneerRewardDto, 'granted'> | null | undefined
  stepsLeft: boolean
  /** Date limite pas encore passée (isPioneerWindowOpen, jugée à la réponse). */
  windowOpen: boolean
  /** Cadre Pionnier porté (préférences en ligne du compte). */
  equipped: boolean
  /** Le joueur l'a équipé sous les yeux de la carte. */
  justEquipped: boolean
}): PioneerRewardState | null {
  const { reward, stepsLeft, windowOpen, equipped, justEquipped } = input
  if (!reward) return null
  if (reward.granted) {
    if (!equipped) return 'unlocked'
    return justEquipped ? 'equipped' : null
  }
  return stepsLeft && windowOpen ? 'promise' : null
}
