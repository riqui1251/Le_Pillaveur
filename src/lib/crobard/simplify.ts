/**
 * Allègement d'un trait AVANT envoi (Crobard, Téléphone Dessiné) — module PUR,
 * sans dépendance, partagé client (PartyCanvas) / serveur (sanitizeStroke).
 *
 * Pourquoi : chaque `pointermove` ajoute un point (60 à 120 par seconde) et
 * chaque coordonnée partait telle quelle, en flottant à 17 caractères. Un
 * trait de deux secondes pesait plusieurs kilo-octets de JSON, réécrits dans
 * l'état complet de la salle puis retéléchargés par CHAQUE téléphone à chaque
 * trait. Sur un réseau de soirée, c'est le dessin qui saccade et la batterie
 * qui fond.
 *
 * Deux leviers, en coordonnées normalisées [0,1] :
 *  - simplification Ramer-Douglas-Peucker : on ne garde que les points qui
 *    s'écartent de plus de `tolerance` du segment qui les enjambe — 0,004,
 *    c'est 2,4 px sur un canvas de 600 px, sous l'épaisseur du trait le plus
 *    fin (3 px) ;
 *  - arrondi à 3 décimales : au millième du canvas, l'erreur maximale est
 *    d'un demi-pixel sur un écran de 1 000 px de large.
 * L'affichage local du trait EN COURS reste brut : seul le trait terminé
 * passe par ici, juste avant `onStrokeComplete`.
 *
 * Format d'entrée et de sortie : tableau plat [x0, y0, x1, y1, …], celui de
 * `Stroke.points`.
 */

/** Écart maximal (normalisé) toléré entre le trait brut et le trait simplifié. */
export const SIMPLIFY_TOLERANCE = 0.004

/** 3 décimales : un millième du canvas, invisible à l'œil. */
const COORD_SCALE = 1_000

/** Arrondit UNE coordonnée normalisée à 3 décimales — sans jamais produire -0. */
export function roundCoord(v: number): number {
  const r = Math.round(v * COORD_SCALE) / COORD_SCALE
  return r === 0 ? 0 : r
}

/** Arrondit un point (x, y) à 3 décimales. */
export function roundPoint(x: number, y: number): [number, number] {
  return [roundCoord(x), roundCoord(y)]
}

/**
 * Distance² de P au SEGMENT [A, B] — pas à la droite (A, B) : un aller-retour
 * sur une même ligne (A → C → B avec C au-delà de B) doit garder C, alors que
 * sa distance à la droite est nulle.
 */
function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = ax + t * dx
  const qy = ay + t * dy
  return (px - qx) * (px - qx) + (py - qy) * (py - qy)
}

/**
 * Ramer-Douglas-Peucker, itératif (pile explicite : un gribouillage de
 * plusieurs milliers de points ne doit pas faire déborder la pile d'appels).
 * Le premier et le dernier point sont toujours conservés ; un trait de deux
 * points ou moins, ou une tolérance nulle, ressortent tels quels. Une boucle
 * fermée (premier = dernier) n'est pas écrasée : la distance au segment
 * dégénéré est celle au point d'ancrage, donc le point le plus éloigné est
 * gardé et la boucle se découpe normalement.
 */
export function simplifyStroke(points: number[], tolerance: number = SIMPLIFY_TOLERANCE): number[] {
  const n = Math.floor(points.length / 2)
  if (n <= 2 || !(tolerance > 0)) return points.slice(0, n * 2)

  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const tol2 = tolerance * tolerance
  // Paires (premier, dernier) d'intervalles encore à examiner.
  const stack: number[] = [0, n - 1]

  while (stack.length > 0) {
    const last = stack.pop() as number
    const first = stack.pop() as number
    const ax = points[first * 2]
    const ay = points[first * 2 + 1]
    const bx = points[last * 2]
    const by = points[last * 2 + 1]
    let farthest = -1
    let maxD2 = tol2
    for (let i = first + 1; i < last; i += 1) {
      const d2 = distToSegmentSq(points[i * 2], points[i * 2 + 1], ax, ay, bx, by)
      if (d2 > maxD2) {
        maxD2 = d2
        farthest = i
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1
      stack.push(first, farthest, farthest, last)
    }
  }

  const out: number[] = []
  for (let i = 0; i < n; i += 1) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1])
  }
  return out
}

/**
 * Trait terminé → trait prêt à l'envoi : simplifié PUIS arrondi (l'arrondi
 * en dernier, pour que la simplification travaille sur les vraies positions).
 */
export function compactStroke(points: number[], tolerance: number = SIMPLIFY_TOLERANCE): number[] {
  const simplified = simplifyStroke(points, tolerance)
  const out = new Array<number>(simplified.length)
  for (let i = 0; i < simplified.length; i += 1) out[i] = roundCoord(simplified[i])
  return out
}
