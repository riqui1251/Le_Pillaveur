import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/feedback/soiree — votes du Mode Soirée. Vraie route, vrais quotas
 * (rate-limit.ts, en mémoire), base et session simulées : un vote par manche
 * et un par soirée (clé primaire), ni e-mail ni prénom stockés, compte
 * rattaché seulement s'il est connecté, quota horaire et plafond anonyme.
 */

const { feedbackDb, currentUserMock } = vi.hoisted(() => ({
  feedbackDb: { create: vi.fn() },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { userFeedback: feedbackDb } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))

import { POST } from './route'

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

/** Chaque test a son réseau : les compteurs de quota vivent en mémoire pour tout le fichier. */
let seq = 0
let ip = ''

const send = (body: unknown) =>
  POST(
    new Request('http://test/api/feedback/soiree', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Linux; Android 14)',
        ...(ip ? { 'x-forwarded-for': ip } : {}),
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

const soireeId = () => `mabc${seq}-x1y2z3`
const roundVote = (extra: Record<string, unknown> = {}) => ({
  scope: 'round',
  soireeId: soireeId(),
  round: 1,
  gameId: 'hi-lo',
  rating: 4,
  pageUrl: '/fr/soiree?fin=1',
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  seq += 1
  ip = `203.0.113.${seq}`
  currentUserMock.mockResolvedValue(null)
  feedbackDb.create.mockResolvedValue({ id: 'vote' })
})

describe('POST /api/feedback/soiree', () => {
  it('vote d’entracte : une ligne « soiree » (note, jeu, local), sans compte ni e-mail ni commentaire', async () => {
    const res = await send(roundVote({ comment: 'ignoré' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(feedbackDb.create).toHaveBeenCalledWith({
      data: {
        id: `soiree-${soireeId()}-m1`,
        type: 'soiree',
        message: '',
        rating: 4,
        gameId: 'hi-lo',
        playMode: 'local',
        userId: null,
        contactEmail: null,
        pageUrl: '/fr/soiree',
        userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      },
    })
  })

  it('vote de l’addition : sans jeu, avec le commentaire, rattaché au compte connecté', async () => {
    currentUserMock.mockResolvedValue({ id: `compte-${seq}`, email: 'joueur@exemple.fr', role: 'user' })

    const res = await send({ scope: 'soiree', soireeId: soireeId(), rating: 5, comment: '  Génial  ' })

    expect(res.status).toBe(200)
    const data = feedbackDb.create.mock.calls[0][0].data
    expect(data).toMatchObject({ id: `soiree-${soireeId()}-fin`, type: 'soiree', message: 'Génial', rating: 5, gameId: null, userId: `compte-${seq}`, contactEmail: null })
  })

  it('second vote sur la même manche : la clé primaire refuse, réponse `already`', async () => {
    feedbackDb.create.mockRejectedValue(uniqueViolation())

    const res = await send(roundVote())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, already: true })
  })

  it('autre panne à l’écriture : 500 server_error, pas un faux `already`', async () => {
    feedbackDb.create.mockRejectedValue(new Error('disque plein'))

    const res = await send(roundVote())

    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('server_error')
  })

  it('corps invalide ou illisible : 400 avec un code, rien d’écrit', async () => {
    const invalid = await send(roundVote({ rating: 9 }))
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).error).toBe('invalid_action')

    const unreadable = await send('{pas du json')
    expect(unreadable.status).toBe(400)
    expect((await unreadable.json()).error).toBe('invalid_json')

    expect(feedbackDb.create).not.toHaveBeenCalled()
  })

  it('30 votes par heure et par adresse, puis 429', async () => {
    for (let round = 0; round < 30; round++) {
      expect((await send(roundVote({ round }))).status).toBe(200)
    }
    const res = await send(roundVote({ round: 30 }))
    expect(res.status).toBe(429)
    expect(feedbackDb.create).toHaveBeenCalledTimes(30)
  })
})
