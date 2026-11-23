import { soireeGameColors } from '@/lib/soiree/catalog'

/** Les deux seules couleurs d'icône de la pastille : le crème du site et l'encre des cartes. */
export const BADGE_CREAM = '#F3EAD3'
export const BADGE_INK = '#24201A'

export type BadgeInk = {
  color: string
  /** Ombre portée du glyphe : sombre sous le crème, claire sous l'encre. */
  shadow: string
  /** Contraste WCAG minimal mesuré sur le début, le milieu et la fin du dégradé (voile compris). */
  contrast: number
  /** Opacité d'un voile noir posé sur le dégradé (0 : aucun). */
  veil: number
}

/** Seuil WCAG des éléments graphiques : l'icône est le seul repère de la pastille. */
export const BADGE_MIN_CONTRAST = 3

/**
 * Voiles essayés, du plus léger au plus fort, quand ni le crème ni l'encre
 * n'atteignent le seuil : dégradé qui va d'une couleur sombre à une claire
 * (rouge vers jaune, violet vers ambre) — l'encre se perd dans le sombre, le
 * crème dans le clair. Assombrir le tout rend le crème lisible partout.
 */
const VEILS = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45]

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a)
  const cb = parseHex(b)
  if (!ca || !cb) return 1
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Les points du dégradé où l'on mesure : début, milieu (mélange simple en sRGB, comme CSS) et fin. */
function samples(from: string, to: string): string[] {
  const a = parseHex(from)
  const b = parseHex(to)
  if (!a || !b) return [from, to]
  const mid = a.map((v, i) => Math.round((v + b[i]) / 2))
  return [from, `#${mid.map((v) => v.toString(16).padStart(2, '0')).join('')}`, to]
}

function minContrast(ink: string, points: readonly string[]): number {
  return Math.min(...points.map((p) => contrastRatio(ink, p)))
}

/** Un point du dégradé sous un voile noir d'opacité `alpha` (composition CSS, en sRGB). */
function darken(hex: string, alpha: number): string {
  const c = parseHex(hex)
  if (!c) return hex
  return `#${c.map((v) => Math.round(v * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`
}

const CREAM_SHADOW = '0 1px 1px rgba(0,0,0,0.45)'

/**
 * Choisit, du crème ou de l'encre, la couleur d'icône qui lit le mieux sur le dégradé du jeu ;
 * sous le seuil avec les deux, le crème sur le dégradé assombri par le voile le plus léger qui suffit.
 */
export function badgeInkFor(gameId: string): BadgeInk {
  const { from, to } = soireeGameColors(gameId)
  const points = samples(from, to)
  const cream = minContrast(BADGE_CREAM, points)
  const ink = minContrast(BADGE_INK, points)
  if (Math.max(cream, ink) < BADGE_MIN_CONTRAST) {
    for (const veil of VEILS) {
      const veiled = minContrast(BADGE_CREAM, points.map((p) => darken(p, veil)))
      if (veiled >= BADGE_MIN_CONTRAST) return { color: BADGE_CREAM, shadow: CREAM_SHADOW, contrast: veiled, veil }
    }
  }
  return ink > cream
    ? { color: BADGE_INK, shadow: '0 1px 1px rgba(255,255,255,0.4)', contrast: ink, veil: 0 }
    : { color: BADGE_CREAM, shadow: CREAM_SHADOW, contrast: cream, veil: 0 }
}

/** Fond de la pastille : le dégradé du jeu, sous son voile s'il en faut un. */
export function badgeBackground(gradient: string, veil: number): string {
  return veil > 0 ? `linear-gradient(rgba(0,0,0,${veil}), rgba(0,0,0,${veil})), ${gradient}` : gradient
}
