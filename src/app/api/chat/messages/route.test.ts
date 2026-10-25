import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/chat/messages — vraie route, vraie résolution des canaux
 * (chat-access.ts), base simulée. Un loup mort, fantôme qui voit tous les
 * rôles, écrivait à sa meute vivante « la Voyante, c'est X » : la règle
 * « fantôme en lecture seule » n'existait que dans l'interface.
 */

const { memberFindFirst, roomFindUnique, roomFindFirst, chatCreate, currentUserMock } = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  roomFindUnique: vi.fn(),
  roomFindFirst: vi.fn(),
  chatCreate: vi.fn(),
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    onlineRoomMember: { findFirst: memberFindFirst },
    onlineRoom: { findUnique: roomFindUnique, findFirst: roomFindFirst },
    chatMessage: { create: chatCreate },
  },
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/feature-bans', () => ({ isFeatureBanned: vi.fn(async () => false) }))
vi.mock('@/lib/name-moderation/extra-terms-server', () => ({
  ensureServerModerationTermsLoaded: vi.fn(async () => undefined),
}))
vi.mock('@/lib/friends', () => ({ areFriends: vi.fn() }))
vi.mock('@/lib/moderation/blocks', () => ({
  isBlockedBetween: vi.fn(),
  listBlockedCounterpartIds: vi.fn(async () => new Set()),
}))

import { POST } from './route'
import { createLGState, type LGState } from '@/lib/loup-garou/engine'

const ROOM = 'salle-1'

const base = createLGState(
  Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  42,
  undefined,
  0
)
const wolves = base.players.filter((p) => p.role === 'loup')
const seer = base.players.find((p) => p.role === 'voyante')!

/** Le premier loup est mort, en plein débat. */
const deadWolf: LGState = {
  ...base,
  phase: 'day-debate',
  players: base.players.map((p) => (p.id === wolves[0].id ? { ...p, alive: false } : p)),
}

let state: LGState
let seq = 0

const send = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://test/api/chat/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  )

/** Un compte par test : le quota d'envois vit en mémoire, par compte. */
function actAs(id: string) {
  seq += 1
  currentUserMock.mockResolvedValue({ id, displayName: `${id}-${seq}` })
}

beforeEach(() => {
  vi.clearAllMocks()
  state = deadWolf
  memberFindFirst.mockResolvedValue({ roomId: ROOM })
  roomFindUnique.mockImplementation(async () => ({
    status: 'playing',
    gameId: 'loup-garou',
    gameStateJson: JSON.stringify(state),
  }))
  roomFindFirst.mockImplementation(async () => ({ gameStateJson: JSON.stringify(state) }))
  chatCreate.mockImplementation(async ({ data }: { data: { channel: string; senderId: string; body: string } }) => ({
    id: 'm1',
    ...data,
    createdAt: new Date('2026-10-25T20:00:00Z'),
    sender: { displayName: 'P', onlinePreferencesJson: null },
  }))
})

describe('POST /api/chat/messages — fantôme du Loup-Garou', () => {
  it('loup mort → chat des loups : 403 chat_read_only, rien d’écrit', async () => {
    actAs(wolves[0].id)
    const res = await send({ scope: 'wolves', body: `La voyante c'est ${seer.name}` })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'chat_read_only', code: 'chat_read_only' })
    expect(chatCreate).not.toHaveBeenCalled()
  })

  it('loup mort → salon du village : 403 aussi, la nuit comme le jour', async () => {
    actAs(wolves[0].id)
    state = { ...deadWolf, phase: 'night-wolves' }
    const res = await send({ scope: 'room', body: 'Le loup c’est…' })
    expect(res.status).toBe(403)
    expect(chatCreate).not.toHaveBeenCalled()
  })

  it('loup vivant → chat des loups : envoyé', async () => {
    actAs(wolves[1].id)
    const res = await send({ scope: 'wolves', body: 'On vise qui ?' })
    expect(res.status).toBe(200)
    expect(chatCreate.mock.calls[0][0].data).toMatchObject({ channel: `wolves:${ROOM}`, senderId: wolves[1].id })
  })

  it('partie finie : le mort reparle au salon', async () => {
    actAs(wolves[0].id)
    state = { ...deadWolf, phase: 'finished', winnerTeam: 'village' }
    const res = await send({ scope: 'room', body: 'Bien joué !' })
    expect(res.status).toBe(200)
    expect(chatCreate.mock.calls[0][0].data).toMatchObject({ channel: `room:${ROOM}` })
  })

  it('envoi depuis un autre site : 403 cross_site_request (withApiRoute)', async () => {
    actAs(wolves[1].id)
    const res = await send({ scope: 'wolves', body: 'coucou' }, { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'cross_site_request' })
    expect(chatCreate).not.toHaveBeenCalled()
  })
})

describe('POST /api/chat/messages — message vide', () => {
  it.each([
    ['inversion bidi', '‮'],
    ['remplissage Hangul', 'ㅤㅤ'],
    ['espaces de largeur nulle', '​​​'],
  ])('fait d’invisibles seulement (%s) : 400 invalid_message, rien d’écrit', async (_, body) => {
    actAs(wolves[1].id)
    const res = await send({ scope: 'wolves', body })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_message', code: 'invalid_message' })
    expect(chatCreate).not.toHaveBeenCalled()
  })

  it('message vide ou corps illisible : un code, jamais une phrase', async () => {
    actAs(wolves[1].id)
    expect(await (await send({ scope: 'wolves', body: '   ' })).json()).toMatchObject({ error: 'invalid_message' })
    const garbled = await POST(
      new Request('http://test/api/chat/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{pas du json',
      })
    )
    expect(garbled.status).toBe(400)
    expect(await garbled.json()).toMatchObject({ error: 'invalid_json' })
  })
})
