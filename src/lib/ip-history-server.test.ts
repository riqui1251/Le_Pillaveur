import { describe, expect, it, vi } from 'vitest'

// Le regroupement testé ici est PUR : aucune requête. Prisma est remplacé pour
// que l'import du module ne dépende pas d'une base.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  groupingSubjectKeys,
  groupVisitors,
  isPresenceConnectedHere,
  type IpEntry,
  type LinkedAccount,
  type VisitorPresence,
} from '@/lib/ip-history-server'
import { ONLINE_WINDOW_MS } from '@/lib/presence'

const NOW = new Date('2026-09-12T19:30:00.000Z').getTime()
const MIN = 60 * 1000
const DAY = 24 * 60 * MIN

const at = (offsetMs: number) => new Date(NOW - offsetMs)
const iso = (offsetMs: number) => at(offsetMs).toISOString()

function presence(p: Partial<VisitorPresence> & { visitorId: string }): VisitorPresence {
  return {
    userId: null,
    userSeenAt: null,
    country: 'FR',
    lastIp: null,
    lastDevice: 'pc',
    lastSeen: at(MIN),
    localPlayerCount: 0,
    localPlayerNames: null,
    ...p,
  }
}

function account(a: Partial<LinkedAccount> & { id: string; displayName: string }): LinkedAccount {
  return {
    email: null,
    accountCode: null,
    role: 'user',
    isGuest: false,
    passwordHash: '',
    sessions: [],
    lastSeenAt: null,
    localPlayersJson: null,
    ...a,
  }
}

function ip(address: string, lastSeenOffset: number, firstSeenOffset = lastSeenOffset): IpEntry {
  return { ip: address, country: 'FR', lastSeenAt: iso(lastSeenOffset), firstSeenAt: iso(firstSeenOffset) }
}

const VALID_SESSION = [{ expiresAt: new Date(NOW + 30 * DAY) }]

describe('isPresenceConnectedHere', () => {
  it('connecté seulement si le dernier ping lui-même portait la session (même date, sans marge)', () => {
    const lastSeen = at(MIN)
    const base = { userId: 'u1', lastSeen }
    expect(isPresenceConnectedHere({ ...base, userSeenAt: new Date(lastSeen.getTime()) })).toBe(true)
    // Un seul ping sans session après le dernier ping connecté suffit : une
    // marge prolongerait « connecté » sur la navigation d'un tiers (PC partagé).
    expect(isPresenceConnectedHere({ ...base, userSeenAt: new Date(lastSeen.getTime() - 1) })).toBe(false)
    expect(
      isPresenceConnectedHere({ ...base, userSeenAt: new Date(lastSeen.getTime() - ONLINE_WINDOW_MS) })
    ).toBe(false)
  })

  it('jamais connecté sans compte lié ou sans date de ping connecté (lignes antérieures)', () => {
    expect(isPresenceConnectedHere({ userId: null, userSeenAt: at(MIN), lastSeen: at(MIN) })).toBe(false)
    expect(isPresenceConnectedHere({ userId: 'u1', userSeenAt: null, lastSeen: at(MIN) })).toBe(false)
  })
})

describe('groupVisitors', () => {
  it('compte déconnecté (cas diablo) : carte du navigateur, dernier compte vu = invité orphelin', () => {
    const diablo = account({
      id: 'u-diablo',
      displayName: 'diablo',
      accountCode: 'LP-NNCRCK',
      isGuest: true,
      sessions: [],
      lastSeenAt: at(2 * DAY),
    })
    const pc = presence({
      visitorId: 'v-pc',
      userId: 'u-diablo',
      userSeenAt: at(2 * DAY),
      lastSeen: at(MIN),
      lastIp: '2a01:cb05:545:a200::99',
    })
    const accountIps = [ip('2a01:cb05:545:a200::1', 2 * DAY, 5 * DAY), ip('2a01:cb05:545:a200::2', 3 * DAY)]
    const browserIps = [ip('2a01:cb05:545:a200::99', MIN, DAY)]
    const ipsBySubject = new Map([
      ['user:u-diablo', accountIps],
      ['visitor:v-pc', browserIps],
    ])

    expect(groupingSubjectKeys([pc], [diablo])).toEqual(['visitor:v-pc'])

    const cards = groupVisitors([pc], [diablo], ipsBySubject, NOW)
    expect(cards).toHaveLength(1)
    const [card] = cards
    expect(card).toMatchObject({
      subjectKey: 'visitor:v-pc',
      cardType: 'browser',
      visitorId: 'v-pc',
      userId: null,
      displayName: null,
      email: null,
      accountCode: null,
      role: null,
      online: true,
      connectedHere: false,
      accountKind: 'guest_orphan',
      accountLastSeenAt: iso(2 * DAY),
      accountOnline: false,
      primaryIp: '2a01:cb05:545:a200::99',
      browserIps: [],
    })
    expect(card.lastAccount).toEqual({
      userId: 'u-diablo',
      displayName: 'diablo',
      accountCode: 'LP-NNCRCK',
      role: 'user',
      accountKind: 'guest_orphan',
      lastSeenAt: iso(2 * DAY),
    })
    // Les IP du compte (vues avant la déconnexion) ne sont pas rattachées au navigateur.
    expect(card.ips).toEqual(browserIps)
  })

  it('compte connecté sur deux navigateurs : une seule carte, IP hors connexion à part', () => {
    const alice = account({
      id: 'u-alice',
      displayName: 'Alice',
      email: 'alice@example.test',
      accountCode: 'LP-ALICE1',
      passwordHash: 'hash',
      sessions: VALID_SESSION,
      lastSeenAt: at(30 * 1000),
    })
    const phone = presence({
      visitorId: 'v-phone',
      userId: 'u-alice',
      userSeenAt: at(30 * 1000),
      lastSeen: at(30 * 1000),
      lastDevice: 'mobile',
    })
    const pc = presence({
      visitorId: 'v-pc',
      userId: 'u-alice',
      userSeenAt: at(2 * MIN),
      lastSeen: at(2 * MIN),
      lastDevice: 'pc',
    })
    const accountIps = [ip('90.1.1.1', 30 * 1000, DAY)]
    const ipsBySubject = new Map([
      ['user:u-alice', accountIps],
      ['visitor:v-phone', [ip('10.0.0.1', 3 * DAY, 4 * DAY), ip('10.0.0.2', 6 * DAY)]],
      // Même adresse vue hors connexion sur les deux navigateurs : une seule entrée.
      ['visitor:v-pc', [ip('10.0.0.1', 2 * DAY, 5 * DAY)]],
    ])

    expect(groupingSubjectKeys([phone, pc], [alice]).sort()).toEqual(
      ['user:u-alice', 'visitor:v-pc', 'visitor:v-phone'].sort()
    )

    const cards = groupVisitors([phone, pc], [alice], ipsBySubject, NOW)
    expect(cards).toHaveLength(1)
    const [card] = cards
    expect(card).toMatchObject({
      subjectKey: 'user:u-alice',
      cardType: 'account',
      visitorId: 'v-phone',
      lastDevice: 'mobile',
      userId: 'u-alice',
      displayName: 'Alice',
      email: 'alice@example.test',
      accountCode: 'LP-ALICE1',
      role: 'user',
      online: true,
      connectedHere: true,
      accountKind: 'password',
      accountLastSeenAt: iso(30 * 1000),
      accountOnline: true,
      lastAccount: null,
      primaryIp: '90.1.1.1',
      browserCount: 2,
    })
    expect(card.ips).toEqual(accountIps)
    expect(card.browserIps).toEqual([
      { ip: '10.0.0.1', country: 'FR', lastSeenAt: iso(2 * DAY), firstSeenAt: iso(5 * DAY) },
      ip('10.0.0.2', 6 * DAY),
    ])
    // Le hash sert au type, il n'est jamais renvoyé.
    expect(JSON.stringify(card)).not.toContain('hash')
  })

  it('navigateur jamais connecté : carte browser sans compte ni type', () => {
    const anon = presence({ visitorId: 'v-anon', lastSeen: at(10 * MIN), lastIp: '82.2.2.2' })
    const cards = groupVisitors(
      [anon],
      [],
      new Map([['visitor:v-anon', [ip('82.2.2.2', 10 * MIN)]]]),
      NOW
    )
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      subjectKey: 'visitor:v-anon',
      cardType: 'browser',
      userId: null,
      displayName: null,
      online: false,
      connectedHere: false,
      accountKind: null,
      accountLastSeenAt: null,
      accountOnline: false,
      lastAccount: null,
      primaryIp: '82.2.2.2',
      browserIps: [],
    })
  })

  it('IP jamais fusionnées : navigateur déconnecté d\'un compte actif ailleurs', () => {
    const bob = account({
      id: 'u-bob',
      displayName: 'Bob',
      email: 'bob@example.test',
      sessions: VALID_SESSION,
      lastSeenAt: at(MIN),
      localPlayersJson: JSON.stringify([{ name: 'Tonton' }]),
    })
    // Téléphone connecté ; PC familial déconnecté mais actif (un tiers y navigue).
    const phone = presence({ visitorId: 'v-phone', userId: 'u-bob', userSeenAt: at(MIN), lastSeen: at(MIN) })
    const familyPc = presence({
      visitorId: 'v-family',
      userId: 'u-bob',
      userSeenAt: at(DAY),
      lastSeen: at(30 * 1000),
    })
    const ipsBySubject = new Map([
      ['user:u-bob', [ip('2a01:e0a::1', MIN)]],
      ['visitor:v-phone', [ip('176.3.3.3', 20 * DAY)]],
      ['visitor:v-family', [ip('88.4.4.4', 30 * 1000)]],
    ])

    const cards = groupVisitors([phone, familyPc], [bob], ipsBySubject, NOW)
    expect(cards.map((c) => c.subjectKey)).toEqual(['visitor:v-family', 'user:u-bob'])

    const [family, bobCard] = cards
    expect(family).toMatchObject({
      cardType: 'browser',
      connectedHere: false,
      displayName: null,
      // Le compte est en ligne AILLEURS : jamais « connecté » sur ce navigateur.
      accountOnline: true,
      accountKind: 'google',
      localPlayerNames: [],
      ips: [ip('88.4.4.4', 30 * 1000)],
      browserIps: [],
    })
    expect(family.lastAccount?.userId).toBe('u-bob')

    // La carte du compte ne récupère pas les IP du PC familial.
    const allBobIps = [...bobCard.ips, ...bobCard.browserIps].map((e) => e.ip)
    expect(allBobIps).toEqual(['2a01:e0a::1', '176.3.3.3'])
    expect(allBobIps).not.toContain('88.4.4.4')
    expect(bobCard.browserIps.map((e) => e.ip)).toEqual(['176.3.3.3'])
  })

  it('IP et pays actuels = entrée la plus récente, historique du compte ou du navigateur', () => {
    const carol = account({ id: 'u-carol', displayName: 'Carol', sessions: VALID_SESSION, isGuest: true })
    const tablet = presence({
      visitorId: 'v-tab',
      userId: 'u-carol',
      userSeenAt: at(MIN),
      lastSeen: at(MIN),
      country: 'BE',
    })
    const cards = groupVisitors(
      [tablet],
      [carol],
      new Map([
        ['user:u-carol', [{ ...ip('91.5.5.5', 3 * DAY), country: 'FR' }]],
        ['visitor:v-tab', [{ ...ip('81.6.6.6', 2 * MIN), country: 'BE' }]],
      ]),
      NOW
    )
    expect(cards[0]).toMatchObject({
      cardType: 'account',
      accountKind: 'guest',
      primaryIp: '81.6.6.6',
      country: 'BE',
      browserCountry: 'BE',
      ips: [{ ...ip('91.5.5.5', 3 * DAY), country: 'FR' }],
      browserIps: [{ ...ip('81.6.6.6', 2 * MIN), country: 'BE' }],
    })
  })

  it('pays du navigateur : jamais celui d\'un autre appareil du compte', () => {
    const dan = account({ id: 'u-dan', displayName: 'Dan', sessions: VALID_SESSION, lastSeenAt: at(MIN) })
    // PC consentant en France, vu hier soir ; le compte joue aujourd'hui en
    // Espagne sur un téléphone sans consentement (historique user: seul).
    const pc = presence({ visitorId: 'v-pc', userId: 'u-dan', userSeenAt: at(DAY), lastSeen: at(DAY), country: 'FR' })
    const [card] = groupVisitors(
      [pc],
      [dan],
      new Map([['user:u-dan', [{ ...ip('83.7.7.7', MIN), country: 'ES' }]]]),
      NOW
    )
    expect(card).toMatchObject({ cardType: 'account', country: 'ES', browserCountry: 'FR', browserCount: 1 })
  })

  it('sans aucun historique d\'IP, repli sur la dernière IP et le pays du navigateur', () => {
    const anon = presence({ visitorId: 'v-x', lastIp: '1.2.3.4', country: 'CH' })
    const [card] = groupVisitors([anon], [], new Map(), NOW)
    expect(card).toMatchObject({ primaryIp: '1.2.3.4', country: 'CH', ips: [], browserIps: [] })
  })

  it('compte lié introuvable (supprimé entre-temps) : carte browser sans dernier compte', () => {
    const ghost = presence({ visitorId: 'v-g', userId: 'u-gone', userSeenAt: at(MIN), lastSeen: at(MIN) })
    const [card] = groupVisitors([ghost], [], new Map(), NOW)
    expect(card).toMatchObject({
      subjectKey: 'visitor:v-g',
      cardType: 'browser',
      connectedHere: false,
      lastAccount: null,
      accountKind: null,
    })
  })
})
