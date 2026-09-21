import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_STREAMS_PER_USER,
  acquireStream,
  resetStreamRegistry,
  streamCounts,
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
