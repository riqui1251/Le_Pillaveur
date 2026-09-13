/**
 * RÉSEAU d'une adresse IP, calculé à la lecture — module PUR, importable côté
 * client comme côté serveur. Aucune donnée nouvelle, rien de stocké.
 *
 * Une box IPv6 change seule d'adresse (adresses temporaires, renouvelées
 * environ chaque jour) : six adresses d'un même /64 faisaient afficher
 * « +5 IP », comme s'il s'agissait de six lieux. On regroupe donc l'IPv6 par
 * /64. L'IPv4 reste l'adresse entière : les mobiles sont derrière du CGNAT, un
 * /24 y rassemblerait des inconnus.
 *
 * « Même réseau » veut dire même foyer ou même lieu (bar, colocation), JAMAIS
 * « même personne » : sur un site de jeux de soirée, c'est l'usage normal.
 * Le préfixe se calcule sur l'adresse DÉVELOPPÉE : un préfixe textuel sur la
 * forme compressée (« :: », zéros omis, majuscules) n'est pas fiable.
 */

export type IpFamily = 'ipv4' | 'ipv6'

export type IpNetworkGroup<T> = {
  /** Clé de réseau : IPv4 entière, ou « xxxx:xxxx:xxxx:xxxx::/64 ». */
  key: string
  family: IpFamily
  /** Adresses du réseau, de la plus récemment vue à la plus ancienne. */
  entries: T[]
  /** Première vue du réseau (la plus ancienne de ses adresses). */
  firstSeenAt: string
  /** Dernière vue du réseau (la plus récente de ses adresses). */
  lastSeenAt: string
  /** Pays distincts, dans l'ordre des adresses (le plus récent d'abord). */
  countries: string[]
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const HEX_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i

/** Octets d'une IPv4 pointée, ou null (octet > 255, forme invalide). */
function parseIpv4(value: string): number[] | null {
  const match = IPV4_PATTERN.exec(value)
  if (!match) return null
  const octets = match.slice(1).map(Number)
  return octets.every((octet) => octet <= 255) ? octets : null
}

/** Groupes hexadécimaux d'une moitié (avant ou après « :: »), IPv4 finale permise. */
function parseIpv6Part(part: string, allowTrailingIpv4: boolean): number[] | null {
  if (part === '') return []
  const tokens = part.split(':')
  const groups: number[] = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const isLast = i === tokens.length - 1
    // Forme mixte « ::ffff:1.2.3.4 » : l'IPv4 ne peut occuper que la fin.
    if (isLast && allowTrailingIpv4 && token.includes('.')) {
      const octets = parseIpv4(token)
      if (!octets) return null
      groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3])
      continue
    }
    if (!HEX_GROUP_PATTERN.test(token)) return null
    groups.push(Number.parseInt(token, 16))
  }
  return groups
}

/** Les 8 groupes de 16 bits d'une IPv6 (« :: » développé), ou null si invalide. */
function parseIpv6(value: string): number[] | null {
  // Identifiant de zone (« fe80::1%eth0 ») : sans effet sur le réseau.
  const address = value.split('%')[0]
  const halves = address.split('::')
  if (halves.length > 2) return null

  if (halves.length === 1) {
    const groups = parseIpv6Part(address, true)
    return groups && groups.length === 8 ? groups : null
  }

  const head = parseIpv6Part(halves[0], false)
  const tail = parseIpv6Part(halves[1], true)
  if (!head || !tail) return null
  // « :: » remplace au moins un groupe nul.
  const missing = 8 - head.length - tail.length
  if (missing < 1) return null
  return [...head, ...new Array<number>(missing).fill(0), ...tail]
}

/**
 * Clé de réseau d'une adresse :
 * - IPv6 → 4 premiers groupes développés, « 2a01:cb05:0545:a200::/64 » ;
 * - IPv4 mappée (« ::ffff:1.2.3.4 », quelle que soit l'écriture) → « 1.2.3.4 » ;
 * - IPv4 → l'adresse entière (pas de /24 : CGNAT) ;
 * - chaîne invalide → renvoyée telle quelle (elle forme son propre groupe).
 */
export function ipNetworkKey(ip: string): string {
  const value = ip.trim()

  const ipv4 = parseIpv4(value)
  if (ipv4) return ipv4.join('.')

  if (!value.includes(':')) return ip
  const groups = parseIpv6(value)
  if (!groups) return ip

  // ::ffff:0:0/96 : une IPv4 vue à travers une pile IPv6.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.')
  }

  const prefix = groups
    .slice(0, 4)
    .map((group) => group.toString(16).padStart(4, '0'))
    .join(':')
  return `${prefix}::/64`
}

function familyOf(ip: string, key: string): IpFamily {
  if (key.endsWith('::/64')) return 'ipv6'
  // Chaîne invalide renvoyée telle quelle : les deux-points trahissent une IPv6 abîmée.
  return parseIpv4(key) || !ip.includes(':') ? 'ipv4' : 'ipv6'
}

/** Instant d'une date ISO pour le tri ; illisible = le plus ancien possible. */
function timeOf(iso: string): number {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/**
 * Regroupe un historique d'adresses par réseau. Groupes triés par dernière
 * vue décroissante, adresses de chaque groupe aussi. Aucune fusion entre
 * sujets : l'appelant passe UN historique (compte OU navigateur), jamais les
 * deux mêlés.
 */
export function groupIpsByNetwork<
  T extends { ip: string; country: string | null; firstSeenAt: string; lastSeenAt: string },
>(entries: T[]): IpNetworkGroup<T>[] {
  const sorted = [...entries].sort((a, b) => timeOf(b.lastSeenAt) - timeOf(a.lastSeenAt))
  const groups = new Map<string, IpNetworkGroup<T>>()

  for (const entry of sorted) {
    const key = ipNetworkKey(entry.ip)
    const group = groups.get(key)
    if (!group) {
      groups.set(key, {
        key,
        family: familyOf(entry.ip, key),
        entries: [entry],
        firstSeenAt: entry.firstSeenAt,
        lastSeenAt: entry.lastSeenAt,
        countries: entry.country ? [entry.country] : [],
      })
      continue
    }
    group.entries.push(entry)
    // Entrées parcourues de la plus récente à la plus ancienne : lastSeenAt
    // est déjà juste, seule la première vue peut reculer.
    if (timeOf(entry.firstSeenAt) < timeOf(group.firstSeenAt)) {
      group.firstSeenAt = entry.firstSeenAt
    }
    if (entry.country && !group.countries.includes(entry.country)) {
      group.countries.push(entry.country)
    }
  }

  // La Map garde l'ordre d'insertion, donc celui de la dernière vue.
  return [...groups.values()]
}
