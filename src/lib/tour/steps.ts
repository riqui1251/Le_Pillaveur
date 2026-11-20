/**
 * Tuto des nouveaux joueurs — le parcours, en données.
 *
 * Deux temps (choix validés le 20/11/2026) :
 * - « sur un téléphone » : le tuto GUIDE sur les vrais écrans. Chaque étape
 *   vise un élément réel par son attribut `data-tour` ; le joueur ajoute ses
 *   vrais prénoms et lance sa vraie partie ;
 * - « en ligne » : une DÉMONSTRATION sur des écrans d'exemple
 *   (src/components/tour/TourDemo.tsx), sans vraie table ni vraie invitation.
 *
 * Ce module est pur (ni DOM, ni React) : la navigation entre étapes se teste
 * sans navigateur (steps.test.ts).
 */

export const TOUR_CHAPTERS = ['players', 'games', 'table', 'online', 'friends', 'voice', 'ingame'] as const
export type TourChapter = (typeof TOUR_CHAPTERS)[number]

/** Les écrans réels que traverse la partie « sur un téléphone ». */
export type TourScreen = 'players' | 'hub' | 'game'

export type LocalStep = {
  /** Clé des textes : `tour.local.<id>`. */
  id: string
  chapter: Extract<TourChapter, 'players' | 'games' | 'table'>
  screen: TourScreen
  /** Valeur de l'attribut `data-tour` de l'élément visé. */
  anchor: string
  /** Le joueur agit lui-même sur l'élément (le voile laisse passer le doigt). */
  interactive: boolean
  /** Élément absent de certains écrans (volet de règles) : l'étape est alors sautée. */
  optional?: boolean
  /** Sans son élément, l'étape s'affiche quand même, bulle seule. */
  floating?: boolean
  /** Étape propre au français (les pages de règles n'existent qu'en français). */
  frOnly?: boolean
  /** « Suivant » touche l'élément à la place du joueur, au lieu de passer à l'étape suivante. */
  nextClicks?: boolean
  /** Message de « Suivant » quand l'étape ne peut pas encore avancer (`tour.nudge.<clé>`). */
  nudge?: 'needPlayers' | 'needTwo' | 'pickGame' | 'notReady'
}

export const LOCAL_STEPS: readonly LocalStep[] = [
  { id: 'addRow', chapter: 'players', screen: 'players', anchor: 'players-add', interactive: true, nudge: 'needPlayers' },
  { id: 'cards', chapter: 'players', screen: 'players', anchor: 'players-grid', interactive: true },
  { id: 'start', chapter: 'players', screen: 'players', anchor: 'players-start', interactive: true, nextClicks: true, nudge: 'needTwo' },
  { id: 'partyBar', chapter: 'games', screen: 'hub', anchor: 'party-bar', interactive: false },
  { id: 'localSection', chapter: 'games', screen: 'hub', anchor: 'hub-local-head', interactive: false, optional: true },
  { id: 'pickGame', chapter: 'games', screen: 'hub', anchor: 'hub-local-grid', interactive: true, nudge: 'pickGame' },
  { id: 'rules', chapter: 'table', screen: 'game', anchor: 'prelobby-rules', interactive: true, optional: true },
  { id: 'launch', chapter: 'table', screen: 'game', anchor: 'prelobby-start', interactive: true, optional: true, nextClicks: true, nudge: 'notReady' },
  { id: 'table', chapter: 'table', screen: 'game', anchor: 'game-action', interactive: false, floating: true },
  { id: 'menu', chapter: 'table', screen: 'game', anchor: 'nav-burger', interactive: true, nextClicks: true, frOnly: true },
  { id: 'menuRules', chapter: 'table', screen: 'game', anchor: 'nav-rules', interactive: false, frOnly: true },
]

/** Étapes de la démonstration en ligne, dans l'ordre. Clé des textes : `tour.demo.<id>`. */
export const DEMO_STEPS = [
  { id: 'mode', chapter: 'online' },
  { id: 'goOnline', chapter: 'online' },
  { id: 'pickOnline', chapter: 'online' },
  { id: 'openTable', chapter: 'online' },
  { id: 'privacy', chapter: 'online' },
  { id: 'code', chapter: 'online' },
  { id: 'friendsMenu', chapter: 'friends' },
  { id: 'menuFriends', chapter: 'friends' },
  { id: 'addFriend', chapter: 'friends' },
  { id: 'accept', chapter: 'friends' },
  { id: 'inviteOpen', chapter: 'friends' },
  { id: 'invite', chapter: 'friends' },
  { id: 'mic', chapter: 'voice' },
  { id: 'join', chapter: 'voice' },
  { id: 'controls', chapter: 'voice' },
  { id: 'bots', chapter: 'ingame' },
  { id: 'launch', chapter: 'ingame' },
  { id: 'briefing', chapter: 'ingame' },
  { id: 'bulb', chapter: 'ingame' },
  { id: 'howTo', chapter: 'ingame' },
  { id: 'chatMenu', chapter: 'ingame' },
  { id: 'menuChat', chapter: 'ingame' },
  { id: 'write', chapter: 'ingame' },
  { id: 'private', chapter: 'ingame' },
] as const satisfies readonly { id: string; chapter: TourChapter }[]

export type DemoStepId = (typeof DEMO_STEPS)[number]['id']

/** Ce que le moteur sait de la page à un instant donné. */
export type TourEnv = {
  screen: TourScreen | null
  locale: string
  /** L'élément `data-tour` de ce nom est à l'écran. */
  has: (anchor: string) => boolean
}

/**
 * L'écran du tuto auquel correspond un chemin (sans préfixe de langue), ou
 * null : `/jeux/<collection>` et tout le reste du site ne font pas partie du
 * parcours.
 */
export function screenOfPath(pathname: string): TourScreen | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/joueurs') return 'players'
  if (path === '/jeux') return 'hub'
  if (/^\/games\/[^/]+$/.test(path)) return 'game'
  return null
}

function eligible(step: LocalStep, env: TourEnv): boolean {
  return !step.frOnly || env.locale === 'fr'
}

/** L'étape peut s'afficher telle quelle : son élément est là, ou elle s'en passe. */
function showable(step: LocalStep, env: TourEnv): boolean {
  return step.floating === true || env.has(step.anchor)
}

/**
 * Première étape affichable à partir de `from` (comprise) sur l'écran courant.
 * Une étape obligatoire dont l'élément n'est pas encore monté est rendue telle
 * quelle (le moteur attend l'élément) ; une étape facultative absente est
 * sautée seulement si `skipMissingOptional` — le moteur ne le demande qu'après
 * avoir laissé à la page le temps de se monter.
 *
 * `null` : plus rien à montrer sur cet écran. Si aucune étape ultérieure ne
 * vise un autre écran, la partie « sur un téléphone » est finie.
 */
export function resolveForward(
  from: number,
  env: TourEnv,
  skipMissingOptional: boolean,
  steps: readonly LocalStep[] = LOCAL_STEPS
): number | null {
  if (env.screen === null) return null
  for (let k = Math.max(0, from); k < steps.length; k++) {
    const step = steps[k]
    if (step.screen !== env.screen || !eligible(step, env)) continue
    if (showable(step, env)) return k
    if (!step.optional) return k
    if (!skipMissingOptional) return k
  }
  return null
}

/** Reste-t-il, après `from`, une étape sur un AUTRE écran que l'écran courant ? */
export function hasLaterScreen(from: number, env: TourEnv, steps: readonly LocalStep[] = LOCAL_STEPS): boolean {
  return steps.slice(Math.max(0, from)).some((step) => step.screen !== env.screen && eligible(step, env))
}

/**
 * Étape précédente affichable sur le même écran, ou null. Le retour d'un écran
 * au précédent (hub → joueurs) est une navigation : il se décide dans le
 * composant, pas ici.
 */
export function resolveBackward(
  from: number,
  env: TourEnv,
  steps: readonly LocalStep[] = LOCAL_STEPS
): number | null {
  for (let k = Math.min(from, steps.length) - 1; k >= 0; k--) {
    const step = steps[k]
    if (step.screen !== env.screen) return null
    if (eligible(step, env) && showable(step, env)) return k
  }
  return null
}

export type ChapterProgress = {
  /** Rang du chapitre dans TOUR_CHAPTERS. */
  chapter: number
  /** Rang de l'étape dans son chapitre, à partir de 1. */
  step: number
  /** Nombre d'étapes du chapitre. */
  steps: number
}

/** Où en est-on dans le chapitre de l'étape `index` ? */
export function chapterProgress(
  steps: readonly { chapter: TourChapter }[],
  index: number
): ChapterProgress {
  const chapter = steps[index].chapter
  const inChapter = steps.map((step, k) => (step.chapter === chapter ? k : -1)).filter((k) => k >= 0)
  return {
    chapter: TOUR_CHAPTERS.indexOf(chapter),
    step: inChapter.indexOf(index) + 1,
    steps: inChapter.length,
  }
}
