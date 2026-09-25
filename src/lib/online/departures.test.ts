import { describe, expect, it } from 'vitest'
import {
  DEPARTURE_TTL_MS,
  MAX_DEPARTURES,
  departureCount,
  forgetDeparture,
  recordDeparture,
  takeDeparture,
} from './departures'

/**
 * Le registre est une Map de processus (globalThis) : elle survit d'un test à
 * l'autre. Chaque test prend donc ses propres comptes, et l'horloge est
 * injectée — jamais d'attente réelle.
 */
let seq = 0
const nextUser = () => `dep-user-${++seq}`

const T0 = new Date('2026-09-25T21:00:00Z').getTime()

describe('registre des départs forcés', () => {
  it('rend la raison du départ de CETTE table, une seule fois', () => {
    const user = nextUser()
    recordDeparture(user, 'room-1', 'kicked', T0)

    expect(takeDeparture(user, 'room-1', T0 + 1000)).toBe('kicked')
    // Consommée : le sondage suivant retombe sur le message générique.
    expect(takeDeparture(user, 'room-1', T0 + 2000)).toBeNull()
  })

  it('ne répond rien pour une autre table, et garde la raison pour la bonne', () => {
    const user = nextUser()
    recordDeparture(user, 'room-a', 'absent', T0)

    expect(takeDeparture(user, 'room-b', T0 + 1000)).toBeNull()
    expect(takeDeparture(user, 'room-a', T0 + 2000)).toBe('absent')
  })

  it('oublie une raison périmée (TTL)', () => {
    const user = nextUser()
    recordDeparture(user, 'room-1', 'rematched_without_you', T0)

    expect(takeDeparture(user, 'room-1', T0 + DEPARTURE_TTL_MS)).toBeNull()
  })

  it('garde une raison juste sous le TTL', () => {
    const user = nextUser()
    recordDeparture(user, 'room-1', 'replaced_by_bot', T0)

    expect(takeDeparture(user, 'room-1', T0 + DEPARTURE_TTL_MS - 1)).toBe('replaced_by_bot')
  })

  it('la raison la plus récente remplace l’autre', () => {
    const user = nextUser()
    recordDeparture(user, 'room-1', 'kicked', T0)
    recordDeparture(user, 'room-2', 'absent', T0 + 1000)

    expect(takeDeparture(user, 'room-1', T0 + 2000)).toBeNull()
    expect(takeDeparture(user, 'room-2', T0 + 2000)).toBe('absent')
  })

  it('un retour à la table efface la raison de CETTE table seulement', () => {
    const user = nextUser()
    recordDeparture(user, 'room-1', 'kicked', T0)

    forgetDeparture(user, 'room-2')
    expect(takeDeparture(user, 'room-1', T0 + 1000)).toBe('kicked')

    recordDeparture(user, 'room-1', 'kicked', T0 + 2000)
    forgetDeparture(user, 'room-1')
    expect(takeDeparture(user, 'room-1', T0 + 3000)).toBeNull()
  })

  it('reste borné : au-delà du plafond, la plus ancienne raison saute', () => {
    const first = nextUser()
    recordDeparture(first, 'room-x', 'absent', T0)
    for (let i = 0; i < MAX_DEPARTURES + 10; i++) {
      recordDeparture(nextUser(), 'room-x', 'absent', T0 + 1 + i)
    }

    expect(departureCount()).toBeLessThanOrEqual(MAX_DEPARTURES)
    expect(takeDeparture(first, 'room-x', T0 + MAX_DEPARTURES + 20)).toBeNull()
  })

  it('les raisons périmées se purgent à l’enregistrement suivant', () => {
    // Une heure après les tests précédents : leurs raisons sont périmées aussi.
    const t1 = T0 + 60 * 60 * 1000
    for (let i = 0; i < 5; i++) recordDeparture(nextUser(), 'room-y', 'kicked', t1)
    const later = t1 + DEPARTURE_TTL_MS + 1
    recordDeparture(nextUser(), 'room-y', 'kicked', later)

    // Tout ce qui précède date de plus de 10 min : il ne reste que le dernier.
    expect(departureCount()).toBe(1)
  })
})
