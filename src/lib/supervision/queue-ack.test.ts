import { afterEach, describe, expect, it, vi } from 'vitest'
import { acknowledgeQueueItem } from './queue-ack'

/**
 * La file « à traiter » ne retire un élément qu'une fois acquitté : la
 * requête doit donc REJETER quand le serveur refuse, au lieu de passer pour
 * réussie quel que soit le statut.
 */

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('acknowledgeQueueItem', () => {
  it('retour : passe « résolu » par PATCH ; succès → promesse tenue', async () => {
    const fetchMock = respond(200, { ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await expect(acknowledgeQueueItem({ kind: 'feedback', targetId: 'f1' }, 'refusé')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/feedback/f1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) })
    )
  })

  it('pseudos suspects : POST sur ack-name-flag', async () => {
    const fetchMock = respond(200, { ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await acknowledgeQueueItem({ kind: 'name-flag', targetId: 'u1' }, 'refusé')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/u1/ack-name-flag', expect.objectContaining({ method: 'POST' }))
  })

  it('refus du serveur : rejette avec son message', async () => {
    vi.stubGlobal('fetch', respond(403, { error: 'Accès refusé' }))
    await expect(acknowledgeQueueItem({ kind: 'name-flag', targetId: 'u1' }, 'refusé')).rejects.toThrow('Accès refusé')
    vi.stubGlobal('fetch', respond(404, { error: 'Compte introuvable' }))
    await expect(acknowledgeQueueItem({ kind: 'name-flag', targetId: 'u1' }, 'refusé')).rejects.toThrow(
      'Compte introuvable'
    )
  })

  it('refus sans message lisible (page d’erreur d’un proxy) : rejette avec le repli', async () => {
    vi.stubGlobal('fetch', respond(502, '<html>Bad gateway</html>'))
    await expect(acknowledgeQueueItem({ kind: 'feedback', targetId: 'f1' }, 'Modification refusée')).rejects.toThrow(
      'Modification refusée'
    )
    vi.stubGlobal('fetch', respond(500, {}))
    await expect(acknowledgeQueueItem({ kind: 'feedback', targetId: 'f1' }, 'Modification refusée')).rejects.toThrow(
      'Modification refusée'
    )
  })

  it('réseau coupé : rejette', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    await expect(acknowledgeQueueItem({ kind: 'feedback', targetId: 'f1' }, 'refusé')).rejects.toThrow()
  })
})
