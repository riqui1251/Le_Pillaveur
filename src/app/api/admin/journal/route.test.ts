import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/admin/journal — journal de l'équipe, paginé. Vraie route, vraie
 * garde, vrais rôles et vraie fusion des quatre sources ; session et base
 * simulées. La base factice honore `where`, `orderBy` et `take` comme Prisma :
 * parcourir les pages doit rendre chaque action une fois, dans l'ordre.
 */

type Row = { id: string; createdAt: Date; [key: string]: unknown }

const { userMock, prismaMock, tables } = vi.hoisted(() => {
  const tables = {
    accountBanEvent: [] as Row[],
    cosmeticGrant: [] as Row[],
    featureBan: [] as Row[],
    moderationTerm: [] as Row[],
  }
  type Args = {
    where?: { action?: { notIn?: string[]; startsWith?: string }; createdAt?: { lt?: Date } }
    take?: number
  }
  const visible = (rows: Row[], args?: Args) =>
    rows.filter((r) => {
      const action = args?.where?.action
      if (action?.notIn?.includes(r.action as string)) return false
      if (action?.startsWith !== undefined && !String(r.action).startsWith(action.startsWith)) return false
      const lt = args?.where?.createdAt?.lt
      return !lt || r.createdAt < lt
    })
  const newestFirst = (a: Row, b: Row) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)
  const model = (name: keyof typeof tables) => ({
    findMany: vi.fn(async (args?: Args) =>
      visible(tables[name], args)
        .slice()
        .sort(newestFirst)
        .slice(0, args?.take ?? Infinity)
    ),
    // Seul usage : la plus ANCIENNE ligne qui passe le filtre.
    findFirst: vi.fn(async (args?: Args) => visible(tables[name], args).slice().sort(newestFirst).at(-1) ?? null),
    count: vi.fn(async (args?: Args) => visible(tables[name], args).length),
  })
  return {
    tables,
    userMock: vi.fn(),
    prismaMock: {
      accountBanEvent: model('accountBanEvent'),
      cosmeticGrant: model('cosmeticGrant'),
      featureBan: model('featureBan'),
      moderationTerm: model('moderationTerm'),
      user: { findMany: vi.fn() },
    },
  }
})

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/online-room', () => ({ cleanupAbandonedRooms: vi.fn() }))
vi.mock('@/lib/name-moderation-attempts-server', () => ({ listFlaggedNameModerationUsers: vi.fn() }))

import { GET } from './route'

const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 10, minute))
const alice = { displayName: 'Alice' }
const suzon = { displayName: 'Suzon' }

const ban = (id: string, minute: number, action = 'ban') => ({
  id,
  userId: 'u-suzon',
  action,
  comment: null,
  createdAt: at(minute),
  user: suzon,
  actor: alice,
})
const grant = (id: string, minute: number) => ({
  id,
  userId: 'u-suzon',
  cosmeticKey: 'cadre-or',
  createdAt: at(minute),
  user: suzon,
  grantedBy: alice,
})
const featureBan = (id: string, minute: number) => ({
  id,
  userId: 'u-suzon',
  feature: 'voice',
  createdAt: at(minute),
  user: suzon,
  actor: alice,
})
const term = (id: string, minute: number) => ({ id, term: 'gros mot', addedById: null, createdAt: at(minute) })

const get = (query = '') => GET(new Request(`http://localhost/api/admin/journal${query}`))

/** Un historique de 10 actions visibles (et 2 acquittements) réparties sur les quatre sources. */
function seedHistory() {
  tables.accountBanEvent = [
    ban('b1', 1),
    ban('b2', 5, 'unban'),
    ban('b3', 8, 'role-change'),
    ban('ack1', 10, 'feedback-ack'),
    ban('ack2', 11, 'name-flag-ack'),
    ban('b4', 12),
  ]
  tables.cosmeticGrant = [grant('g1', 2), grant('g2', 8)]
  tables.featureBan = [featureBan('f1', 3), featureBan('f2', 8)]
  tables.moderationTerm = [term('t1', 4), term('t2', 13)]
}

beforeEach(() => {
  vi.clearAllMocks()
  tables.accountBanEvent = []
  tables.cosmeticGrant = []
  tables.featureBan = []
  tables.moderationTerm = []
  userMock.mockResolvedValue({ id: 'staff', role: 'admin' })
  prismaMock.user.findMany.mockResolvedValue([])
})

describe('GET /api/admin/journal — accès', () => {
  it.each([['admin'], ['superadmin'], ['fondateur']])('%s : page servie', async (role) => {
    userMock.mockResolvedValue({ id: 'staff', role })

    const res = await get()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ entries: [], total: 0, page: 1, pageSize: 25 })
  })

  it.each([['moderator'], ['user'], [null]])('%s : 403 codé, sans la moindre lecture', async (role) => {
    userMock.mockResolvedValue(role ? { id: 'joueur', role } : null)

    const res = await get()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden', code: 'forbidden' })
    expect(prismaMock.accountBanEvent.findMany).not.toHaveBeenCalled()
    expect(prismaMock.accountBanEvent.count).not.toHaveBeenCalled()
  })

  it('panne de la base : 500 codé, jamais une page HTML', async () => {
    prismaMock.accountBanEvent.count.mockRejectedValueOnce(new Error('SQLITE_BUSY'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await get()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server_error', code: 'server_error' })
  })
})

describe('GET /api/admin/journal — pagination', () => {
  it('remonte tout l’historique page par page : chaque action une fois, la plus récente d’abord', async () => {
    seedHistory()
    const seen: string[] = []

    for (let page = 1; page <= 4; page++) {
      const res = await get(`?page=${page}&pageSize=3`)
      const body = await res.json()
      expect(body).toMatchObject({ total: 10, page, pageSize: 3 })
      seen.push(...body.entries.map((e: { id: string }) => e.id))
    }

    expect(seen).toEqual([
      'term-t2',
      'ban-b4',
      // Trois actions de la même minute, à cheval sur deux pages : l'id
      // départage, toujours dans le même sens, sans doublon ni trou.
      'grant-g2',
      'feature-f2',
      'ban-b3',
      'ban-b2',
      'term-t1',
      'feature-f1',
      'grant-g1',
      'ban-b1',
    ])
  })

  it('une page au-delà de la fin : vide, le total reste juste', async () => {
    seedHistory()

    const body = await (await get('?page=9&pageSize=3')).json()

    expect(body).toEqual({ entries: [], total: 10, page: 9, pageSize: 3 })
  })

  it('les acquittements restent hors du journal ET du total, écartés en base', async () => {
    seedHistory()

    const body = await (await get('?pageSize=50')).json()

    expect(body.total).toBe(10)
    expect(body.entries.map((e: { id: string }) => e.id)).not.toContain('ban-ack1')
    const filter = { action: { notIn: ['feedback-ack', 'name-flag-ack'] } }
    expect(prismaMock.accountBanEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: filter }))
    expect(prismaMock.accountBanEvent.count).toHaveBeenCalledWith({ where: filter })
  })

  it('lit juste assez de chaque source pour la page demandée', async () => {
    await get('?page=3&pageSize=10')

    for (const source of ['accountBanEvent', 'cosmeticGrant', 'featureBan', 'moderationTerm'] as const) {
      expect(prismaMock[source].findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 30 }))
    }
  })

  it.each([
    ['?pageSize=500', 1, 50],
    ['?page=0&pageSize=0', 1, 25],
    ['?page=abc&pageSize=-3', 1, 25],
    ['?page=2', 2, 25],
  ])('paramètres %s bornés : page %i, %i par page', async (query, page, pageSize) => {
    const body = await (await get(query)).json()

    expect(body).toMatchObject({ page, pageSize })
  })

  it('rend chaque entrée comme la Salle : nature, acteur, cible et lien de fiche', async () => {
    tables.accountBanEvent = [ban('b1', 1, 'room-close')]
    tables.cosmeticGrant = [grant('g1', 2)]

    const body = await (await get()).json()

    expect(body.entries).toEqual([
      {
        id: 'grant-g1',
        kind: 'cosmetic-grant',
        actorName: 'Alice',
        targetName: 'Suzon',
        targetUserId: 'u-suzon',
        detail: 'cadre-or',
        createdAt: at(2).toISOString(),
      },
      {
        id: 'ban-b1',
        // Action ancrée sur son auteur : pas de cible, donc pas de lien.
        kind: 'room-close',
        actorName: 'Alice',
        targetName: null,
        targetUserId: null,
        detail: null,
        createdAt: at(1).toISOString(),
      },
    ])
  })
})

describe('GET /api/admin/journal — bans de vocal/chat', () => {
  it('pose et levée lues dans l’historique : jamais « a banni », la fonctionnalité en détail', async () => {
    tables.accountBanEvent = [
      { ...ban('e1', 20, 'feature-ban:voice'), comment: 'insultes au micro' },
      { ...ban('e2', 25, 'feature-unban:voice'), comment: 'excuses' },
      ban('e3', 30, 'feature-ban:chat'),
    ]
    // La ligne vivante du ban de chat, écrite dans la même transaction que e3.
    tables.featureBan = [{ ...featureBan('f-chat', 30), feature: 'chat' }]

    const body = await (await get()).json()

    expect(body.total).toBe(3)
    expect(body.entries.map((e: { id: string; kind: string; detail: string }) => [e.id, e.kind, e.detail])).toEqual([
      ['ban-e3', 'feature-ban', 'chat'],
      ['ban-e2', 'feature-unban', 'voice'],
      ['ban-e1', 'feature-ban', 'voice'],
    ])
  })

  it('un ban posé avant l’historique reste au journal par sa ligne vivante, compté une fois', async () => {
    tables.featureBan = [featureBan('f-old', 1), { ...featureBan('f-new', 40), feature: 'chat' }]
    tables.accountBanEvent = [ban('e-new', 40, 'feature-ban:chat')]

    const body = await (await get()).json()

    expect(body.total).toBe(2)
    expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['ban-e-new', 'feature-f-old'])
  })
})
