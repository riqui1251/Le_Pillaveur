import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUT /api/online/rooms/[roomId]/settings — changement de JEU (`gameId`).
 * La vraie route (base, session et bus simulés ; catalogue et adaptateurs
 * réels) : même garde qu'à la création pour le jeu demandé, réglages du jeu
 * précédent remis à zéro, bots bornés par le nouveau jeu, tout le monde
 * « pas prêt ».
 */

const { userMock, roomMock, memberMock, transactionMock, dtoMock, bus, cache } = vi.hoisted(() => ({
  userMock: vi.fn(),
  roomMock: { findUnique: vi.fn(), update: vi.fn() },
  memberMock: { count: vi.fn(), updateMany: vi.fn() },
  transactionMock: vi.fn(),
  dtoMock: vi.fn(),
  bus: { publishRoomChanged: vi.fn() },
  cache: { invalidateLobbiesCache: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { onlineRoom: roomMock, onlineRoomMember: memberMock, $transaction: transactionMock },
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/online-room', () => ({ buildRoomDto: dtoMock }))
vi.mock('@/lib/online/room-bus', () => bus)
vi.mock('@/lib/online/lobbies-cache', () => cache)

import { PUT } from './route'
import { GAMES } from '@/lib/games'
import { getGameAdapter } from '@/lib/online/game-adapters'

/** Table ouverte de Toucher-Coulé, réglée en 2v2 avec équipes et bombes. */
const waitingRoom = (over: Record<string, unknown> = {}) => ({
  id: 'room-1',
  status: 'waiting',
  gameId: 'toucher-coule',
  hostUserId: 'host',
  settingsJson: JSON.stringify({
    difficulty: 'normal',
    lang: 'en',
    tcMode: '2v2',
    tcTeams: { host: 'A', bob: 'B' },
    tcPowerups: true,
    mcTeams: { host: 'A' },
    quizCount: 20,
    botsCount: 3,
  }),
  ...over,
})

const put = (body: unknown, userId = 'host') => {
  userMock.mockResolvedValue({ id: userId })
  return PUT(
    new Request('http://test/api/online/rooms/room-1/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ roomId: 'room-1' }) }
  )
}

/** Données écrites sur la salle par le changement de jeu (2e opération du lot). */
const writtenRoomData = () => roomMock.update.mock.calls.at(-1)?.[0].data as {
  gameId?: string
  settingsJson: string
}

beforeEach(() => {
  vi.resetAllMocks()
  roomMock.findUnique.mockResolvedValue(waitingRoom())
  roomMock.update.mockImplementation(async (args) => args)
  memberMock.updateMany.mockImplementation(async (args) => args)
  memberMock.count.mockResolvedValue(2)
  transactionMock.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops))
  dtoMock.mockResolvedValue({ id: 'room-1' })
})

describe('PUT /settings — gameId validé', () => {
  it('refuse un jeu inconnu, masqué ou purement local', async () => {
    const hidden = GAMES.find((g) => g.hidden)?.id ?? 'roue-des-gorgees'
    for (const gameId of ['pas-un-jeu', hidden, 'hi-lo', 42]) {
      const res = await put({ gameId })
      expect(res.status, String(gameId)).toBe(400)
      expect((await res.json()).error).toBe('invalid_game')
    }
    expect(roomMock.update).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('seul l’hôte change de jeu', async () => {
    const res = await put({ gameId: 'menteur' }, 'bob')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('host_only_settings')
  })

  it('pas en partie : game_already_started', async () => {
    roomMock.findUnique.mockResolvedValue(waitingRoom({ status: 'playing' }))
    const res = await put({ gameId: 'menteur' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('game_already_started')
  })

  it('refuse un jeu que la tablée dépasse déjà (max_players + count)', async () => {
    // Un AUTRE jeu que celui de la table (Toucher-Coulé) : redemander le jeu
    // actuel n'est pas un changement.
    const small = GAMES.find(
      (g) => g.onlineReady && !g.hidden && g.id !== 'toucher-coule' && (g.maxPlayers ?? 99) < 16
    )!
    const max = getGameAdapter(small.id)!.maxPlayers
    memberMock.count.mockResolvedValue(max + 1)

    const res = await put({ gameId: small.id })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'max_players', count: max })
    expect(transactionMock).not.toHaveBeenCalled()
  })
})

describe('PUT /settings — réinitialisation au changement de jeu', () => {
  it('garde la langue, vide les réglages du jeu précédent, remet tout le monde « pas prêt »', async () => {
    const res = await put({ gameId: 'menteur' })

    expect(res.status).toBe(200)
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(memberMock.updateMany).toHaveBeenCalledWith({ where: { roomId: 'room-1' }, data: { isReady: false } })
    const data = writtenRoomData()
    expect(data.gameId).toBe('menteur')
    const settings = JSON.parse(data.settingsJson)
    expect(settings).toMatchObject({ difficulty: 'normal', lang: 'en' })
    for (const stale of ['tcMode', 'tcTeams', 'tcPowerups', 'mcTeams', 'quizCount']) {
      expect(settings, stale).not.toHaveProperty(stale)
    }
    expect(bus.publishRoomChanged).toHaveBeenCalledWith('room-1', { type: 'lobby' })
    expect(cache.invalidateLobbiesCache).toHaveBeenCalled()
  })

  it('les bots suivent si le nouveau jeu se complète, bornés par ses sièges libres', async () => {
    const adapter = getGameAdapter('menteur')!
    expect(adapter.botsFillable).toBe(true)
    // Tablée qui ne laisse qu'un siège : 3 bots demandés, 1 gardé.
    memberMock.count.mockResolvedValue(adapter.maxPlayers - 1)

    await put({ gameId: 'menteur' })

    expect(JSON.parse(writtenRoomData().settingsJson).botsCount).toBe(1)
  })

  it('aucun bot pour un jeu qui ne se complète pas', async () => {
    roomMock.findUnique.mockResolvedValue(
      waitingRoom({ gameId: 'menteur', settingsJson: JSON.stringify({ botsCount: 3, lang: 'fr' }) })
    )
    expect(getGameAdapter('toucher-coule')!.botsFillable).toBeFalsy()

    await put({ gameId: 'toucher-coule' })

    const settings = JSON.parse(writtenRoomData().settingsJson)
    expect(settings).not.toHaveProperty('botsCount')
    expect(settings).not.toHaveProperty('tcMode')
  })

  it('le jeu actuel redemandé n’est pas un changement : réglages et « prêts » intacts', async () => {
    const res = await put({ gameId: 'toucher-coule', tcPowerups: false })

    expect(res.status).toBe(200)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(memberMock.updateMany).not.toHaveBeenCalled()
    const data = writtenRoomData()
    expect(data).not.toHaveProperty('gameId')
    expect(JSON.parse(data.settingsJson)).toMatchObject({ tcMode: '2v2', tcPowerups: false, quizCount: 20 })
  })

  it('un réglage envoyé avec le changement s’applique au nouveau jeu', async () => {
    await put({ gameId: 'quiz', quizCount: 15 })

    const settings = JSON.parse(writtenRoomData().settingsJson)
    expect(settings.quizCount).toBe(15)
    expect(settings).not.toHaveProperty('tcMode')
  })
})

/** Table ouverte sur Toucher-Coulé, dans la langue donnée (absente : table d'avant la langue). */
const roomIn = (lang?: string, over: Record<string, unknown> = {}) =>
  waitingRoom({ settingsJson: JSON.stringify(lang ? { difficulty: 'normal', lang } : { difficulty: 'normal' }), ...over })

describe('PUT /settings — Sans Filtre et Dilemmes ont leurs cartes ×4', () => {
  it('accepte de passer à Sans Filtre ou Dilemmes depuis une table en/es/it', async () => {
    for (const lang of ['en', 'es', 'it']) {
      for (const gameId of ['sans-filtre', 'dilemmes']) {
        roomMock.update.mockClear()
        roomMock.findUnique.mockResolvedValue(roomIn(lang))
        const res = await put({ gameId })
        expect(res.status, `${gameId} depuis une table ${lang}`).toBe(200)
        expect(writtenRoomData().gameId).toBe(gameId)
      }
    }
  })
})

describe('PUT /settings — cartes dans la langue de la table', () => {
  // Plus aucun jeu n'est limité au français : le garde-fou est vérifié en
  // posant temporairement contentLangs sur Sans Filtre et Dilemmes.
  const flagged = GAMES.filter((g) => g.id === 'sans-filtre' || g.id === 'dilemmes')
  beforeEach(() => {
    for (const g of flagged) g.contentLangs = ['fr']
  })
  afterEach(() => {
    for (const g of flagged) delete g.contentLangs
  })

  it('refuse de passer à un jeu aux cartes françaises seules depuis une table en/it (409, rien écrit)', async () => {
    for (const lang of ['en', 'it']) {
      roomMock.findUnique.mockResolvedValue(roomIn(lang))
      for (const gameId of ['sans-filtre', 'dilemmes']) {
        const res = await put({ gameId })
        expect(res.status, `${gameId} depuis une table ${lang}`).toBe(409)
        expect((await res.json()).error).toBe('content_lang_unavailable')
      }
    }
    expect(transactionMock).not.toHaveBeenCalled()
    expect(roomMock.update).not.toHaveBeenCalled()
  })

  it('accepte depuis une table française, ou sans langue (vaut le français)', async () => {
    for (const lang of ['fr', undefined]) {
      roomMock.update.mockClear()
      roomMock.findUnique.mockResolvedValue(roomIn(lang))
      const res = await put({ gameId: 'sans-filtre' })
      expect(res.status, `table ${lang ?? 'sans langue'}`).toBe(200)
      expect(writtenRoomData().gameId).toBe('sans-filtre')
    }
  })

  it('une table déjà ouverte sur ce jeu dans une autre langue garde ses autres réglages', async () => {
    // Table d'avant le contrôle : seul le CHANGEMENT de jeu est refusé.
    roomMock.findUnique.mockResolvedValue(
      waitingRoom({ gameId: 'sans-filtre', settingsJson: JSON.stringify({ difficulty: 'normal', lang: 'en', botsCount: 1 }) })
    )

    const res = await put({ gameId: 'sans-filtre', botsCount: 3 })

    expect(res.status).toBe(200)
    expect(transactionMock).not.toHaveBeenCalled()
    expect(JSON.parse(writtenRoomData().settingsJson)).toMatchObject({ lang: 'en', botsCount: 3 })

    const again = await put({ difficulty: 'difficile' })
    expect(again.status).toBe(200)
    expect(JSON.parse(writtenRoomData().settingsJson)).toMatchObject({ lang: 'en', difficulty: 'difficile' })
  })
})
