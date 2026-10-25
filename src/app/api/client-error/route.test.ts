import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_ERROR_NETWORK_DAILY_CREATE_CAP } from '@/lib/client-errors-server'

/**
 * POST /api/client-error — plantages côté joueur, route publique. Vraie
 * route, vrais quotas (rate-limit.ts, en mémoire), base simulée : un seul
 * réseau qui envoie des rapports distincts au rythme permis par la route
 * (10/min) ne crée qu'une part du plafond journalier commun — les vrais
 * plantages des autres réseaux sont encore gardés.
 */

const { clientErrorDb } = vi.hoisted(() => ({
  clientErrorDb: { updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { clientError: clientErrorDb } }))

type RouteModule = typeof import('./route')
let route: RouteModule

const report = (message: string) => ({
  name: 'TypeError',
  message,
  digest: null,
  path: '/fr/jeux',
  buildSha: 'abc1234',
  locale: 'fr',
})

const send = (body: unknown, from: string) =>
  route.POST(
    new Request('http://test/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': from },
      body: JSON.stringify(body),
    })
  )

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T20:00:00Z'))
  clientErrorDb.updateMany.mockResolvedValue({ count: 0 })
  clientErrorDb.count.mockImplementation(async () => clientErrorDb.create.mock.calls.length)
  clientErrorDb.create.mockResolvedValue({})
  vi.resetModules()
  route = await import('./route')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('part du plafond journalier par réseau', () => {
  it('rapports distincts depuis un seul réseau pendant 2 h : seule sa part est créée', async () => {
    let sent = 0
    for (let minute = 0; minute < 120; minute += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 20, minute, 0)))
      for (let i = 0; i < 10; i += 1) {
        expect((await send(report(`bruit ${sent}`), '203.0.113.66')).status).toBe(204)
        sent += 1
      }
    }
    expect(clientErrorDb.create).toHaveBeenCalledTimes(CLIENT_ERROR_NETWORK_DAILY_CREATE_CAP)

    // Le vrai plantage d'un autre réseau est encore gardé.
    expect((await send(report('Cannot read properties of undefined'), '198.51.100.20')).status).toBe(204)
    expect(clientErrorDb.create).toHaveBeenCalledTimes(CLIENT_ERROR_NETWORK_DAILY_CREATE_CAP + 1)
    expect(clientErrorDb.create.mock.calls.at(-1)![0].data.message).toBe('Cannot read properties of undefined')
  })

  it('une plage IPv6 /64 compte pour un seul réseau', async () => {
    let sent = 0
    for (let minute = 0; minute < 10; minute += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 20, minute, 0)))
      for (let i = 0; i < 10; i += 1) {
        await send(report(`bruit ${sent}`), `2001:db8:9:9::${(sent + 1).toString(16)}`)
        sent += 1
      }
    }
    expect(clientErrorDb.create).toHaveBeenCalledTimes(CLIENT_ERROR_NETWORK_DAILY_CREATE_CAP)
  })
})
