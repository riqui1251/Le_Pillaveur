import geoip from 'geoip-lite'

/** Code pays ISO 3166-1 alpha-2, tel que Cloudflare l'écrit (majuscules). */
const COUNTRY_CODE = /^[A-Z]{2}$/

/**
 * Pays posé par Cloudflare (CF-IPCountry), et lui seul. Les en-têtes
 * x-vercel-ip-country et x-country-code ne sont plus lus : le site n'est pas
 * hébergé chez Vercel, et ni Cloudflare ni Caddy ne les posent ni ne les
 * retirent — n'importe quel client pouvait donc y écrire le pays de son choix,
 * lu AVANT celui de Cloudflare.
 *
 * Seul un code de deux lettres majuscules est accepté : XX (pays inconnu de
 * Cloudflare) et T1 (réseau Tor) donnent null, comme toute valeur hors format,
 * et resolveGeoFromRequest se rabat alors sur geoip-lite.
 */
export function getCountryFromRequest(request: Request): string | null {
  const code = request.headers.get('cf-ipcountry')?.trim()
  if (!code || !COUNTRY_CODE.test(code) || code === 'XX') return null
  return code
}

export function getClientIpFromRequest(request: Request): string | null {
  // CF-Connecting-IP d'abord : Cloudflare y écrit l'adresse du visiteur et
  // écrase toute valeur envoyée par le client. On ne peut s'y fier QUE si
  // aucune requête HTTP n'atteint l'application sans passer par Cloudflare.
  // Vérifié en production le 13/09/2026 (`sudo ufw status`) : les ports 80 et
  // 443 ne sont ouverts qu'aux plages d'adresses de Cloudflare (IPv4 et IPv6,
  // scripts/vps-ufw-cloudflare.sh), aucune règle 80/443 « Anywhere » ; le
  // conteneur n'écoute que sur 127.0.0.1, derrière Caddy (scripts/prod-deploy.sh).
  // Seuls les ports du relais TURN sont ouverts à tous : l'adresse de l'origine
  // n'est pas secrète (api/rtc/credentials la donne), c'est bien le pare-feu
  // qui protège cet en-tête. Si 80/443 s'ouvraient un jour hors de Cloudflare
  // (règle UFW élargie, port du conteneur publié, abandon de Cloudflare), cet
  // en-tête deviendrait falsifiable — historique d'IP et limites de débit
  // (rate-limit.ts) compris : il faudrait alors retirer cette lecture et s'en
  // tenir à X-Forwarded-For, réécrit par Caddy (trusted_proxies,
  // scripts/vps-caddy-cloudflare.sh).
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
