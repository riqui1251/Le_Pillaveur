/**
 * Mémoire du tuto des nouveaux joueurs, sur l'appareil.
 *
 * - `lp-tour-seen` (localStorage) : « vu » ou « passé » — le tuto ne se
 *   repropose plus tout seul sur cet appareil. Même logique que les tutos de
 *   jeu (`lp-tutorial-seen-<jeu>`). Le compte en garde une copie
 *   (User.tourSeenAt) pour les autres appareils du joueur.
 * - `lp-tour-run` (sessionStorage) : un tuto en cours dans cet onglet, pour le
 *   reprendre après un rechargement de page. Il meurt avec l'onglet.
 *
 * Stockage indisponible (navigation privée, quota) : on se comporte comme si
 * le tuto avait été vu — ne jamais insister auprès d'un joueur dont on ne peut
 * pas retenir le refus.
 */

const SEEN_KEY = 'lp-tour-seen'
const RUN_KEY = 'lp-tour-run'

export type TourOutcome = 'done' | 'skipped'

export function hasSeenTour(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(SEEN_KEY) !== null
  } catch {
    return true
  }
}

export function markTourSeen(outcome: TourOutcome): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SEEN_KEY, outcome)
  } catch {
    // Pas de stockage : rien à retenir, le tuto reste accessible par le menu.
  }
}

export function isTourRunning(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(RUN_KEY) === '1'
  } catch {
    return false
  }
}

export function setTourRunning(running: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (running) window.sessionStorage.setItem(RUN_KEY, '1')
    else window.sessionStorage.removeItem(RUN_KEY)
  } catch {
    // Sans stockage de session, un rechargement arrête simplement le tuto.
  }
}
