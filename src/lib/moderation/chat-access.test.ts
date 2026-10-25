import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Droits d'écriture des canaux de partie au Loup-Garou. Un mort est un
 * fantôme qui voit tous les rôles : un loup éliminé écrivait encore dans le
 * chat privé de la meute (« la Voyante, c'est X ») et tout mort dans le salon
 * du village, la règle « fantôme en lecture seule » n'existant que dans
 * l'interface. Lecture et signalement (mode 'read') restent ouverts.
 */

const { memberFindFirst, roomFindUnique, roomFindFirst } = vi.hoisted(() => ({
  memberFindFirst: vi.fn(),
  roomFindUnique: vi.fn(),
  roomFindFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    onlineRoomMember: { findFirst: memberFindFirst },
    onlineRoom: { findUnique: roomFindUnique, findFirst: roomFindFirst },
  },
}))
vi.mock('@/lib/friends', () => ({ areFriends: vi.fn() }))
vi.mock('@/lib/moderation/blocks', () => ({ isBlockedBetween: vi.fn() }))

import { resolveChatChannel } from './chat-access'
import { createLGState, type LGState } from '@/lib/loup-garou/engine'
import type { AuthUser } from '@/lib/auth-server'

const ROOM = 'salle-1'

/** Partie réelle de 8 joueurs (graine fixe) : rôles connus du test seulement. */
const base = createLGState(
  Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
  42,
  undefined,
  0
)
const wolf = base.players.find((p) => p.role === 'loup')!
const villager = base.players.find((p) => p.role !== 'loup' && p.role !== 'chasseur')!

const dead = (state: LGState, id: string, over: Partial<LGState> = {}): LGState => ({
  ...state,
  phase: 'day-debate',
  players: state.players.map((p) => (p.id === id ? { ...p, alive: false } : p)),
  ...over,
})

const userOf = (id: string) => ({ id }) as AuthUser

let current: { status: string; gameId: string; state: LGState }

beforeEach(() => {
  vi.clearAllMocks()
  current = { status: 'playing', gameId: 'loup-garou', state: base }
  memberFindFirst.mockResolvedValue({ roomId: ROOM })
  roomFindUnique.mockImplementation(async () => ({
    status: current.status,
    gameId: current.gameId,
    gameStateJson: JSON.stringify(current.state),
  }))
  roomFindFirst.mockImplementation(async ({ where }: { where: { status: string; gameId: string } }) =>
    where.status === current.status && where.gameId === current.gameId
      ? { gameStateJson: JSON.stringify(current.state) }
      : null
  )
})

describe('chat des loups', () => {
  it('loup mort en pleine partie : lecture oui, écriture refusée (chat_read_only)', async () => {
    current.state = dead(base, wolf.id)
    expect(await resolveChatChannel(userOf(wolf.id), 'wolves', null)).toEqual({
      ok: true,
      channel: `wolves:${ROOM}`,
      peerUserId: null,
    })
    expect(await resolveChatChannel(userOf(wolf.id), 'wolves', null, 'write')).toEqual({
      ok: false,
      error: 'chat_read_only',
      status: 403,
    })
  })

  it('loup vivant : écrit ; partie finie ou table revenue au lobby : le mort écrit aussi', async () => {
    expect((await resolveChatChannel(userOf(wolf.id), 'wolves', null, 'write')).ok).toBe(true)
    current.state = dead(base, wolf.id, { phase: 'finished', winnerTeam: 'village' })
    expect((await resolveChatChannel(userOf(wolf.id), 'wolves', null, 'write')).ok).toBe(true)
    current = { ...current, status: 'lobby', state: dead(base, wolf.id) }
    expect((await resolveChatChannel(userOf(wolf.id), 'wolves', null, 'write')).ok).toBe(true)
  })
})

describe('salon de la partie', () => {
  it('mort (fantôme) en pleine partie : lecture oui, écriture refusée', async () => {
    current.state = dead(base, villager.id)
    expect((await resolveChatChannel(userOf(villager.id), 'room', null)).ok).toBe(true)
    expect(await resolveChatChannel(userOf(villager.id), 'room', null, 'write')).toEqual({
      ok: false,
      error: 'chat_read_only',
      status: 403,
    })
  })

  it('le chasseur qui tire n’est pas un fantôme : il parle', async () => {
    const hunter = { ...base.players[0], role: 'chasseur' as const }
    current.state = dead(
      { ...base, players: [hunter, ...base.players.slice(1)] },
      hunter.id,
      { phase: 'hunter-shot', pendingHunterId: hunter.id }
    )
    expect((await resolveChatChannel(userOf(hunter.id), 'room', null, 'write')).ok).toBe(true)
  })

  it('vivant, autre jeu, partie finie : écriture permise', async () => {
    current.state = dead(base, villager.id)
    const other = base.players.find((p) => p.id !== villager.id)!
    expect((await resolveChatChannel(userOf(other.id), 'room', null, 'write')).ok).toBe(true)
    current = { ...current, gameId: 'quiz' }
    expect((await resolveChatChannel(userOf(villager.id), 'room', null, 'write')).ok).toBe(true)
    current = { ...current, gameId: 'loup-garou', state: { ...dead(base, villager.id), phase: 'finished' } }
    expect((await resolveChatChannel(userOf(villager.id), 'room', null, 'write')).ok).toBe(true)
  })

  it('autre jeu : l’état de la partie n’est même pas lu', async () => {
    current = { ...current, gameId: 'telephone-dessine' }
    await resolveChatChannel(userOf(villager.id), 'room', null, 'write')
    expect(roomFindUnique).not.toHaveBeenCalled()
    expect(roomFindFirst.mock.calls[0][0]).toMatchObject({
      where: { id: ROOM, status: 'playing', gameId: 'loup-garou' },
      select: { gameStateJson: true },
    })
  })
})
