import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/friends/table — « Ajouter la tablée en amis » (carte « On remet ça ? »).
 *
 * Vraie route ET vraie logique d'amitié (src/lib/friends.ts) : seules la
 * base, la session et le quota sont simulés. Ce qu'on tient : compte requis,
 * destinataires RELUS en base (membres réels de la salle, demandeur compris),
 * jamais une liste du client ; bots, bannis et bloqués écartés ; demande
 * croisée acceptée ; et rien dans la réponse ne dit qui a été écarté.
 */

const { db, currentUserMock, rateLimitMock } = vi.hoisted(() => ({
  db: {
    onlineRoom: { findUnique: vi.fn() },
    friendship: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    userBlock: { findMany: vi.fn() },
  },
  currentUserMock: vi.fn(),
  rateLimitMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return { ...actual, checkRateLimit: rateLimitMock }
})

import { GET, POST } from './route'

const ROOM_ID = 'salle-1'

type Mate = { id: string; banType?: string | null; bannedUntil?: Date | null }

/** Une salle telle que la base la rend : membres + colonnes de ban. */
function roomWith(mates: Mate[]) {
  return {
    members: mates.map((m) => ({
      userId: m.id,
      user: {
        id: m.id,
        banType: m.banType ?? null,
        bannedUntil: m.bannedUntil ?? null,
        banComment: null,
        bannedAt: null,
      },
    })),
  }
}

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/friends/table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )

const get = (roomId: string | null) =>
  GET(new Request(`http://localhost/api/friends/table${roomId === null ? '' : `?roomId=${roomId}`}`))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  currentUserMock.mockResolvedValue({ id: 'moi', isGuest: false })
  rateLimitMock.mockReturnValue({ ok: true })
  db.onlineRoom.findUnique.mockResolvedValue(roomWith([{ id: 'moi' }, { id: 'alice' }, { id: 'bob' }]))
  db.friendship.findMany.mockResolvedValue([])
  db.friendship.findUnique.mockResolvedValue(null)
  db.friendship.create.mockImplementation(async ({ data }) => ({ id: `f-${data.addresseeId}`, ...data }))
  db.friendship.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }))
  db.userBlock.findMany.mockResolvedValue([])
})

describe('POST /api/friends/table', () => {
  it('sans compte : 401, aucune lecture', async () => {
    currentUserMock.mockResolvedValue(null)
    const res = await post({ roomId: ROOM_ID })
    expect(res.status).toBe(401)
    expect(db.onlineRoom.findUnique).not.toHaveBeenCalled()
  })

  it('quota atteint : 429 avant toute lecture', async () => {
    rateLimitMock.mockReturnValue({ ok: false, retryAfterSec: 30 })
    const res = await post({ roomId: ROOM_ID })
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('rate_limited')
    expect(db.onlineRoom.findUnique).not.toHaveBeenCalled()
  })

  it('identifiant de salle absent ou absurde : 400', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ roomId: '../x y' })).status).toBe(400)
    expect(db.onlineRoom.findUnique).not.toHaveBeenCalled()
  })

  it('salle inconnue : 404', async () => {
    db.onlineRoom.findUnique.mockResolvedValue(null)
    const res = await post({ roomId: ROOM_ID })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('room_not_found')
  })

  it('demandeur absent de la salle : 403 not_a_member, aucune demande', async () => {
    db.onlineRoom.findUnique.mockResolvedValue(roomWith([{ id: 'alice' }, { id: 'bob' }]))
    const res = await post({ roomId: ROOM_ID })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('not_a_member')
    expect(db.friendship.create).not.toHaveBeenCalled()
  })

  it('une demande à chaque autre membre RÉEL : la liste du client est ignorée', async () => {
    const res = await post({ roomId: ROOM_ID, userIds: ['inconnu-1', 'inconnu-2'] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ requested: 2, accepted: 0 })
    const targets = db.friendship.create.mock.calls.map(([arg]) => arg.data.addresseeId)
    expect(targets).toEqual(['alice', 'bob'])
    expect(db.onlineRoom.findUnique.mock.calls[0][0].where).toEqual({ id: ROOM_ID })
  })

  it('jamais de demande à soi-même ni à un bot', async () => {
    db.onlineRoom.findUnique.mockResolvedValue(roomWith([{ id: 'moi' }, { id: 'bot-1' }, { id: 'alice' }]))
    await post({ roomId: ROOM_ID })
    const targets = db.friendship.create.mock.calls.map(([arg]) => arg.data.addresseeId)
    expect(targets).toEqual(['alice'])
  })

  it('déjà amis ou déjà sollicités : rien d’écrit', async () => {
    db.friendship.findMany.mockResolvedValue([
      { requesterId: 'alice', addresseeId: 'moi', status: 'accepted' },
      { requesterId: 'moi', addresseeId: 'bob', status: 'pending' },
    ])
    const res = await post({ roomId: ROOM_ID })
    expect(await res.json()).toEqual({ requested: 0, accepted: 0 })
    expect(db.friendship.create).not.toHaveBeenCalled()
    expect(db.friendship.update).not.toHaveBeenCalled()
  })

  it('demande croisée en attente : acceptée du même geste', async () => {
    db.friendship.findMany.mockResolvedValue([{ requesterId: 'alice', addresseeId: 'moi', status: 'pending' }])
    db.friendship.findUnique.mockImplementation(async ({ where }) => {
      const pair = where.requesterId_addresseeId
      return pair.requesterId === 'alice' && pair.addresseeId === 'moi'
        ? { id: 'f-croisee', requesterId: 'alice', addresseeId: 'moi', status: 'pending', respondedAt: null }
        : null
    })
    const res = await post({ roomId: ROOM_ID })
    expect(await res.json()).toEqual({ requested: 1, accepted: 1 })
    expect(db.friendship.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f-croisee' }, data: expect.objectContaining({ status: 'accepted' }) })
    )
  })

  it('banni ou bloqué : écarté SANS que la réponse le dise', async () => {
    db.onlineRoom.findUnique.mockResolvedValue(
      roomWith([{ id: 'moi' }, { id: 'alice', banType: 'permanent' }, { id: 'bob' }, { id: 'carla' }])
    )
    db.userBlock.findMany.mockResolvedValue([{ blockerId: 'bob', blockedId: 'moi' }])
    const res = await post({ roomId: ROOM_ID })
    const body = await res.json()
    expect(body).toEqual({ requested: 1, accepted: 0 })
    expect(Object.keys(body).sort()).toEqual(['accepted', 'requested'])
    const targets = db.friendship.create.mock.calls.map(([arg]) => arg.data.addresseeId)
    expect(targets).toEqual(['carla'])
  })

  it('invité admis, comme pour les demandes unitaires', async () => {
    currentUserMock.mockResolvedValue({ id: 'moi', isGuest: true })
    const res = await post({ roomId: ROOM_ID })
    expect(res.status).toBe(200)
  })
})

describe('GET /api/friends/table', () => {
  it('sans compte : 401', async () => {
    currentUserMock.mockResolvedValue(null)
    expect((await get(ROOM_ID)).status).toBe(401)
  })

  it('sans salle : 400 ; pas membre : 403', async () => {
    expect((await get(null)).status).toBe(400)
    db.onlineRoom.findUnique.mockResolvedValue(roomWith([{ id: 'alice' }]))
    expect((await get(ROOM_ID)).status).toBe(403)
  })

  it('compte les membres que le bouton toucherait, sans rien écrire', async () => {
    db.friendship.findMany.mockResolvedValue([{ requesterId: 'moi', addresseeId: 'alice', status: 'accepted' }])
    const res = await get(ROOM_ID)
    expect(await res.json()).toEqual({ addable: 1 })
    expect(db.friendship.create).not.toHaveBeenCalled()
  })

  it('aveugle au blocage : un membre qui m’a bloqué compte encore (le bouton ne trahit rien)', async () => {
    db.userBlock.findMany.mockResolvedValue([{ blockerId: 'bob', blockedId: 'moi' }])
    const res = await get(ROOM_ID)
    expect(await res.json()).toEqual({ addable: 2 })
    expect(db.userBlock.findMany).not.toHaveBeenCalled()
  })
})
