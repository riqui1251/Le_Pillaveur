/**
 * Lecture de l'inclinaison (événement `deviceorientation`) — PUR, testé dans tilt.test.ts.
 *
 * Téléphone en paysage, debout sur le front, écran vers la table : |gamma| ≈ 90.
 * On hoche la tête vers l'avant, l'écran bascule vers le sol (|beta| > 90) :
 * trouvé. Tête en arrière, écran vers le plafond (|beta| < 90) : passé. Le
 * geste est lu à 35° de la verticale (|gamma| < 55) et le suivant n'est armé
 * qu'une fois revenu à moins de 15° (|gamma| > 75) : l'écart évite qu'un front
 * qui tremble au seuil compte deux fois.
 *
 * Le calcul passe par la verticale vue de l'appareil, u = (−cos β·sin γ,
 * sin β, cos β·cos γ) : sa composante z (perpendiculaire à l'écran) vaut le
 * sinus de l'écart à la verticale. Téléphone bien droit, c'est exactement la
 * règle sur gamma ci-dessus ; tête penchée sur le côté (β ≠ 0), gamma dérive
 * alors que z reste juste, et téléphone tenu en portrait (β ≈ 90, gamma
 * instable), z reste lisible.
 */

const DEG = Math.PI / 180

/** Geste lu quand |gamma| passe sous 55 : 35° hors de la verticale. */
export const TILT_TRIGGER_GAMMA = 55
/** Geste suivant armé quand |gamma| repasse au-dessus de 75 : moins de 15° de la verticale. */
export const TILT_REARM_GAMMA = 75
/** Deux gestes (inclinaison ou toucher) à moins de 600 ms : le second est ignoré. */
export const TILT_DEBOUNCE_MS = 600

const TRIGGER_Z = Math.sin((90 - TILT_TRIGGER_GAMMA) * DEG)
const REARM_Z = Math.sin((90 - TILT_REARM_GAMMA) * DEG)

export type TiltGesture = 'found' | 'passed'

export type TiltClassification = { gesture: TiltGesture | null; armed: boolean }

/** Composante de la verticale perpendiculaire à l'écran : > 0 écran vers le plafond, < 0 vers le sol. */
export function screenFacing(beta: number, gamma: number): number {
  return Math.cos(beta * DEG) * Math.cos(gamma * DEG)
}

export function classifyTilt(beta: number, gamma: number, armed: boolean): TiltClassification {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return { gesture: null, armed }
  const facing = screenFacing(beta, gamma)
  const lean = Math.abs(facing)
  if (armed) {
    if (lean > TRIGGER_Z) return { gesture: facing < 0 ? 'found' : 'passed', armed: false }
    return { gesture: null, armed: true }
  }
  return { gesture: null, armed: lean < REARM_Z }
}

/**
 * Côté de l'appareil tourné vers le haut quand il est debout en paysage :
 * 1 = bord droit (de l'écran en portrait) en haut, −1 = bord gauche en haut.
 * Null tant qu'il n'est pas à peu près vertical et en paysage (dans la main,
 * à plat, en portrait) : on garde alors la dernière lecture.
 */
export function restSide(beta: number, gamma: number): 1 | -1 | null {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null
  if (Math.abs(screenFacing(beta, gamma)) >= REARM_Z) return null
  const upX = -Math.cos(beta * DEG) * Math.sin(gamma * DEG)
  const upY = Math.sin(beta * DEG)
  if (Math.abs(upX) < 0.7 || Math.abs(upX) <= Math.abs(upY)) return null
  return upX > 0 ? 1 : -1
}

/** Anti-rebond commun à l'inclinaison et au toucher (horodatages sur la même horloge). */
export function acceptGesture(lastGestureAt: number | null, at: number): boolean {
  return lastGestureAt === null || at - lastGestureAt >= TILT_DEBOUNCE_MS
}

export type TiltTracker = { armed: boolean; lastGestureAt: number | null }

/** Désarmé au départ : le premier mot attend que le téléphone soit droit sur le front. */
export const TILT_TRACKER_START: TiltTracker = { armed: false, lastGestureAt: null }

export type TiltReading = { beta: number | null; gamma: number | null; at: number }

/**
 * Une lecture du capteur : classement puis anti-rebond. Un geste écarté par
 * l'anti-rebond désarme quand même — sinon il retomberait 600 ms plus tard,
 * téléphone toujours penché.
 */
export function stepTilt(tracker: TiltTracker, reading: TiltReading): { tracker: TiltTracker; gesture: TiltGesture | null } {
  if (reading.beta === null || reading.gamma === null) return { tracker, gesture: null }
  const { gesture, armed } = classifyTilt(reading.beta, reading.gamma, tracker.armed)
  if (gesture === null) return { tracker: armed === tracker.armed ? tracker : { ...tracker, armed }, gesture: null }
  if (!acceptGesture(tracker.lastGestureAt, reading.at)) return { tracker: { ...tracker, armed }, gesture: null }
  return { tracker: { armed, lastGestureAt: reading.at }, gesture }
}

/** Un toucher de secours compte s'il est bref et sans glissé : un doigt qui tient le téléphone ne joue pas. */
export const TAP_MAX_MS = 800
export const TAP_SLOP_PX = 24

export type PointerMark = { at: number; x: number; y: number }

export function isTap(down: PointerMark, up: PointerMark): boolean {
  if (up.at - down.at > TAP_MAX_MS) return false
  return Math.hypot(up.x - down.x, up.y - down.y) <= TAP_SLOP_PX
}
