const displayNamesCache = new Map<string, Intl.DisplayNames>()

function getDisplayNames(locale: string): Intl.DisplayNames {
  const key = locale.split('-')[0] || 'fr'
  let cached = displayNamesCache.get(key)
  if (!cached) {
    cached = new Intl.DisplayNames([key], { type: 'region' })
    displayNamesCache.set(key, cached)
  }
  return cached
}

export function countryLabel(
  code: string | null | undefined,
  locale = 'fr',
  unknownLabel = 'Inconnu'
): string {
  if (!code || code === '??') return unknownLabel
  try {
    return getDisplayNames(locale).of(code) ?? code
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
