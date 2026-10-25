import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/players/local — liste des joueurs locaux d'un compte (synchro nuage).
 * Vraie route, vrais quotas (rate-limit.ts, en mémoire), base et session
 * simulées. Le PUT stockait tout sauf le nom tel quel : un effet de pseudo
 * piégé repartait vers les appareils d'un autre compte, puis dans le HTML
 * brut du Petit Buveur. Et `request.json()` lisait un corps sans limite.
 */

const { userDb, currentUserMock, logRejectedMock } = vi.hoisted(() => ({
  userDb: { findUnique: vi.fn(), update: vi.fn() },
  currentUserMock: vi.fn(),
  logRejectedMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: userDb } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/name-moderation/extra-terms-server', () => ({
  ensureServerModerationTermsLoaded: vi.fn(async () => {}),
}))
vi.mock('@/lib/name-moderation-attempt-log', () => ({ logRejectedNameOnServer: logRejectedMock }))

import { GET, PUT } from './route'

const PAYLOAD = 'fire"><img src=x onerror=alert(document.domain)>'

/** Chaque test a son compte : les compteurs de quota vivent en mémoire pour tout le fichier. */
let seq = 0
const account = () => ({ id: `compte-${seq}`, locale: 'fr', role: 'user', isGuest: false })

const validPlayer = (extra: Record<string, unknown> = {}) => ({
  id: 'player-1',
  name: 'Marie',
  createdAt: 10,
  stats: { gamesPlayed: 1, wins: 0, totalDrinks: 3 },
  preferences: { color: 'bg-blue-500', icon: '🎮', specialEffect: 'fire' },
  ...extra,
})

const put = (body: unknown, headers: Record<string, string> = {}) =>
  PUT(
    new Request('http://test/api/players/local', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )

/** Ce que la route a écrit en base. */
const storedPlayers = () => JSON.parse(userDb.update.mock.calls[0]?.[0].data.localPlayersJson)

beforeEach(() => {
  vi.clearAllMocks()
  seq += 1
  currentUserMock.mockResolvedValue(account())
  userDb.update.mockResolvedValue({ updatedAt: new Date('2026-01-01T00:00:00Z') })
  userDb.findUnique.mockResolvedValue(null)
})

describe('PUT — préférences empoisonnées', () => {
  it('enregistre la charge du constat ramenée au catalogue, clés inconnues retirées', async () => {
    const res = await put({
      players: [
        validPlayer({
          evil: '<script>',
          stats: { gamesPlayed: 'x', wins: 1, totalDrinks: 2, lastPlayed: 4102444800000 },
          preferences: {
            color: 'bg-blue-500" onclick="x',
            icon: '<svg onload=x>',
            specialEffect: PAYLOAD,
            iconFrame: 'gold" x="',
            avatar: 'https://espion.example/p.png',
            extra: 1,
          },
        }),
      ],
    })

    expect(res.status).toBe(200)
    const json = userDb.update.mock.calls[0]?.[0].data.localPlayersJson as string
    expect(json).not.toContain('onerror')
    expect(json).not.toContain('onclick')
    expect(json).not.toContain('espion')
    expect(storedPlayers()).toEqual([
      {
        id: 'player-1',
        name: 'Marie',
        createdAt: 10,
        stats: { gamesPlayed: 0, wins: 1, totalDrinks: 2, lastPlayed: 4102444800000 },
        preferences: { color: 'bg-red-500' },
      },
    ])
  })

  it('garde un joueur valide tel quel', async () => {
    const res = await put({ players: [validPlayer()] })
    expect(res.status).toBe(200)
    expect(storedPlayers()).toEqual([validPlayer()])
  })
})

describe('PUT — structure invalide : 400, rien d’écrit', () => {
  const cases: Array<[string, unknown]> = [
    ['corps sans liste', {}],
    ['liste qui n’en est pas une', { players: 'Marie' }],
    ['corps tableau', [validPlayer()]],
    ['joueur nul', { players: [null] }],
    ['joueur tableau', { players: [[]] }],
    ['id piégé', { players: [validPlayer({ id: '"><img src=x onerror=1>' })] }],
    ['id absent', { players: [validPlayer({ id: undefined })] }],
    ['stats non objet', { players: [validPlayer({ stats: 'x' })] }],
    ['préférences nulles', { players: [validPlayer({ preferences: null })] }],
    ['date de création texte', { players: [validPlayer({ createdAt: '10' })] }],
  ]

  it.each(cases)('%s', async (_label, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_json', code: 'invalid_json' })
    expect(userDb.update).not.toHaveBeenCalled()
  })

  it('JSON illisible : 400 invalid_json, plus une page 500', async () => {
    const res = await put('{pas du json')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_json' })
  })

  it('nom refusé : la modération répond toujours avec sa raison', async () => {
    const res = await put({ players: [validPlayer({ name: '' })] })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'empty' })
    expect(userDb.update).not.toHaveBeenCalled()
  })
})

describe('PUT — corps trop gros, quota, session', () => {
  it('refuse un corps de plus de 512 Ko AVANT de le parser (illisible : 413, pas 400)', async () => {
    const res = await put('x'.repeat(600 * 1024))
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: 'payload_too_large' })
  })

  it('refuse le gros champ voisin de la liste, que le plafond d’après parse ne mesurait pas', async () => {
    const res = await put({ players: [], x: Array.from({ length: 200_000 }, () => []) })
    expect(res.status).toBe(413)
    expect(userDb.update).not.toHaveBeenCalled()
  })

  it('quota par compte : 60 par minute, puis 429 avant même de lire le corps', async () => {
    for (let i = 0; i < 60; i++) {
      expect((await put({ players: [] })).status).toBe(200)
    }
    const res = await put('{pas du json')
    expect(res.status).toBe(429)
    expect(await res.json()).toMatchObject({ error: 'rate_limited' })
    expect(userDb.update).toHaveBeenCalledTimes(60)

    // Un autre compte n'est pas touché.
    seq += 1
    currentUserMock.mockResolvedValue(account())
    expect((await put({ players: [] })).status).toBe(200)
  })

  it('sans session : 401 auth_required', async () => {
    currentUserMock.mockResolvedValue(null)
    const res = await put({ players: [] })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'auth_required' })
  })

  it('écriture venue d’un autre site : 403 avant tout', async () => {
    const res = await put({ players: [validPlayer()] }, { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'cross_site_request' })
    expect(currentUserMock).not.toHaveBeenCalled()
  })
})

describe('GET', () => {
  it('assainit une liste enregistrée avant la validation du PUT', async () => {
    userDb.findUnique.mockResolvedValue({
      localPlayersJson: JSON.stringify([
        validPlayer({ preferences: { color: 'bg-blue-500', specialEffect: PAYLOAD } }),
        null,
      ]),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('onerror')
    expect(body.players).toHaveLength(1)
    expect(body.players[0].preferences).toEqual({ color: 'bg-blue-500' })
  })

  it('sans session : 401 auth_required', async () => {
    currentUserMock.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'auth_required' })
  })
})
