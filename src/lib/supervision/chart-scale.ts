/**
 * Échelles des graphiques de la supervision — fonctions PURES, sans React,
 * testées à part (chart-scale.test.ts). Tout ce qui décide d'un chiffre
 * affiché sur un axe ou d'une part en % passe par ici : un graphique dont la
 * graduation « tombe mal » (0, 3, 6, 9, 12…) ou dont les parts ne font pas
 * 100 se lit mal et se défend mal.
 */

/** Mantisses « rondes » retenues pour le haut d'échelle et le pas des graduations. */
const NICE_MANTISSAS = [1, 2, 2.5, 5] as const

/**
 * Efface le bruit binaire des flottants (0.1 * 3 = 0.30000000000000004) :
 * une graduation doit s'écrire « 0,3 », jamais « 0,30000000000000004 ».
 */
function clean(value: number): number {
  return Number(value.toPrecision(12))
}

function isNearInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9
}

/**
 * Haut d'échelle « rond » au-dessus (ou égal à) `max` : 1, 2, 2,5 ou 5 × 10^k.
 * 0, négatif, NaN ou infini -> 1 : un axe de 0 à 0 ne se dessine pas, et une
 * donnée aberrante ne doit pas faire exploser le graphique.
 *
 * Exemples : 7 -> 10 ; 99 -> 100 ; 101 -> 200 ; 2500 -> 2500 ; 0,3 -> 0,5.
 */
export function niceMax(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1
  const base = Math.pow(10, Math.floor(Math.log10(max)))
  // `fraction` est dans [1, 10[ ; la tolérance absorbe log10 inexact (1000 -> 2,9999…).
  const fraction = max / base
  for (const mantissa of [...NICE_MANTISSAS, 10]) {
    if (fraction <= mantissa + 1e-9) return clean(mantissa * base)
  }
  return clean(10 * base)
}

/**
 * Graduations de 0 à `niceMax(max)` inclus, environ `count` intervalles
 * (jamais plus de `count + 1`), à pas rond (1, 2, 2,5 ou 5 × 10^k) qui
 * divise exactement le haut d'échelle : chaque trait tombe sur une valeur
 * qu'on lit sans calcul.
 *
 * `integer` (par défaut) : la supervision compte des visiteurs, des parties,
 * des comptes — une graduation « 2,5 joueurs » n'aurait pas de sens. Le pas
 * reste alors entier et l'échelle ne descend pas sous 1.
 *
 * À égalité d'écart avec `count`, on préfère MOINS de traits (moins de bruit).
 */
export function niceTicks(max: number, count = 4, options: { integer?: boolean } = {}): number[] {
  const integer = options.integer ?? true
  let top = niceMax(max)
  if (integer && top < 1) top = 1
  const target = Number.isFinite(count) && count >= 1 ? Math.floor(count) : 4

  let bestStep: number | null = null
  let bestScore = Number.POSITIVE_INFINITY
  const exponent = Math.floor(Math.log10(top))
  // Le pas le plus fin utile vaut top / (count + 1) : deux décades sous le
  // haut d'échelle suffisent largement à le couvrir.
  for (let e = exponent - 2; e <= exponent; e++) {
    for (const mantissa of NICE_MANTISSAS) {
      const step = clean(mantissa * Math.pow(10, e))
      if (integer && !isNearInteger(step)) continue
      const intervals = top / step
      if (!isNearInteger(intervals)) continue
      const k = Math.round(intervals)
      if (k < 1 || k > target + 1) continue
      const score = Math.abs(k - target) + (k > target ? 0.1 : 0)
      if (score < bestScore) {
        bestScore = score
        bestStep = step
      }
    }
  }
  if (bestStep === null) return [0, top]
  const step = bestStep
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => clean(i * step))
}

/**
 * Part entière (en %) de `part` dans `total`, bornée à [0, 100].
 * null quand la part n'a pas de sens (total nul, négatif ou non fini) : on
 * affiche alors « — », jamais un « 0 % » qui mentirait.
 */
export function shareOf(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null
  return Math.min(100, Math.round((Math.max(0, part) / total) * 100))
}

/**
 * Parts entières d'une répartition qui totalisent EXACTEMENT 100 (méthode
 * du plus fort reste) : trois tiers s'affichent 34 / 33 / 33 et non
 * 33 / 33 / 33, que l'œil additionne et trouve faux. Valeurs négatives ou
 * non finies comptées pour 0 ; total nul -> null partout.
 */
export function sharesOf(values: number[]): Array<number | null> {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const total = safe.reduce((sum, v) => sum + v, 0)
  if (total <= 0) return safe.map(() => null)
  const exact = safe.map((v) => (v / total) * 100)
  const floors = exact.map((v) => Math.floor(v))
  let missing = 100 - floors.reduce((sum, v) => sum + v, 0)
  // Les points manquants vont aux plus forts restes (à égalité : le premier).
  const order = exact
    .map((v, i) => ({ i, remainder: v - floors[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i)
  for (const { i, remainder } of order) {
    if (missing <= 0) break
    if (remainder <= 0) continue
    floors[i] += 1
    missing -= 1
  }
  return floors
}

/**
 * Pas d'étiquetage de l'axe des jours : 1 = toutes les étiquettes, 2 = une
 * sur deux, etc., pour n'en afficher au plus que `maxLabels`. Un nombre de
 * places non fini ou nul -> une seule étiquette (pas = n).
 */
export function xLabelStep(n: number, maxLabels: number): number {
  if (!Number.isFinite(n) || n <= 1) return 1
  const places = Number.isFinite(maxLabels) ? Math.max(1, Math.floor(maxLabels)) : 1
  return Math.max(1, Math.ceil(n / places))
}

/**
 * L'étiquette `index` est-elle affichée avec ce pas ? La grille part de
 * `anchor` (le jour courant, en général le dernier) : c'est lui qu'on lit en
 * premier, il ne doit jamais sauter parce que la série a un nombre impair de
 * jours.
 */
export function showsXLabel(index: number, anchor: number, step: number): boolean {
  const s = Number.isFinite(step) && step >= 1 ? Math.floor(step) : 1
  return (((anchor - index) % s) + s) % s === 0
}
