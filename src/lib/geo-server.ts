import geoip from 'geoip-lite'

export function getCountryFromRequest(request: Request): string | null {
  const code =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    request.headers.get('x-country-code')

  if (!code || code === 'XX' || code === 'T1') return null
  return code.toUpperCase()
}

export function getClientIpFromRequest(request: Request): string | null {
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) return normalizeIp(cfIp.trim())

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return normalizeIp(first)
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return normalizeIp(realIp.trim())

  return null
}

function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('127.')) return true
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('169.254.')) return true
  if (ip.startsWith('172.')) {
    const second = Number.parseInt(ip.split('.')[1] ?? '', 10)
    if (second >= 16 && second <= 31) return true
  }
  return false
}

export function lookupCountryFromIp(ip: string | null | undefined): string | null {
  if (!ip || isPrivateIp(ip)) return null
  const geo = geoip.lookup(ip)
  if (!geo?.country) return null
  return geo.country.toUpperCase()
}

export function resolveGeoFromRequest(request: Request): {
  country: string | null
  ip: string | null
} {
  const ip = getClientIpFromRequest(request)
  const country = getCountryFromRequest(request) ?? lookupCountryFromIp(ip)
  return { country, ip }
}
