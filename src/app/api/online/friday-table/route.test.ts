import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/online/friday-table — table ouverte du vendredi.
 *
 * Publique (aucune session lue), lecture seule, rien de personnel : hors
 * soirée la base n'est pas interrogée ; pendant la soirée, une requête
 * bornée sur les tables PUBLIQUES d'Imposteur en attente encore habitées,
 * sans jointure sur les comptes, mise en cache 5 s. Vraie route, base
 * simulée, horloge figée (seul Date est simulé : les promesses tournent).
 */

const { db } = vi.hoisted(() => ({
  db: { onlineRoom: { findMany: vi.fn() } },
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))

type Route = typeof import('./route')
let GET: Route['GET']

/** Vendredi 9 octobre 2026, 22 h à Paris (heure d'été) : en pleine soirée. */
const DURING = '2026-10-09T20:00:00Z'
/** Mercredi 7 octobre 2026, midi à Paris. */
const BEFORE = '2026-10-07T10:00:00Z'

const room = (code: string, members: number, lang: string | null, createdAt = '2026-10-09T19:05:00Z') => ({
  code,
  settingsJson: lang ? JSON.stringify({ difficulty: 'normal', lang }) : null,
  createdAt: new Date(createdAt),
  _count: { members },
})

const read = async (query = '') => {
  const res = await GET(new Request(`http://localhost/api/online/friday-table${query}`))
  return { status: res.status, headers: res.headers, body: await res.json() }
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(DURING))
  db.onlineRoom.findMany.mockResolvedValue([])
  // Module neuf à chaque test : le cache mémoire de la route repart vide.
  vi.resetModules()
  ;({ GET } = await import('./route'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/online/friday-table', () => {
  it('hors soirée : le prochain rendez-vous, aucune table, aucune requête en base', async () => {
    vi.setSystemTime(new Date(BEFORE))

    const { status, body } = await read('?lang=fr')

    expect(status).toBe(200)
    expect(body).toEqual({
      status: { live: false, startsAt: '2026-10-09T19:00:00.000Z', endsAt: '2026-10-09T22:00:00.000Z' },
      table: null,
    })
    expect(db.onlineRoom.findMany).not.toHaveBeenCalled()
  })

  it('pendant la soirée, sans table : live, table null', async () => {
    const { body } = await read('?lang=fr')

    expect(body.status.live).toBe(true)
    expect(body.table).toBeNull()
  })

  it('requête bornée : tables publiques d’Imposteur en attente, habitées depuis moins de 5 min, sans pseudo', async () => {
    await read('?lang=fr')

    const args = db.onlineRoom.findMany.mock.calls[0][0]
    expect(args.where).toEqual({
      status: 'waiting',
      visibility: 'public',
      gameId: 'imposteur',
      members: { some: { lastSeenAt: { gte: new Date(Date.parse(DURING) - 5 * 60 * 1000) } } },
    })
    // Aucune jointure sur les comptes : ni `include`, ni membre détaillé.
    expect(args.include).toBeUndefined()
    expect(Object.keys(args.select).sort()).toEqual(['_count', 'code', 'createdAt', 'settingsJson'])
    expect(args.take).toBeLessThanOrEqual(30)
  })

  it('la table la plus peuplée de la langue demandée, avec le plafond d’humains de l’Imposteur', async () => {
    db.onlineRoom.findMany.mockResolvedValue([
      room('PETITE', 2, 'fr'),
      room('GRANDE', 5, 'fr'),
      room('ENGLSH', 7, 'en'),
    ])

    const { body } = await read('?lang=fr')

    expect(body.table).toEqual({ code: 'GRANDE', players: 5, maxPlayers: 16 })
  })

  it('une table pleine n’est pas proposée', async () => {
    db.onlineRoom.findMany.mockResolvedValue([room('PLEINE', 16, 'fr'), room('PLACES', 3, 'fr')])

    const { body } = await read('?lang=fr')

    expect(body.table.code).toBe('PLACES')
  })

  it('langue de la page : une table anglaise pour ?lang=en, aucune pour ?lang=es', async () => {
    db.onlineRoom.findMany.mockResolvedValue([room('FRANCE', 6, 'fr'), room('ENGLSH', 2, 'en')])

    expect((await read('?lang=en')).body.table.code).toBe('ENGLSH')
    expect((await read('?lang=es')).body.table).toBeNull()
  })

  it('sans langue (ou inconnue) : français ; une table sans langue enregistrée est française', async () => {
    db.onlineRoom.findMany.mockResolvedValue([room('ANCIEN', 3, null)])

    expect((await read()).body.table.code).toBe('ANCIEN')
    expect((await read('?lang=de')).body.table.code).toBe('ANCIEN')
  })

  it('rien de personnel dans la réponse : code, effectif, plafond — pas d’identifiant ni de pseudo', async () => {
    db.onlineRoom.findMany.mockResolvedValue([room('GRANDE', 5, 'fr')])

    const { body } = await read('?lang=fr')

    expect(Object.keys(body).sort()).toEqual(['status', 'table'])
    expect(Object.keys(body.table).sort()).toEqual(['code', 'maxPlayers', 'players'])
  })

  it('cache de 5 s, toutes langues confondues : une seule lecture, puis une nouvelle passé le délai', async () => {
    await read('?lang=fr')
    await read('?lang=en')
    expect(db.onlineRoom.findMany).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(Date.parse(DURING) + 6_000))
    await read('?lang=fr')
    expect(db.onlineRoom.findMany).toHaveBeenCalledTimes(2)
  })

  it('sondages simultanés : un seul chargement partagé', async () => {
    await Promise.all([read('?lang=fr'), read('?lang=fr'), read('?lang=it')])

    expect(db.onlineRoom.findMany).toHaveBeenCalledTimes(1)
  })

  it('réponse publique mise en cache 5 s côté navigateur', async () => {
    const { headers } = await read('?lang=fr')

    expect(headers.get('Cache-Control')).toBe('public, max-age=5')
  })

  it('panne de base : 500 server_error en JSON, et l’échec n’est pas retenu', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.onlineRoom.findMany.mockRejectedValueOnce(new Error('base indisponible'))

    const failed = await read('?lang=fr')
    expect(failed.status).toBe(500)
    expect(failed.body.error).toBe('server_error')

    db.onlineRoom.findMany.mockResolvedValue([room('REPRIS', 2, 'fr')])
    expect((await read('?lang=fr')).body.table.code).toBe('REPRIS')
    consoleError.mockRestore()
  })
})
