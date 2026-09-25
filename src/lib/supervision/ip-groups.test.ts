import { describe, expect, it } from 'vitest'
import { networkGroupsOf } from '@/lib/supervision/ip-groups'

describe('networkGroupsOf', () => {
  it('IPv4 : chaque adresse forme son propre réseau (CGNAT, pas de /24)', () => {
    const groups = networkGroupsOf([
      { ip: '90.12.34.56', country: 'FR', firstSeenAt: '2026-09-01T10:00:00.000Z', lastSeenAt: '2026-09-02T10:00:00.000Z' },
      { ip: '90.12.34.57', country: 'FR', firstSeenAt: '2026-09-03T10:00:00.000Z', lastSeenAt: '2026-09-04T10:00:00.000Z' },
    ])
    expect(groups.map((g) => [g.key, g.family, g.entries.length])).toEqual([
      ['90.12.34.57', 'ipv4', 1],
      ['90.12.34.56', 'ipv4', 1],
    ])
  })

  it('IPv6 : les adresses temporaires d’un même /64 ne font qu’un réseau', () => {
    const groups = networkGroupsOf([
      { ip: '2a01:cb05:545:a200::1', country: 'FR', firstSeenAt: '2026-09-01T10:00:00.000Z', lastSeenAt: '2026-09-01T12:00:00.000Z' },
      { ip: '2A01:CB05:0545:A200:dead:beef:0:2', country: 'FR', firstSeenAt: '2026-09-05T10:00:00.000Z', lastSeenAt: '2026-09-06T10:00:00.000Z' },
      { ip: '2a01:cb05:545:a201::1', country: 'BE', firstSeenAt: '2026-09-02T10:00:00.000Z', lastSeenAt: '2026-09-03T10:00:00.000Z' },
    ])
    expect(groups).toHaveLength(2)
    const [home, other] = groups
    expect(home.key).toBe('2a01:cb05:0545:a200::/64')
    expect(home.family).toBe('ipv6')
    expect(home.entries.map((e) => e.ip)).toEqual(['2A01:CB05:0545:A200:dead:beef:0:2', '2a01:cb05:545:a200::1'])
    // Première vue du réseau = la plus ancienne de ses adresses.
    expect(home.firstSeenAt).toBe('2026-09-01T10:00:00.000Z')
    expect(home.lastSeenAt).toBe('2026-09-06T10:00:00.000Z')
    expect(other.key).toBe('2a01:cb05:0545:a201::/64')
    expect(other.countries).toEqual(['BE'])
  })

  it('une IPv4 vue à travers une pile IPv6 rejoint son IPv4', () => {
    const groups = networkGroupsOf([
      { ip: '::ffff:90.12.34.56', country: 'FR', firstSeenAt: '2026-09-01T10:00:00.000Z', lastSeenAt: '2026-09-01T11:00:00.000Z' },
      { ip: '90.12.34.56', country: 'FR', firstSeenAt: '2026-09-02T10:00:00.000Z', lastSeenAt: '2026-09-02T11:00:00.000Z' },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('90.12.34.56')
    expect(groups[0].family).toBe('ipv4')
  })

  it('entrée de repli sans première vue : sa dernière vue en tient lieu', () => {
    const groups = networkGroupsOf([{ ip: '10.0.0.1', country: null, lastSeenAt: '2026-09-10T08:00:00.000Z' }])
    expect(groups[0].entries[0].firstSeenAt).toBe('2026-09-10T08:00:00.000Z')
    expect(groups[0].firstSeenAt).toBe('2026-09-10T08:00:00.000Z')
    expect(groups[0].countries).toEqual([])
  })

  it('historique vide : aucun groupe', () => {
    expect(networkGroupsOf([])).toEqual([])
  })
})
