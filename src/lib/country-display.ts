const COUNTRY_NAMES = new Intl.DisplayNames(['fr'], { type: 'region' })

export function countryLabel(code: string | null | undefined): string {
  if (!code || code === '??') return 'Inconnu'
  try {
    return COUNTRY_NAMES.of(code) ?? code
  } catch {
    return code
  }
}

export function countryFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2 || code === '??') return '🌐'
  const base = 0x1f1e6
  const chars = code.toUpperCase().split('')
  return String.fromCodePoint(
    base + chars[0].charCodeAt(0) - 65,
    base + chars[1].charCodeAt(0) - 65
  )
}
