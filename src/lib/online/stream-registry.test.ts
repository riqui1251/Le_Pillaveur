import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_STREAMS_PER_USER,
  MAX_TV_STREAMS_PER_NETWORK,
  MAX_TV_STREAMS_TOTAL,
  acquireStream,
  acquireTvStream,
  resetStreamRegistry,
  streamCounts,
  tvStreamCounts,
} from './stream-registry'

/**
 * Le registre compte des flux VIVANTS : ce sont les libérations (et non le
 * temps qui passe) qui rendent des places. Les tests vérifient donc surtout
 * qu'aucune place ne fuit — un flux perdu, c'est un joueur bloqué jusqu'au
 * redémarrage du conteneur.
 */
describe('registre des flux SSE', () => {
  beforeEach(() => {
    resetStreamRegistry()
  })

  it('accepte jusqu’au plafond puis refuse', () => {
    const releases = []
    for (let i = 0; i < MAX_STREAMS_PER_USER; i += 1) {
      const release = acquireStream('u1')
      expect(release).not.toBeNull()
      releases.push(release)
    }
    expect(acquireStream('u1')).toBeNull()
    expect(streamCounts().total).toBe(MAX_STREAMS_PER_USER)
  })

  it('une libération rend une place, et une seule', () => {
    const releases = Array.from({ length: MAX_STREAMS_PER_USER }, () => acquireStream('u1')!)
    expect(acquireStream('u1')).toBeNull()

    releases[0]()
    // Rejouée (abort + enqueue en échec + cancel sur le même flux) : la
    // libération est idempotente, elle ne doit pas offrir deux places.
    releases[0]()
    releases[0]()

    expect(acquireStream('u1')).not.toBeNull()
    expect(acquireStream('u1')).toBeNull()
  })

  it('compte chaque compte séparément', () => {
    for (let i = 0; i < MAX_STREAMS_PER_USER; i += 1) acquireStream('u1')
    expect(acquireStream('u1')).toBeNull()
    expect(acquireStream('u2')).not.toBeNull()
    expect(streamCounts()).toEqual({
      total: MAX_STREAMS_PER_USER + 1,
      accounts: 2,
      maxPerAccount: MAX_STREAMS_PER_USER,
    })
  })

  it('un compte revenu à zéro ne laisse aucune trace', () => {
    const release = acquireStream('u1')!
    release()
    expect(streamCounts()).toEqual({ total: 0, accounts: 0, maxPerAccount: 0 })
  })

  it('la photo ne porte que des nombres (aucun identifiant de compte)', () => {
    acquireStream('u1')
    expect(Object.keys(streamCounts()).sort()).toEqual(['accounts', 'maxPerAccount', 'total'])
    expect(JSON.stringify(streamCounts())).not.toContain('u1')
  })
})

describe('registre des flux TV (publics, par réseau)', () => {
  beforeEach(() => {
    resetStreamRegistry()
  })

  it('plafond par réseau : un réseau plein n’empêche pas les autres', () => {
    for (let i = 0; i < MAX_TV_STREAMS_PER_NETWORK; i += 1) {
      expect(acquireTvStream('net-a')).not.toBeNull()
    }
    expect(acquireTvStream('net-a')).toBeNull()
    expect(acquireTvStream('net-b')).not.toBeNull()
    expect(tvStreamCounts()).toEqual({ total: MAX_TV_STREAMS_PER_NETWORK + 1, networks: 2 })
  })

  it('plafond global, quel que soit le nombre de réseaux', () => {
    for (let i = 0; i < MAX_TV_STREAMS_TOTAL; i += 1) {
      expect(acquireTvStream(`net-${i}`)).not.toBeNull()
    }
    expect(acquireTvStream('net-neuf')).toBeNull()
    expect(tvStreamCounts().total).toBe(MAX_TV_STREAMS_TOTAL)
  })

  it('libération idempotente, et un réseau revenu à zéro ne laisse aucune trace', () => {
    const releases = Array.from({ length: MAX_TV_STREAMS_PER_NETWORK }, () => acquireTvStream('net-a')!)
    releases[0]()
    releases[0]()
    expect(acquireTvStream('net-a')).not.toBeNull()
    expect(acquireTvStream('net-a')).toBeNull()

    resetStreamRegistry()
    const release = acquireTvStream('net-a')!
    release()
    expect(tvStreamCounts()).toEqual({ total: 0, networks: 0 })
  })

  it('les flux TV ne prennent pas de place aux comptes, ni l’inverse', () => {
    for (let i = 0; i < MAX_STREAMS_PER_USER; i += 1) acquireStream('u1')
    expect(acquireTvStream('net-a')).not.toBeNull()
    expect(streamCounts().total).toBe(MAX_STREAMS_PER_USER)
    expect(tvStreamCounts().total).toBe(1)
  })
})
