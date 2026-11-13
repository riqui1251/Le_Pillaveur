/**
 * Saisie d'une estimation au clavier du téléphone. Le pavé décimal donne la
 * virgule ou le point de l'APPAREIL, pas forcément de la langue du site ; on
 * accepte donc les deux, les séparateurs de milliers (espaces fines
 * qu'insère Intl en français, points en espagnol et en italien, virgules en
 * anglais) et le signe moins typographique. L'aperçu formaté affiché sous le
 * champ lève les cas ambigus (« 1.500 »).
 */

const SPACES = /[\s\u00a0\u202f\u2009'\u2019_]/g
const MINUS = /^[-\u2212\u2013]/
const MAX_DRAFT_LENGTH = 24

/** Ce que le champ garde de la frappe : chiffres, séparateurs, espaces et un signe en tête. */
export function sanitizeEstimateDraft(raw: string): string {
  const kept = raw.replace(/[^\d.,\s\u00a0\u202f\u2009\u2212\u2013-]/g, '')
  const negative = MINUS.test(kept.replace(/^\s+/, ''))
  const body = kept.replace(/[-\u2212\u2013]/g, '').replace(/^\s+/, '')
  return `${negative ? '-' : ''}${body}`.slice(0, MAX_DRAFT_LENGTH)
}

/** Séparateur décimal de la langue (« , » en français, « . » en anglais). */
export function decimalSeparatorFor(locale: string): string {
  try {
    const sample = new Intl.NumberFormat(locale).format(1.5)
    const separator = sample.replace(/\d/g, '').charAt(0)
    return separator === ',' ? ',' : '.'
  } catch {
    return '.'
  }
}

function count(text: string, char: string): number {
  return text.split(char).length - 1
}

/** Nombre saisi, ou null si ce n'en est pas un. */
export function parseEstimateInput(raw: string, decimalSeparator: string = '.'): number | null {
  let text = raw.trim().replace(SPACES, '')
  if (!text) return null
  let negative = false
  if (MINUS.test(text)) {
    negative = true
    text = text.slice(1)
  }
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null

  const dots = count(text, '.')
  const commas = count(text, ',')
  let normalized: string
  if (dots > 0 && commas > 0) {
    // Les deux séparateurs : le dernier écrit est le décimal (1.234,5 / 1,234.5).
    const decimal = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ','
    const group = decimal === '.' ? ',' : '.'
    if (count(text, decimal) > 1) return null
    normalized = text.split(group).join('').replace(decimal, '.')
  } else if (dots + commas === 0) {
    normalized = text
  } else {
    const separator = dots > 0 ? '.' : ','
    const parts = text.split(separator)
    if (parts.length > 2) {
      // Séparateur répété : ce sont des milliers (1.000.000), par groupes de trois.
      if (parts[0].length === 0 || parts[0].length > 3 || parts.slice(1).some((p) => p.length !== 3)) return null
      normalized = parts.join('')
    } else {
      const [whole, fraction] = parts
      const looksGrouped = separator !== decimalSeparator && fraction.length === 3 && whole.length > 0 && whole !== '0'
      normalized = looksGrouped ? `${whole}${fraction}` : `${whole || '0'}.${fraction}`
    }
  }
  if (!/\d/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  const signed = negative ? -value : value
  return signed === 0 ? 0 : signed
}
