import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GAMES } from '@/lib/games'

/**
 * POST /api/feedback/first-game — avis de 1re partie. Vraie route, vrais
 * quotas (rate-limit.ts, en mémoire), base et session simulées : une seule
 * note par compte (tenue par la clé primaire, même en concurrence),
 * `firstFeedbackAskedAt` posé pour les deux actions et jamais écrasé,
 * l'e-mail jamais recopié, rien d'écrit pour un refus anonyme, quota propre
 * et distinct de celui de /api/feedback, notes anonymes plafonnées par jour.
 *
 * GET — éligibilité d'un compte connecté pour la carte en LOCAL.
 */

const { userDb, feedbackDb, currentUserMock } = vi.hoisted(() => ({
  userDb: { updateMany: vi.fn(), findUnique: vi.fn() },
  feedbackDb: { create: vi.fn() },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb, userFeedback: feedbackDb } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))

import { GET, POST } from './route'
import { checkRateLimit, userRateLimitKey } from '@/lib/rate-limit'
import { firstGameFeedbackId } from '@/lib/first-game-feedback-server'

/** Erreur d'unicité telle que Prisma la lève (seul `code` est lu). */
const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

const GAME_ID = GAMES[0].id

/**
 * Chaque test a son compte ET son réseau : les compteurs de quota vivent en
 * mémoire pour tout le fichier, ils ne doivent pas déborder d'un test à l'autre.
 */
let seq = 0
let ip = ''
const account = (extra: Record<string, unknown> = {}) => ({
  id: `compte-${seq}`,
  email: 'joueur@exemple.fr',
  displayName: 'Suzon',
  role: 'user',
  isGuest: false,
  ...extra,
})

const send = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://test/api/feedback/first-game', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Linux; Android 14)',
        ...(ip ? { 'x-forwarded-for': ip } : {}),
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

const RATE = { action: 'rate', rating: 4, gameId: GAME_ID, playMode: 'online' }

beforeEach(() => {
  vi.clearAllMocks()
  seq += 1
  ip = `198.51.100.${seq}`
  currentUserMock.mockResolvedValue(null)
  userDb.updateMany.mockResolvedValue({ count: 1 })
  userDb.findUnique.mockResolvedValue(null)
  feedbackDb.create.mockResolvedValue({ id: 'avis-1' })
})

describe('compte connecté', () => {
  it('note : avis créé (note, jeu, mode, sans e-mail) et date de sollicitation posée', async () => {
    currentUserMock.mockResolvedValue(account())

    const res = await send({ ...RATE, comment: '  Super soirée  ', pageUrl: '/fr/online/ABCD?x=1' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(userDb.updateMany).toHaveBeenCalledWith({
      where: { id: `compte-${seq}`, firstFeedbackAskedAt: null },
      data: { firstFeedbackAskedAt: expect.any(Date) },
    })
    expect(feedbackDb.create).toHaveBeenCalledWith({
      data: {
        id: firstGameFeedbackId(`compte-${seq}`),
        type: 'first-game',
        message: 'Super soirée',
        rating: 4,
        gameId: GAME_ID,
        playMode: 'online',
        userId: `compte-${seq}`,
        contactEmail: null,
        pageUrl: '/fr/online/ABCD',
        userAgent: 'Mozilla/5.0 (Linux; Android 14)',
      },
    })
  })

  it('invité : même traitement (45 comptes sur 89 sont des invités)', async () => {
    currentUserMock.mockResolvedValue(account({ isGuest: true, email: '' }))

    const res = await send(RATE)

    expect(res.status).toBe(200)
    expect(userDb.updateMany).toHaveBeenCalledTimes(1)
    expect(feedbackDb.create.mock.calls[0][0].data).toMatchObject({ userId: `compte-${seq}`, contactEmail: null })
  })

  it('second avis du même compte : la clé primaire refuse, réponse `already`', async () => {
    currentUserMock.mockResolvedValue(account())
    feedbackDb.create.mockRejectedValue(uniqueViolation())

    const res = await send(RATE)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, already: true })
    expect(feedbackDb.create.mock.calls[0][0].data.id).toBe(firstGameFeedbackId(`compte-${seq}`))
  })

  it('deux envois simultanés du même compte : une ligne, l’autre répond `already`', async () => {
    currentUserMock.mockResolvedValue(account())
    // La base tient l'unicité : le second create bute sur la même clé.
    feedbackDb.create.mockResolvedValueOnce({ id: 'avis-1' }).mockRejectedValueOnce(uniqueViolation())

    const [first, second] = await Promise.all([send(RATE), send({ ...RATE, rating: 2 })])
    const bodies = await Promise.all([first.json(), second.json()])

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(bodies).toEqual(expect.arrayContaining([{ ok: true }, { ok: true, already: true }]))
    const ids = feedbackDb.create.mock.calls.map(([args]) => args.data.id)
    expect(ids).toEqual([firstGameFeedbackId(`compte-${seq}`), firstGameFeedbackId(`compte-${seq}`)])
  })

  it('autre panne à l’écriture : 500, pas un faux `already`', async () => {
    currentUserMock.mockResolvedValue(account())
    feedbackDb.create.mockRejectedValue(Object.assign(new Error('busy'), { code: 'P1008' }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await send(RATE)

    expect(res.status).toBe(500)
    spy.mockRestore()
  })

  it('« Non merci » : seule la date est posée, aucun avis', async () => {
    currentUserMock.mockResolvedValue(account())

    const res = await send({ action: 'dismiss', gameId: GAME_ID, playMode: 'online' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(userDb.updateMany).toHaveBeenCalledWith({
      where: { id: `compte-${seq}`, firstFeedbackAskedAt: null },
      data: { firstFeedbackAskedAt: expect.any(Date) },
    })
    expect(feedbackDb.create).not.toHaveBeenCalled()
  })
})

describe('visiteur anonyme (jeux locaux)', () => {
  it('note : avis créé sans compte ni e-mail, avec un identifiant par défaut', async () => {
    const res = await send({ ...RATE, playMode: 'local' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(userDb.updateMany).not.toHaveBeenCalled()
    const data = feedbackDb.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      type: 'first-game',
      message: '',
      rating: 4,
      playMode: 'local',
      userId: null,
      contactEmail: null,
    })
    expect(data).not.toHaveProperty('id')
  })

  it('note « en ligne » sans compte : 400 (une salle en ligne exige un compte)', async () => {
    const res = await send(RATE)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect(feedbackDb.create).not.toHaveBeenCalled()
  })

  it('deux notes par jour et par réseau, puis 429 — même sous le quota horaire', async () => {
    const local = { ...RATE, playMode: 'local' }
    expect((await send(local)).status).toBe(200)
    expect((await send(local)).status).toBe(200)
    const res = await send(local)

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(feedbackDb.create).toHaveBeenCalledTimes(2)

    // Un autre réseau garde les siennes.
    ip = `203.0.113.${100 + seq}`
    expect((await send(local)).status).toBe(200)
  })

  it('« Non merci » : 200 sans la moindre écriture, hors plafond des notes', async () => {
    const local = { ...RATE, playMode: 'local' }
    expect((await send(local)).status).toBe(200)
    expect((await send(local)).status).toBe(200)

    const res = await send({ action: 'dismiss', playMode: 'local' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(userDb.updateMany).not.toHaveBeenCalled()
    expect(feedbackDb.create).toHaveBeenCalledTimes(2)
  })
})

describe('corps invalides', () => {
  it.each([
    [{ ...RATE, rating: 6 }],
    [{ ...RATE, rating: 2.5 }],
    [{ ...RATE, gameId: 'jeu-invente' }],
    [{ ...RATE, playMode: 'tv' }],
    [{ action: 'supprimer', playMode: 'online' }],
    ['pas du json'],
  ])('%j : 400 invalid, rien d’écrit', async (body) => {
    currentUserMock.mockResolvedValue(account())

    const res = await send(body)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid' })
    expect(userDb.updateMany).not.toHaveBeenCalled()
    expect(feedbackDb.create).not.toHaveBeenCalled()
  })

  it('corps de plus de 8 Ko : 400, refusé avant lecture', async () => {
    const res = await send({ ...RATE, comment: 'a'.repeat(9 * 1024) })

    expect(res.status).toBe(400)
    expect(feedbackDb.create).not.toHaveBeenCalled()
  })
})

describe('quota', () => {
  it('3 envois par heure et par compte, puis 429 avec Retry-After', async () => {
    currentUserMock.mockResolvedValue(account())

    for (let i = 0; i < 3; i++) expect((await send({ action: 'dismiss', playMode: 'online' })).status).toBe(200)
    const res = await send({ action: 'dismiss', playMode: 'online' })

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect((await res.json()).code).toBe('rate_limited')
  })

  it('anonyme : compté par IP — un autre réseau garde son quota', async () => {
    for (let i = 0; i < 3; i++) expect((await send({ action: 'dismiss', playMode: 'local' })).status).toBe(200)
    expect((await send({ action: 'dismiss', playMode: 'local' })).status).toBe(429)

    ip = `203.0.113.${seq}`
    expect((await send({ action: 'dismiss', playMode: 'local' })).status).toBe(200)
  })

  it('distinct du quota de /api/feedback : un compte au plafond des signalements peut encore noter', async () => {
    const user = account()
    currentUserMock.mockResolvedValue(user)
    const feedbackKey = userRateLimitKey('feedback', user.id)
    for (let i = 0; i < 3; i++) checkRateLimit(feedbackKey, 3, 60 * 60 * 1000)
    expect(checkRateLimit(feedbackKey, 3, 60 * 60 * 1000).ok).toBe(false)

    expect((await send(RATE)).status).toBe(200)
  })
})

describe('panne de la base', () => {
  it('500 générique, sans détail', async () => {
    currentUserMock.mockResolvedValue(account())
    userDb.updateMany.mockRejectedValue(new Error('SQLITE_BUSY'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await send(RATE)

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Erreur serveur' })
    spy.mockRestore()
  })
})

describe('GET — la carte peut-elle sortir en local pour ce compte ?', () => {
  const DAY_MS = 24 * 60 * 60 * 1000

  it('sans compte : 401', async () => {
    const res = await GET()

    expect(res.status).toBe(401)
    expect(userDb.findUnique).not.toHaveBeenCalled()
  })

  it('compte récent jamais sollicité : éligible', async () => {
    currentUserMock.mockResolvedValue(account())
    userDb.findUnique.mockResolvedValue({ firstFeedbackAskedAt: null, createdAt: new Date(Date.now() - DAY_MS) })

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ eligible: true })
    expect(userDb.findUnique).toHaveBeenCalledWith({
      where: { id: `compte-${seq}` },
      select: { firstFeedbackAskedAt: true, createdAt: true },
    })
  })

  it('habitué sur un appareil neuf, ou compte déjà sollicité : non éligible', async () => {
    currentUserMock.mockResolvedValue(account())
    userDb.findUnique.mockResolvedValueOnce({ firstFeedbackAskedAt: null, createdAt: new Date(Date.now() - 90 * DAY_MS) })
    expect(await (await GET()).json()).toEqual({ eligible: false })

    userDb.findUnique.mockResolvedValueOnce({ firstFeedbackAskedAt: new Date(), createdAt: new Date() })
    expect(await (await GET()).json()).toEqual({ eligible: false })
  })

  it('panne de la base : 500 en JSON, jamais une page HTML', async () => {
    currentUserMock.mockResolvedValue(account())
    userDb.findUnique.mockRejectedValue(new Error('SQLITE_BUSY'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET()

    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('server_error')
    spy.mockRestore()
  })
})
