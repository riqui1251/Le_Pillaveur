import { describe, expect, it } from 'vitest'
import { groupIpsByNetwork, ipNetworkKey } from '@/lib/ip-network'

describe('ipNetworkKey — IPv6 réduite au /64', () => {
  it('développe une adresse compressée (« :: » et zéros omis)', () => {
    expect(ipNetworkKey('2a01:cb05:545:a200:1c2d:3e4f:5a6b:7c8d')).toBe('2a01:cb05:0545:a200::/64')
    expect(ipNetworkKey('2001:db8::1')).toBe('2001:0db8:0000:0000::/64')
    expect(ipNetworkKey('2001:db8:0:1::')).toBe('2001:0db8:0000:0001::/64')
    expect(ipNetworkKey('fe80::')).toBe('fe80:0000:0000:0000::/64')
  })

  it('donne la même clé à l’écriture développée, compressée ou en majuscules', () => {
    const key = '2a01:cb05:0545:a200::/64'
    expect(ipNetworkKey('2a01:cb05:0545:a200:0000:0000:0000:0001')).toBe(key)
    expect(ipNetworkKey('2A01:CB05:545:A200::1')).toBe(key)
    expect(ipNetworkKey('2a01:cb05:545:a200::')).toBe(key)
    expect(ipNetworkKey(' 2a01:cb05:545:a200::abcd ')).toBe(key)
  })

  it('place correctement « :: » en tête ou au milieu du préfixe', () => {
    expect(ipNetworkKey('::')).toBe('0000:0000:0000:0000::/64')
    expect(ipNetworkKey('::1')).toBe('0000:0000:0000:0000::/64')
    expect(ipNetworkKey('2001::5:6:7:8')).toBe('2001:0000:0000:0000::/64')
    expect(ipNetworkKey('1:2::7:8')).toBe('0001:0002:0000:0000::/64')
    expect(ipNetworkKey('1:2:3:4:5::8')).toBe('0001:0002:0003:0004::/64')
  })

  it('ignore l’identifiant de zone', () => {
    expect(ipNetworkKey('fe80::1%eth0')).toBe('fe80:0000:0000:0000::/64')
  })

  it('accepte une IPv4 finale dans une IPv6 non mappée', () => {
    expect(ipNetworkKey('64:ff9b::192.0.2.33')).toBe('0064:ff9b:0000:0000::/64')
  })
})

describe('ipNetworkKey — IPv4', () => {
  it('garde l’adresse entière (pas de /24 : CGNAT)', () => {
    expect(ipNetworkKey('203.0.113.7')).toBe('203.0.113.7')
    expect(ipNetworkKey('203.0.113.8')).toBe('203.0.113.8')
  })

  it('ramène une IPv4 mappée à l’adresse IPv4, quelle que soit l’écriture', () => {
    expect(ipNetworkKey('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(ipNetworkKey('::FFFF:203.0.113.7')).toBe('203.0.113.7')
    expect(ipNetworkKey('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(ipNetworkKey('::ffff:cb00:7107')).toBe('203.0.113.7')
  })

  it('normalise les zéros non significatifs', () => {
    expect(ipNetworkKey('010.001.000.009')).toBe('10.1.0.9')
  })
})

describe('ipNetworkKey — chaîne invalide renvoyée telle quelle', () => {
  it.each([
    '',
    'inconnue',
    '256.1.1.1',
    '1.2.3',
    '1:2:3:4:5:6:7',
    '1:2:3:4:5:6:7:8:9',
    '1::2::3',
    ':::',
    '1:2:3:4:5:6:7::8',
    '12345::1',
    'g::1',
    ':1:2:3:4:5:6:7',
    '1.2.3.4::1',
    '::ffff:300.1.1.1',
  ])('%j', (value) => {
    expect(ipNetworkKey(value)).toBe(value)
  })
})

type Entry = { ip: string; country: string | null; firstSeenAt: string; lastSeenAt: string }

const entry = (ip: string, firstSeenAt: string, lastSeenAt: string, country: string | null = 'FR'): Entry => ({
  ip,
  country,
  firstSeenAt,
  lastSeenAt,
})

describe('groupIpsByNetwork', () => {
  it('rassemble les 6 adresses temporaires d’une même box en 1 réseau', () => {
    // Cas de la capture de l'exploitant (« +5 IP ») : six IPv6 du même /64,
    // vues du 7 au 10/09, écrites de façons différentes (compression, casse).
    const ips = [
      entry('2a01:cb05:545:a200:a1b2:c3d4:e5f6:1', '2026-09-08T09:00:00.000Z', '2026-09-08T22:00:00.000Z'),
      entry('2a01:cb05:545:a200::2', '2026-09-10T10:00:00.000Z', '2026-09-10T16:08:00.000Z'),
      entry('2A01:CB05:0545:A200:1:2:3:4', '2026-09-07T17:28:00.000Z', '2026-09-07T23:00:00.000Z'),
      entry('2a01:cb05:545:a200:9::9', '2026-09-09T08:00:00.000Z', '2026-09-09T12:00:00.000Z'),
      entry('2a01:cb05:545:a200:ffff:eeee:dddd:cccc', '2026-09-09T13:00:00.000Z', '2026-09-09T23:30:00.000Z'),
      entry('2a01:cb05:545:a200:0:0:0:abcd', '2026-09-10T08:00:00.000Z', '2026-09-10T09:00:00.000Z'),
    ]

    const groups = groupIpsByNetwork(ips)

    expect(groups).toHaveLength(1)
    const [group] = groups
    expect(group.key).toBe('2a01:cb05:0545:a200::/64')
    expect(group.family).toBe('ipv6')
    expect(group.entries).toHaveLength(6)
    expect(group.firstSeenAt).toBe('2026-09-07T17:28:00.000Z')
    expect(group.lastSeenAt).toBe('2026-09-10T16:08:00.000Z')
    expect(group.countries).toEqual(['FR'])
    // Adresses de la plus récente à la plus ancienne.
    expect(group.entries.map((e) => e.lastSeenAt)).toEqual([
      '2026-09-10T16:08:00.000Z',
      '2026-09-10T09:00:00.000Z',
      '2026-09-09T23:30:00.000Z',
      '2026-09-09T12:00:00.000Z',
      '2026-09-08T22:00:00.000Z',
      '2026-09-07T23:00:00.000Z',
    ])
  })

  it('sépare les réseaux et les trie par dernière vue décroissante', () => {
    const groups = groupIpsByNetwork([
      entry('203.0.113.7', '2026-09-01T10:00:00.000Z', '2026-09-05T10:00:00.000Z'),
      entry('2001:db8:1:1::1', '2026-09-02T10:00:00.000Z', '2026-09-12T19:28:00.000Z'),
      entry('203.0.113.8', '2026-09-03T10:00:00.000Z', '2026-09-06T10:00:00.000Z', 'BE'),
      entry('2001:db8:1:2::1', '2026-09-04T10:00:00.000Z', '2026-09-04T11:00:00.000Z'),
    ])

    expect(groups.map((g) => [g.key, g.family])).toEqual([
      ['2001:0db8:0001:0001::/64', 'ipv6'],
      ['203.0.113.8', 'ipv4'],
      ['203.0.113.7', 'ipv4'],
      ['2001:0db8:0001:0002::/64', 'ipv6'],
    ])
    expect(groups[1].countries).toEqual(['BE'])
  })

  it('range une IPv4 mappée avec la même IPv4 écrite normalement', () => {
    const groups = groupIpsByNetwork([
      entry('::ffff:198.51.100.4', '2026-09-01T10:00:00.000Z', '2026-09-02T10:00:00.000Z'),
      entry('198.51.100.4', '2026-09-03T10:00:00.000Z', '2026-09-04T10:00:00.000Z'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      key: '198.51.100.4',
      family: 'ipv4',
      firstSeenAt: '2026-09-01T10:00:00.000Z',
      lastSeenAt: '2026-09-04T10:00:00.000Z',
    })
    expect(groups[0].entries.map((e) => e.ip)).toEqual(['198.51.100.4', '::ffff:198.51.100.4'])
  })

  it('liste les pays distincts du plus récent au plus ancien, sans les vides', () => {
    const groups = groupIpsByNetwork([
      entry('2001:db8::1', '2026-09-01T10:00:00.000Z', '2026-09-01T11:00:00.000Z', 'FR'),
      entry('2001:db8::2', '2026-09-02T10:00:00.000Z', '2026-09-02T11:00:00.000Z', null),
      entry('2001:db8::3', '2026-09-03T10:00:00.000Z', '2026-09-03T11:00:00.000Z', 'CH'),
      entry('2001:db8::4', '2026-09-04T10:00:00.000Z', '2026-09-04T11:00:00.000Z', 'FR'),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].countries).toEqual(['FR', 'CH'])
  })

  it('laisse une adresse invalide seule dans son groupe', () => {
    const groups = groupIpsByNetwork([
      entry('inconnue', '2026-09-01T10:00:00.000Z', '2026-09-01T11:00:00.000Z'),
      entry('zz::1', '2026-09-02T10:00:00.000Z', '2026-09-02T11:00:00.000Z'),
    ])

    expect(groups.map((g) => [g.key, g.family])).toEqual([
      ['zz::1', 'ipv6'],
      ['inconnue', 'ipv4'],
    ])
  })

  it('conserve les champs propres à l’appelant et ne modifie pas l’entrée', () => {
    const ips = [
      { ...entry('192.0.2.1', '2026-09-01T10:00:00.000Z', '2026-09-01T11:00:00.000Z'), origin: 'account' as const },
      { ...entry('192.0.2.2', '2026-09-02T10:00:00.000Z', '2026-09-02T11:00:00.000Z'), origin: 'account' as const },
    ]
    const snapshot = ips.map((e) => e.ip)

    const groups = groupIpsByNetwork(ips)

    expect(groups[0].entries[0].origin).toBe('account')
    expect(ips.map((e) => e.ip)).toEqual(snapshot)
  })

  it('renvoie une liste vide sans adresse', () => {
    expect(groupIpsByNetwork([])).toEqual([])
  })
})
