import { beforeEach, describe, expect, it, vi } from 'vitest'

// Les helpers serveur chargent Prisma (et, via retention-sweep, la suppression
// de compte) : remplacés ici, on ne teste que la logique, pas le SQL.
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { user: { count: vi.fn() } },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/user-activity-server', () => ({ deleteUserAccount: vi.fn() }))
// auth-server (importé pour GUEST_SESSION_DAYS) lit les cookies de Next.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

import type { Prisma } from '@prisma/client'
import {
  accountDeleteLogDetail,
  accountKind,
  ACCOUNT_DELETE_ANONYMIZED_DETAIL,
  GUEST_SESSION_DAYS_CLIENT,
  GUEST_STALE_DAYS,
  guestLastActivityAt,
  isGuestProbablyLost,
  isGuestPurgeOverdue,
  NEUTRAL_ACCOUNT_DELETE_DETAILS,
  parseAccountDeleteLogDetail,
  type AccountKind,
} from '@/lib/account-kind'
import {
  accountKindWhere,
  computeGuestPurgeAt,
  countAccountsByKind,
  describeAccount,
  escapeLikePattern,
  kindOfAccount,
  LISTED_ACCOUNT_KINDS,
  looksLikeIpQuery,
  NON_LEGACY_ACCOUNT_WHERE,
} from '@/lib/account-kind-server'
import { GUEST_SESSION_DAYS } from '@/lib/auth-server'
import { GUEST_INACTIVITY_DAYS, ORPHAN_GUEST_INACTIVITY_DAYS } from '@/lib/retention-sweep'

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-13T12:00:00.000Z')
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * DAY_MS)
/** Jour AAAA-MM-JJ, tel que servi par les routes (à midi UTC, jour UTC = jour de Paris). */
const dayFromNow = (days: number) => daysFromNow(days).toISOString().slice(0, 10)

describe('accountKind', () => {
  const base = { isGuest: false, email: null, hasPassword: false, hasValidSession: false }

  it('teste isGuest AVANT le mot de passe : un invité n’est jamais « Google »', () => {
    expect(accountKind({ ...base, isGuest: true, hasValidSession: true })).toBe('guest')
    // Même avec un email ou un hash (état incohérent), le drapeau invité prime.
    expect(
      accountKind({ isGuest: true, email: 'x@y.fr', hasPassword: true, hasValidSession: true })
    ).toBe('guest')
  })

  it('classe orphelin un invité sans aucune session valide', () => {
    expect(accountKind({ ...base, isGuest: true, hasValidSession: false })).toBe('guest_orphan')
  })

  it('distingue mot de passe et Google, sans tenir compte des sessions', () => {
    expect(accountKind({ ...base, email: 'a@b.fr', hasPassword: true })).toBe('password')
    expect(accountKind({ ...base, email: 'a@b.fr', hasPassword: false })).toBe('google')
    expect(
      accountKind({ ...base, email: 'a@b.fr', hasPassword: false, hasValidSession: true })
    ).toBe('google')
  })

  it('garde un compte Google qui a posé un mot de passe parmi les comptes à mot de passe', () => {
    expect(accountKind({ ...base, email: 'a@b.fr', hasPassword: true })).toBe('password')
  })

  it('réserve legacy au compte sans email et non invité, même avec un mot de passe', () => {
    expect(accountKind(base)).toBe('legacy')
    expect(accountKind({ ...base, hasValidSession: true })).toBe('legacy')
    // Même partition que NON_LEGACY_ACCOUNT_WHERE : sans email, le hash ne
    // suffit pas à en faire un compte « mot de passe ».
    expect(accountKind({ ...base, hasPassword: true })).toBe('legacy')
  })
})

describe('isGuestProbablyLost', () => {
  const now = NOW.getTime()
  const iso = (days: number) => daysFromNow(days).toISOString()

  it('vaut le délai de la purge des orphelins', () => {
    expect(GUEST_STALE_DAYS).toBe(ORPHAN_GUEST_INACTIVITY_DAYS)
  })

  it('recopie la durée de session d’un invité du serveur', () => {
    expect(GUEST_SESSION_DAYS_CLIENT).toBe(GUEST_SESSION_DAYS)
  })

  it('signale un invité à session valide muet depuis plus de 7 jours', () => {
    expect(
      isGuestProbablyLost({ kind: 'guest', lastSeenAt: iso(-8), createdAt: iso(-30) }, now)
    ).toBe(true)
    expect(
      isGuestProbablyLost({ kind: 'guest', lastSeenAt: iso(-6), createdAt: iso(-30) }, now)
    ).toBe(false)
  })

  it('ping bloqué : une session renouvelée hier prouve l’usage malgré un lastSeenAt figé', () => {
    // /api/auth/me a prolongé la session (échéance à +90 j, servie au jour
    // près) sans toucher lastSeenAt, vieux de 20 jours.
    expect(
      isGuestProbablyLost(
        { kind: 'guest', lastSeenAt: iso(-20), createdAt: iso(-60), sessionExpiresAt: dayFromNow(90) },
        now
      )
    ).toBe(false)
    // Dernier renouvellement il y a une dizaine de jours : de nouveau suspect.
    expect(
      isGuestProbablyLost(
        { kind: 'guest', lastSeenAt: iso(-20), createdAt: iso(-60), sessionExpiresAt: dayFromNow(80) },
        now
      )
    ).toBe(true)
  })

  it('date la dernière activité par le plus récent des deux signaux, jamais trop tôt', () => {
    const day = dayFromNow(85)
    // Échéance au jour près : on retient la fin du jour (renouvellement au plus tard).
    expect(guestLastActivityAt({ lastSeenAt: iso(-20), createdAt: iso(-60), sessionExpiresAt: day })).toBe(
      Date.parse(day) + DAY_MS - GUEST_SESSION_DAYS_CLIENT * DAY_MS
    )
    expect(guestLastActivityAt({ lastSeenAt: iso(-2), createdAt: iso(-60), sessionExpiresAt: day })).toBe(
      daysFromNow(-2).getTime()
    )
    expect(guestLastActivityAt({ lastSeenAt: 'n/a', createdAt: 'n/a', sessionExpiresAt: null })).toBeNull()
  })

  it('se rabat sur la date de création quand le compte n’a jamais été vu', () => {
    expect(isGuestProbablyLost({ kind: 'guest', lastSeenAt: null, createdAt: iso(-10) }, now)).toBe(true)
    expect(isGuestProbablyLost({ kind: 'guest', lastSeenAt: null, createdAt: iso(-1) }, now)).toBe(false)
  })

  it('ne concerne que le type invité (l’orphelin est déjà dit perdu)', () => {
    for (const kind of ['guest_orphan', 'password', 'google', 'legacy'] as const) {
      expect(isGuestProbablyLost({ kind, lastSeenAt: iso(-60), createdAt: iso(-90) }, now)).toBe(false)
    }
  })

  it('reste faux sur une date illisible', () => {
    expect(isGuestProbablyLost({ kind: 'guest', lastSeenAt: 'n/a', createdAt: 'n/a' }, now)).toBe(false)
  })
})

describe('isGuestPurgeOverdue', () => {
  it('ne signale une purge en retard qu’une fois son jour de Paris passé', () => {
    expect(isGuestPurgeOverdue('2026-09-12', NOW)).toBe(true)
    expect(isGuestPurgeOverdue('2026-09-13', NOW)).toBe(false)
    expect(isGuestPurgeOverdue('2026-09-19', NOW)).toBe(false)
    // 23:30 UTC le 13 = 01:30 le 14 à Paris : le 13 est passé.
    expect(isGuestPurgeOverdue('2026-09-13', new Date('2026-09-13T23:30:00.000Z'))).toBe(true)
  })
})

describe('computeGuestPurgeAt', () => {
  const guest = {
    isGuest: true,
    lastSeenAt: daysFromNow(-2),
    createdAt: daysFromNow(-40),
    sessionExpiresAt: null,
    banType: null,
    hasOpenReport: false,
  }

  it('ne date rien pour un compte ordinaire', () => {
    expect(computeGuestPurgeAt({ ...guest, isGuest: false })).toBeNull()
  })

  it('orphelin : dernière activité + 7 jours', () => {
    expect(computeGuestPurgeAt(guest)).toEqual(daysFromNow(-2 + ORPHAN_GUEST_INACTIVITY_DAYS))
  })

  it('orphelin jamais vu : création + 7 jours', () => {
    expect(computeGuestPurgeAt({ ...guest, lastSeenAt: null })).toEqual(
      daysFromNow(-40 + ORPHAN_GUEST_INACTIVITY_DAYS)
    )
  })

  it('orphelin banni ou signalé : exclu de la purge à 7 jours, il suit celle à 90 jours', () => {
    const expected = daysFromNow(-2 + GUEST_INACTIVITY_DAYS)
    expect(computeGuestPurgeAt({ ...guest, banType: 'permanent' })).toEqual(expected)
    expect(computeGuestPurgeAt({ ...guest, hasOpenReport: true })).toEqual(expected)
  })

  it('invité actif : jamais avant l’échéance de sa session glissante', () => {
    const sessionExpiresAt = daysFromNow(-2 + 91)
    expect(computeGuestPurgeAt({ ...guest, sessionExpiresAt })).toEqual(sessionExpiresAt)
  })

  it('invité à session de 30 jours fixes qui ne revient pas : supprimé à son échéance, pas à 90 jours', () => {
    const sessionExpiresAt = daysFromNow(27)
    expect(computeGuestPurgeAt({ ...guest, sessionExpiresAt })).toEqual(sessionExpiresAt)
  })

  it('invité signalé à session courte : la purge à 90 jours reste le plancher', () => {
    expect(
      computeGuestPurgeAt({ ...guest, sessionExpiresAt: daysFromNow(27), hasOpenReport: true })
    ).toEqual(daysFromNow(-2 + GUEST_INACTIVITY_DAYS))
  })
})

describe('describeAccount / kindOfAccount', () => {
  const account = {
    isGuest: false,
    email: 'a@b.fr',
    passwordHash: '',
    sessions: [] as Array<{ expiresAt: Date }>,
    lastSeenAt: daysFromNow(-1),
    createdAt: daysFromNow(-100),
    banType: null,
    abuseReportsReceived: [] as Array<{ id: string }>,
  }

  it('déduit le type du hash sans jamais le renvoyer', () => {
    expect(kindOfAccount(account)).toBe('google')
    expect(kindOfAccount({ ...account, passwordHash: '$2a$12$x' })).toBe('password')
    const described = describeAccount({ ...account, passwordHash: '$2a$12$x' })
    expect(JSON.stringify(described)).not.toContain('$2a$')
  })

  it('compte ordinaire : échéance de session servie au jour près, aucune date de purge', () => {
    const expiresAt = new Date('2026-10-12T14:32:17.123Z')
    expect(describeAccount({ ...account, sessions: [{ expiresAt }] })).toEqual({
      kind: 'google',
      isGuest: false,
      hasValidSession: true,
      // Jour de Paris, sans l'heure : elle redonnerait celle d'une visite.
      sessionExpiresAt: '2026-10-12',
      guestPurgeAt: null,
    })
  })

  it('arrondit l’échéance au jour de Paris, pas au jour UTC', () => {
    const described = describeAccount({
      ...account,
      sessions: [{ expiresAt: new Date('2026-10-12T22:30:00.000Z') }],
    })
    expect(described.sessionExpiresAt).toBe('2026-10-13')
  })

  it('invité orphelin : aucune session, purge datée au jour près', () => {
    expect(describeAccount({ ...account, email: null, isGuest: true })).toEqual({
      kind: 'guest_orphan',
      isGuest: true,
      hasValidSession: false,
      sessionExpiresAt: null,
      guestPurgeAt: dayFromNow(-1 + ORPHAN_GUEST_INACTIVITY_DAYS),
    })
  })

  it('invité orphelin signalé : purge à 90 jours', () => {
    const described = describeAccount({
      ...account,
      email: null,
      isGuest: true,
      abuseReportsReceived: [{ id: 'r1' }],
    })
    expect(described.guestPurgeAt).toBe(dayFromNow(-1 + GUEST_INACTIVITY_DAYS))
  })
})

describe('accountKindWhere / countAccountsByKind', () => {
  beforeEach(() => {
    prismaMock.user.count.mockReset()
  })

  it('exige un email hors invités et départage sur le hash', () => {
    expect(accountKindWhere('password', NOW)).toEqual({
      isGuest: false,
      email: { not: null },
      passwordHash: { not: '' },
    })
    expect(accountKindWhere('google', NOW)).toEqual({
      isGuest: false,
      email: { not: null },
      passwordHash: '',
    })
  })

  it('sépare invités et orphelins sur les sessions valides à l’instant donné', () => {
    expect(accountKindWhere('guest', NOW)).toEqual({
      isGuest: true,
      sessions: { some: { expiresAt: { gt: NOW } } },
    })
    expect(accountKindWhere('guest_orphan', NOW)).toEqual({
      isGuest: true,
      sessions: { none: { expiresAt: { gt: NOW } } },
    })
  })

  it('les prédicats Prisma découpent les comptes exactement comme kindOfAccount (16 combinaisons)', () => {
    type Row = {
      isGuest: boolean
      email: string | null
      passwordHash: string
      sessions: Array<{ expiresAt: Date }>
    }
    // Évaluateur en mémoire, limité aux opérateurs employés par les
    // prédicats : il juge leur SENS, pas la forme exacte des objets — un
    // prédicat affaibli (hash oublié, email oublié) compterait un compte deux
    // fois ou pas du tout, et ce test échouerait.
    const matchValue = (value: unknown, condition: unknown): boolean => {
      if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
        return Object.entries(condition as Record<string, unknown>).every(([op, expected]) => {
          if (op === 'not') return value !== expected
          if (op === 'gt') return (value as Date).getTime() > (expected as Date).getTime()
          throw new Error(`opérateur non géré : ${op}`)
        })
      }
      return value === condition
    }
    const evaluate = (row: Row, where: Prisma.UserWhereInput): boolean =>
      Object.entries(where).every(([field, condition]) => {
        if (field === 'OR') {
          return (condition as Prisma.UserWhereInput[]).some((sub) => evaluate(row, sub))
        }
        if (field === 'AND') {
          return (condition as Prisma.UserWhereInput[]).every((sub) => evaluate(row, sub))
        }
        if (field === 'sessions') {
          const { some, none } = condition as {
            some?: { expiresAt: unknown }
            none?: { expiresAt: unknown }
          }
          const filter = some ?? none
          if (!filter) throw new Error('filtre de relation non géré')
          const found = row.sessions.some((session) => matchValue(session.expiresAt, filter.expiresAt))
          return some ? found : !found
        }
        return matchValue(row[field as keyof Row], condition)
      })

    let combinations = 0
    for (const isGuest of [false, true]) {
      for (const email of [null, 'a@b.fr']) {
        for (const passwordHash of ['', '$2a$12$x']) {
          for (const validSession of [false, true]) {
            combinations += 1
            // En base : une session valide, ou seulement une session échue.
            const row: Row = {
              isGuest,
              email,
              passwordHash,
              sessions: [{ expiresAt: daysFromNow(validSession ? 1 : -1) }],
            }
            // kindOfAccount lit les sessions déjà filtrées par validSessionsSelect.
            const kind: AccountKind = kindOfAccount({ ...row, sessions: validSession ? row.sessions : [] })
            const matched = LISTED_ACCOUNT_KINDS.filter((candidate) =>
              evaluate(row, accountKindWhere(candidate, NOW))
            )
            const label = JSON.stringify({ isGuest, email, passwordHash, validSession })
            expect(matched, label).toEqual(kind === 'legacy' ? [] : [kind])
            expect(evaluate(row, NON_LEGACY_ACCOUNT_WHERE), label).toBe(kind !== 'legacy')
          }
        }
      }
    }
    expect(combinations).toBe(16)
  })

  it('total = somme des quatre types', async () => {
    const byKind: Record<string, number> = { password: 15, google: 7, guest: 4, guest_orphan: 2 }
    prismaMock.user.count.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const kind = (['password', 'google', 'guest', 'guest_orphan'] as const).find(
        (candidate) => JSON.stringify(accountKindWhere(candidate, NOW)) === JSON.stringify(where)
      )
      return kind ? byKind[kind] : -1
    })

    await expect(countAccountsByKind(NOW)).resolves.toEqual({
      total: 28,
      password: 15,
      google: 7,
      guest: 4,
      guestOrphan: 2,
    })
    expect(prismaMock.user.count).toHaveBeenCalledTimes(4)
  })
})

describe('accountDeleteLogDetail', () => {
  it('ne garde que le type et le rôle, en détail neutre traduit à la lecture', () => {
    expect(accountDeleteLogDetail('guest', 'user')).toBe('guest:user')
    expect(accountDeleteLogDetail('password', 'moderator')).toBe('password:moderator')
    expect(accountDeleteLogDetail('guest_orphan', 'user')).toBe('guest_orphan:user')
    // Rôle inconnu en base : ramené à un rôle connu, jamais recopié.
    expect(accountDeleteLogDetail('google', 'pirate')).toBe('google:user')
  })

  it('relit un détail neutre, et rien d’autre', () => {
    expect(parseAccountDeleteLogDetail('guest_orphan:superadmin')).toEqual({
      kind: 'guest_orphan',
      role: 'superadmin',
    })
    for (const detail of [
      ACCOUNT_DELETE_ANONYMIZED_DETAIL,
      'compte supprimé (type : invité, rôle : Joueur)',
      'diablo (LP-NNCRCK) — a@b.fr',
      'robot:user',
      'guest:pirate',
      '',
      null,
    ]) {
      expect(parseAccountDeleteLogDetail(detail)).toBeNull()
    }
  })

  it('admet en base les seuls détails neutres et la forme anonymisée', () => {
    expect(NEUTRAL_ACCOUNT_DELETE_DETAILS).toContain(ACCOUNT_DELETE_ANONYMIZED_DETAIL)
    expect(NEUTRAL_ACCOUNT_DELETE_DETAILS).toContain('guest:user')
    for (const detail of NEUTRAL_ACCOUNT_DELETE_DETAILS) {
      if (detail !== ACCOUNT_DELETE_ANONYMIZED_DETAIL) {
        expect(parseAccountDeleteLogDetail(detail)).not.toBeNull()
      }
    }
  })
})

describe('recherche de comptes : garde IP et échappement LIKE', () => {
  it('reconnaît une IPv6 (même partielle) à son « : »', () => {
    expect(looksLikeIpQuery('2a01:cb00:')).toBe(true)
    expect(looksLikeIpQuery('::1')).toBe(true)
  })

  it('reconnaît une IPv4, même partielle', () => {
    expect(looksLikeIpQuery('192.168.1.12')).toBe(true)
    expect(looksLikeIpQuery('192.168')).toBe(true)
    expect(looksLikeIpQuery('10.')).toBe(true)
  })

  it('ne prend pas un pseudo, un code ou un nombre seul pour une IP', () => {
    for (const query of ['diablo', 'ad', 'fe', 'c9', '12', 'LP-NNCRCK', 'jean.dupont', 'a.b']) {
      expect(looksLikeIpQuery(query)).toBe(false)
    }
  })

  it('échappe %, _ et le caractère d’échappement', () => {
    expect(escapeLikePattern('1_2%3')).toBe('1!_2!%3')
    expect(escapeLikePattern('a!b')).toBe('a!!b')
    expect(escapeLikePattern('192.168.1.1')).toBe('192.168.1.1')
  })
})
