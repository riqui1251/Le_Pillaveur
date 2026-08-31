import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { buildRankings, startOfCurrentParisWeek } from './rankings'

/**
 * Classement hebdo : la borne « lundi 00:00 heure de Paris » doit être
 * exacte quel que soit le fuseau de la machine (les attendus sont des
 * instants UTC absolus) et survivre aux changements d'heure été/hiver.
 */

describe('startOfCurrentParisWeek (lundi 00:00 Europe/Paris)', () => {
  it('hiver (UTC+1) : mercredi → lundi de la même semaine', () => {
    // Mercredi 14 janvier 2026, 10:00 UTC → lundi 12 janvier, minuit Paris.
    const start = startOfCurrentParisWeek(new Date('2026-01-14T10:00:00Z'))
    expect(start.toISOString()).toBe('2026-01-11T23:00:00.000Z')
  })

  it('été (UTC+2) : mercredi → lundi de la même semaine', () => {
    // Mercredi 1er juillet 2026 → lundi 29 juin, minuit Paris (offset +2).
    const start = startOfCurrentParisWeek(new Date('2026-07-01T12:00:00Z'))
    expect(start.toISOString()).toBe('2026-06-28T22:00:00.000Z')
  })

  it('dimanche 23:30 Paris : encore la semaine en cours', () => {
    // Dimanche 5 juillet 2026, 23:30 Paris (21:30 UTC).
    const start = startOfCurrentParisWeek(new Date('2026-07-05T21:30:00Z'))
    expect(start.toISOString()).toBe('2026-06-28T22:00:00.000Z')
  })

  it('lundi 00:30 Paris : la nouvelle semaine vient de commencer', () => {
    // Lundi 6 juillet 2026, 00:30 Paris = dimanche 22:30 UTC.
    const start = startOfCurrentParisWeek(new Date('2026-07-05T22:30:00Z'))
    expect(start.toISOString()).toBe('2026-07-05T22:00:00.000Z')
  })

  it("passage à l'heure d'été : l'offset est celui DU lundi, pas de maintenant", () => {
    // Dimanche 29 mars 2026 après le changement (Paris UTC+2) : le lundi
    // 23 mars de cette semaine était encore en heure d'hiver (UTC+1).
    const start = startOfCurrentParisWeek(new Date('2026-03-29T15:00:00Z'))
    expect(start.toISOString()).toBe('2026-03-22T23:00:00.000Z')
  })

  it("passage à l'heure d'hiver : lundi suivant le dernier dimanche d'octobre", () => {
    // Lundi 26 octobre 2026 (heure d'hiver revenue la veille) à 10:00 UTC.
    const start = startOfCurrentParisWeek(new Date('2026-10-26T10:00:00Z'))
    expect(start.toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })
})

describe('buildRankings (filtre de période)', () => {
  /** Client factice : capture le `where` du groupBy, ne touche aucune base. */
  const fakeClient = (captured: { where?: unknown }) =>
    ({
      onlineMatchResult: {
        groupBy: async (args: { where?: unknown }) => {
          captured.where = args.where
          return []
        },
      },
      user: { findMany: async () => [] },
    }) as unknown as PrismaClient

  it("period 'week' filtre finishedAt >= lundi Paris", async () => {
    const captured: { where?: { finishedAt?: { gte?: Date } } } = {}
    await buildRankings(fakeClient(captured), { gameId: null, viewerId: null, period: 'week' })
    const gte = captured.where?.finishedAt?.gte
    expect(gte).toBeInstanceOf(Date)
    expect(gte!.getTime()).toBe(startOfCurrentParisWeek().getTime())
  })

  it("period absent (rétro-compat) : aucun filtre de date", async () => {
    const captured: { where?: { finishedAt?: unknown } } = {}
    await buildRankings(fakeClient(captured), { gameId: 'quiz', viewerId: null })
    expect(captured.where).toEqual({ gameId: 'quiz' })
  })
})
