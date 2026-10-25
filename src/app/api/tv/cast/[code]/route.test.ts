import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUT / DELETE /api/tv/cast/[code] — l'état d'affichage d'un jeu local
 * diffusé sur une TV. Vraie route, base et session simulées. Ce qu'on tient :
 * le corps est borné AVANT d'être matérialisé (comme à la création), un corps
 * illisible n'efface plus l'état, les mises à jour sont plafonnées par compte,
 * et une écriture venue d'un autre site est refusée.
 */

const { db, currentUserMock } = vi.hoisted(() => ({
  db: {
    onlineRoom: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))

import { DELETE, PUT } from './route'
import { MAX_CAST_BODY_BYTES } from '@/lib/cast-types'

const CODE = 'CAST23'

/** Un compte neuf par test : le quota vit dans le processus. */
let seq = 0
const newHost = () => {
  seq += 1
  const id = `host-${seq}`
  currentUserMock.mockResolvedValue({ id })
  db.onlineRoom.findUnique.mockResolvedValue({ id: 'room-cast', status: 'cast', hostUserId: id })
  return id
}

const put = (body: string, headers: Record<string, string> = {}) =>
  PUT(
    new Request(`http://localhost/api/tv/cast/${CODE}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    }),
    { params: Promise.resolve({ code: CODE }) }
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  db.onlineRoom.update.mockResolvedValue({})
  db.onlineRoom.delete.mockResolvedValue({})
})

describe('PUT /api/tv/cast/[code]', () => {
  it('état valide : écrit tel quel', async () => {
    newHost()
    const res = await put(JSON.stringify({ state: '{"castKind":"pmu"}' }))
    expect(res.status).toBe(200)
    expect(db.onlineRoom.update.mock.calls[0][0].data.gameStateJson).toBe('{"castKind":"pmu"}')
  })

  it('état de 5 Mo : 413, rien d’écrit', async () => {
    newHost()
    const res = await put(JSON.stringify({ state: 'x'.repeat(5 * 1024 * 1024) }))
    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('payload_too_large')
    expect(db.onlineRoom.update).not.toHaveBeenCalled()
  })

  it('juste sous le plafond de la création : accepté', async () => {
    newHost()
    const state = 'x'.repeat(MAX_CAST_BODY_BYTES - 100)
    expect((await put(JSON.stringify({ state }))).status).toBe(200)
  })

  it('corps illisible : 400, l’état en place n’est pas effacé', async () => {
    newHost()
    const res = await put('{pas du json')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_json')
    expect(db.onlineRoom.update).not.toHaveBeenCalled()
  })

  it('plafond par compte : au-delà de 300 mises à jour par minute, 429', async () => {
    newHost()
    const statuses: number[] = []
    for (let i = 0; i < 301; i += 1) statuses.push((await put(JSON.stringify({ state: `${i}` }))).status)
    expect(statuses.slice(0, 300).every((s) => s === 200)).toBe(true)
    expect(statuses[300]).toBe(429)
    expect(db.onlineRoom.update).toHaveBeenCalledTimes(300)
  })

  it('pas le créateur : 403, rien d’écrit', async () => {
    newHost()
    db.onlineRoom.findUnique.mockResolvedValue({ id: 'room-cast', status: 'cast', hostUserId: 'autre' })
    const res = await put(JSON.stringify({ state: 'x' }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
    expect(db.onlineRoom.update).not.toHaveBeenCalled()
  })

  it('sans compte : 401', async () => {
    currentUserMock.mockResolvedValue(null)
    const res = await put(JSON.stringify({ state: 'x' }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('auth_required')
  })

  it('écriture venue d’un autre site : 403 cross_site_request', async () => {
    newHost()
    const res = await put(JSON.stringify({ state: 'x' }), { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('cross_site_request')
    expect(db.onlineRoom.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/tv/cast/[code]', () => {
  const del = () =>
    DELETE(new Request(`http://localhost/api/tv/cast/${CODE}`, { method: 'DELETE' }), {
      params: Promise.resolve({ code: CODE }),
    })

  it('le créateur ferme sa salle', async () => {
    newHost()
    expect((await del()).status).toBe(200)
    expect(db.onlineRoom.delete).toHaveBeenCalledWith({ where: { id: 'room-cast' } })
  })

  it('double fermeture (arrêt + démontage) : la seconde reçoit 404 en JSON, pas une page 500', async () => {
    newHost()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.onlineRoom.delete.mockRejectedValueOnce(Object.assign(new Error('absent'), { code: 'P2025' }))
    const res = await del()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('not_found')
  })
})
