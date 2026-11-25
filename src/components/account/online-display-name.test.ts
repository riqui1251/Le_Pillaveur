import { afterEach, describe, expect, it, vi } from 'vitest'
import { patchOnlineDisplayName } from './online-display-name'

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('patchOnlineDisplayName', () => {
  it('envoie le pseudo à la route du compte, session comprise', async () => {
    const fetchMock = respond(200, { ok: true, onlineDisplayName: 'Riton' })
    await expect(patchOnlineDisplayName('Riton')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/online-display-name', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ onlineDisplayName: 'Riton' }),
    })
  })

  it('rend la phrase de refus déjà traduite par le serveur, pas le code', async () => {
    respond(409, { error: 'Ce pseudo est déjà utilisé', code: 'display_name_taken' })
    await expect(patchOnlineDisplayName('Riton')).resolves.toEqual({ ok: false, error: 'Ce pseudo est déjà utilisé' })
  })

  it('rend le code de l’enveloppe des routes tel quel, pour apiErrorMessage', async () => {
    respond(401, { error: 'auth_required' })
    await expect(patchOnlineDisplayName('Riton')).resolves.toEqual({ ok: false, error: 'auth_required' })
  })

  it('un corps illisible ou sans refus exploitable ne donne aucune valeur', async () => {
    respond(500, 'pas du json')
    await expect(patchOnlineDisplayName('Riton')).resolves.toEqual({ ok: false, error: undefined })
    respond(400, { error: { detail: 'objet' } })
    await expect(patchOnlineDisplayName('Riton')).resolves.toEqual({ ok: false, error: undefined })
  })
})
