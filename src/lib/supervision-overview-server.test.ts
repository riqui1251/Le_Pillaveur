import { describe, expect, it, vi } from 'vitest'

// `summarizeOnlinePlay` est pure, mais le module importe prisma au chargement :
// on le neutralise pour tester la seule agrégation.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { summarizeOnlinePlay, type OnlinePlaySessionRow } from '@/lib/supervision-overview-server'

/**
 * Joueurs du jeu en ligne (Vue d'ensemble) : jours de PARIS justes le jour du
 * changement d'heure, équipe exclue des effectifs ET de la série, sièges sans
 * compte comptés à part. `now` = 25/10/2026 à 23 h 30, heure de Paris — le
 * jour où l'on repasse à l'heure d'hiver.
 */
const NOW = new Date('2026-10-25T22:30:00.000Z')

const player = (userId: string, isGuest = false) => ({ userId, user: { role: 'user', isGuest } })
const staff = (userId: string) => ({ userId, user: { role: 'admin', isGuest: false } })
const noAccount = { userId: null, user: null }

const session = (startedAt: string, humanSeats: OnlinePlaySessionRow['humanSeats'], humanCount = 1) => ({
  startedAt: new Date(startedAt),
  humanCount,
  humanSeats,
})

const SESSIONS: OnlinePlaySessionRow[] = [
  // 25/10 à 1 h 30 à Paris (encore à l'heure d'été) : aujourd'hui.
  session('2026-10-24T23:30:00.000Z', [player('u1')]),
  // 24/10 à 23 h 30 à Paris : hier, donc hors de « aujourd'hui ».
  session('2026-10-24T21:30:00.000Z', [player('g1', true)]),
  // 19/10 à 0 h 30 à Paris : premier jour des 7 derniers jours.
  session('2026-10-18T22:30:00.000Z', [player('u2')]),
  // 18/10 à 23 h 30 à Paris : juste hors des 7 jours, dans les 30.
  session('2026-10-18T21:30:00.000Z', [player('u3')]),
  // humanCount écrit à 1, mais deux humains à table (l'un jamais rattaché).
  session('2026-10-20T10:00:00.000Z', [player('u1'), noAccount], 1),
  // Partie de l'équipe seule (test de TryBotsGate) : hors de la série.
  session('2026-10-21T10:00:00.000Z', [staff('a1')]),
  // Équipe + joueur : une partie de joueur, avec un autre humain.
  session('2026-10-22T10:00:00.000Z', [staff('a1'), player('u2')], 2),
  // Au-delà des 30 jours de Paris : ignorée.
  session('2026-09-20T10:00:00.000Z', [player('u9')]),
]

describe('summarizeOnlinePlay', () => {
  const stats = summarizeOnlinePlay(SESSIONS, NOW)

  it('compte les comptes distincts sur 1, 7 et 30 jours de Paris, invités ventilés', () => {
    expect(stats.uniquePlayers).toEqual({
      d1: 1,
      d7: 3,
      d30: 4,
      guests: { d1: 0, d7: 1, d30: 1 },
    })
  })

  it('exclut l’équipe des effectifs et la compte à part', () => {
    expect(stats.staffExcluded).toBe(1)
  })

  it('compte à part les sièges humains sans compte', () => {
    expect(stats.deletedSeats30).toBe(1)
  })

  it('série de 14 jours de Paris distincts, sans doublon au changement d’heure', () => {
    const days = stats.launchesByDay.map((d) => d.day)
    expect(days).toHaveLength(14)
    expect(new Set(days).size).toBe(14)
    expect(days[0]).toBe('2026-10-12')
    expect(days[13]).toBe('2026-10-25')
  })

  it('classe solo / avec humains par sièges humains, et écarte les parties de l’équipe seule', () => {
    const byDay = new Map(stats.launchesByDay.map((d) => [d.day, d]))
    expect(byDay.get('2026-10-25')).toMatchObject({ solo: 1, withHumans: 0 })
    expect(byDay.get('2026-10-24')).toMatchObject({ solo: 1, withHumans: 0 })
    expect(byDay.get('2026-10-22')).toMatchObject({ solo: 0, withHumans: 1 })
    expect(byDay.get('2026-10-21')).toMatchObject({ solo: 0, withHumans: 0 })
    expect(byDay.get('2026-10-20')).toMatchObject({ solo: 0, withHumans: 1 })
    expect(byDay.get('2026-10-19')).toMatchObject({ solo: 1, withHumans: 0 })
    expect(byDay.get('2026-10-18')).toMatchObject({ solo: 1, withHumans: 0 })
  })
})
