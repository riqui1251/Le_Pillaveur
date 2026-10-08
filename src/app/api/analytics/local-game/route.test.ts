import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GAMES } from '@/lib/games'

/**
 * POST /api/analytics/local-game — compteurs anonymes des parties locales.
 * Vraie route, vrais quotas (rate-limit.ts, en mémoire), base simulée :
 * réponses nues, aucune donnée personnelle écrite, aucune session lue, refus
 * d'un autre site, jeux en ligne et corps hors contrat refusés, quotas par
 * réseau puis global.
 */

const { localGameDailyDb, sessionReader } = vi.hoisted(() => ({
  localGameDailyDb: { upsert: vi.fn() },
  sessionReader: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { localGameDaily: localGameDailyDb } }))
// La route ne doit RIEN lire de la session : tout appel serait une fuite.
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: sessionReader, getCurrentSession: sessionReader }))

const LOCAL_ID = GAMES.find((g) => !g.hidden && !g.onlineOnly)!.id
const ONLINE_ONLY_ID = GAMES.find((g) => g.onlineOnly)!.id

/**
 * Chaque test a son réseau : les compteurs de quota vivent en mémoire pour
 * tout le fichier, ils ne doivent pas déborder d'un test à l'autre.
 */
let seq = 0
let ip = ''

type RouteModule = typeof import('./route')
let route: RouteModule

const send = (body: unknown, headers: Record<string, string> = {}, from = ip) =>
  route.POST(
    new Request('http://test/api/analytics/local-game', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
        cookie: 'lp_session=secret; lp_vid=visiteur',
        'x-forwarded-for': from,
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

beforeEach(async () => {
  vi.clearAllMocks()
  seq += 1
  ip = `198.51.100.${seq}`
  localGameDailyDb.upsert.mockResolvedValue({})
  route ??= await import('./route')
})

describe('compteur pris', () => {
  it('204 sans corps, et seulement le jour, le jeu et un compteur écrits', async () => {
    const res = await send({ gameId: LOCAL_ID, event: 'start' })

    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect(localGameDailyDb.upsert).toHaveBeenCalledTimes(1)
    const args = localGameDailyDb.upsert.mock.calls[0][0]
    expect(Object.keys(args.create).sort()).toEqual(['day', 'ends', 'gameId', 'starts'])
    expect(args.create).toMatchObject({ gameId: LOCAL_ID, starts: 1, ends: 0 })
    expect(args.update).toEqual({ starts: { increment: 1 } })
    // Ni IP, ni cookie, ni session : rien de la requête n'est recopié.
    const written = JSON.stringify(args)
    expect(written).not.toContain(ip)
    expect(written).not.toContain('secret')
    expect(written).not.toContain('visiteur')
    expect(sessionReader).not.toHaveBeenCalled()
  })

  it('une fin incrémente les fins', async () => {
    const res = await send({ gameId: LOCAL_ID, event: 'end' })
    expect(res.status).toBe(204)
    expect(localGameDailyDb.upsert.mock.calls[0][0].update).toEqual({ ends: { increment: 1 } })
  })

  it('un envoi sans Sec-Fetch-Site (ancien navigateur, beacon) passe', async () => {
    const res = await route.POST(
      new Request('http://test/api/analytics/local-game', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
        body: JSON.stringify({ gameId: LOCAL_ID, event: 'end' }),
      })
    )
    expect(res.status).toBe(204)
  })
})

describe('refus nus, rien d’écrit', () => {
  it('envoi depuis un autre site : 403', async () => {
    const res = await send({ gameId: LOCAL_ID, event: 'start' }, { 'sec-fetch-site': 'cross-site' })
    expect(res.status).toBe(403)
    expect(await res.text()).toBe('')
    expect(localGameDailyDb.upsert).not.toHaveBeenCalled()
  })

  it('jeu en ligne uniquement, jeu inconnu, événement inconnu, JSON illisible : 400', async () => {
    for (const body of [
      { gameId: ONLINE_ONLY_ID, event: 'start' },
      { gameId: 'jeu-inconnu', event: 'start' },
      { gameId: LOCAL_ID, event: 'abandon' },
      '{pas du json',
      '',
    ]) {
      const res = await send(body)
      expect(res.status).toBe(400)
      expect(await res.text()).toBe('')
    }
    expect(localGameDailyDb.upsert).not.toHaveBeenCalled()
  })

  it('corps trop gros : 413, sans le lire', async () => {
    const res = await send({ gameId: LOCAL_ID, event: 'start', padding: 'x'.repeat(600) })
    expect(res.status).toBe(413)
    expect(localGameDailyDb.upsert).not.toHaveBeenCalled()
  })

  it('panne de la base : 500 générique, sans détail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localGameDailyDb.upsert.mockRejectedValue(new Error('database is locked'))

    const res = await send({ gameId: LOCAL_ID, event: 'start' })

    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('locked')
    errorSpy.mockRestore()
  })
})

describe('quotas', () => {
  it('60 événements par heure et par réseau, puis 429 nu ; un autre réseau passe', async () => {
    for (let i = 0; i < 60; i += 1) {
      expect((await send({ gameId: LOCAL_ID, event: 'end' })).status).toBe(204)
    }
    const refused = await send({ gameId: LOCAL_ID, event: 'end' })
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await refused.text()).toBe('')
    expect(localGameDailyDb.upsert).toHaveBeenCalledTimes(60)

    expect((await send({ gameId: LOCAL_ID, event: 'end' }, {}, '203.0.113.200')).status).toBe(204)
  })

  it('plafond global de 1200 par heure, que les refus par réseau n’entament pas', async () => {
    // Module neuf : compteurs en mémoire remis à zéro, quota global compris.
    vi.resetModules()
    route = await import('./route')
    const body = { gameId: LOCAL_ID, event: 'start' }

    // Un réseau qui insiste : 60 acceptés, 40 refusés — hors du plafond commun.
    for (let i = 0; i < 100; i += 1) await send(body, {}, '192.0.2.1')
    // 19 autres réseaux × 60 : avec les 60 premiers, le plafond tout juste atteint.
    for (let n = 0; n < 19; n += 1) {
      for (let i = 0; i < 60; i += 1) {
        expect((await send(body, {}, `10.0.${n}.1`)).status).toBe(204)
      }
    }
    expect(localGameDailyDb.upsert).toHaveBeenCalledTimes(1200)

    // Réseau neuf, quota propre intact : refusé par le plafond global.
    expect((await send(body, {}, '10.9.9.9')).status).toBe(429)
    expect(localGameDailyDb.upsert).toHaveBeenCalledTimes(1200)
  })

  it('les corps invalides n’entament pas le plafond global, seulement le quota de leur réseau', async () => {
    vi.resetModules()
    route = await import('./route')
    // 20 réseaux × 60 corps vides ou hors contrat : 1200 requêtes, toutes 400.
    for (let n = 0; n < 20; n += 1) {
      for (let i = 0; i < 60; i += 1) {
        const body = i % 2 === 0 ? '' : { gameId: '1220x', event: 'end' }
        expect((await send(body, {}, `10.1.${n}.1`)).status).toBe(400)
      }
    }
    // Le plafond commun est intact : un vrai envoi passe.
    expect((await send({ gameId: LOCAL_ID, event: 'end' }, {}, '10.8.8.8')).status).toBe(204)
    expect(localGameDailyDb.upsert).toHaveBeenCalledTimes(1)
  })
})
