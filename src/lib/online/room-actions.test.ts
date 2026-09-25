import { beforeEach, describe, expect, it, vi } from 'vitest'

// Le cœur de la route action, sans HTTP : la base, le bus, l'expulsion, le
// classement et le minuteur sont simulés — on vérifie ce que le cœur leur
// demande. Le jeu est un adaptateur minimal dont `applyAction` est espionné.
const {
  roomRow,
  findUniqueMock,
  updateManyMock,
  transactionMock,
  publishMock,
  kickMemberMock,
  recordMatchResultsMock,
  armForStateMock,
  applyActionMock,
} = vi.hoisted(() => ({
  roomRow: { current: null as Record<string, unknown> | null },
  findUniqueMock: vi.fn(),
  updateManyMock: vi.fn(),
  transactionMock: vi.fn(),
  publishMock: vi.fn(),
  kickMemberMock: vi.fn(),
  recordMatchResultsMock: vi.fn(),
  armForStateMock: vi.fn(),
  applyActionMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    onlineRoom: { findUnique: findUniqueMock, updateMany: updateManyMock },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/online/room-bus', () => ({ publishRoomChanged: publishMock }))
vi.mock('@/lib/online-room', () => ({ kickMember: kickMemberMock }))
vi.mock('@/lib/online/match-results', () => ({ recordMatchResults: recordMatchResultsMock }))
vi.mock('@/lib/online/room-ticker', () => ({ armRoomTickerForState: armForStateMock }))
vi.mock('@/lib/online/game-adapters', () => ({
  getGameAdapter: (gameId: string | null) =>
    gameId === 'fake'
      ? {
          parse: (json: string | null) => (json ? JSON.parse(json) : null),
          serialize: (state: unknown) => JSON.stringify(state),
          applyAction: applyActionMock,
          convertToBot: (state: { players: { id: string; isBot?: boolean }[] }, userId: string) => ({
            ...state,
            players: state.players.map((p) => (p.id === userId ? { ...p, isBot: true } : p)),
          }),
          isFinished: (state: { finished?: boolean }) => state.finished === true,
          currentActorId: (state: { turn?: string }) => state.turn ?? null,
          actionResponse: (_state: unknown, viewerId: string) => ({ viewJson: `vue de ${viewerId}` }),
        }
      : null,
}))

import { SERVICE_ACTOR_ID, applyRoomAction } from '@/lib/online/room-actions'

const PLAYING = { turn: 'bot-1', players: [{ id: 'u1' }, { id: 'bot-1', isBot: true }] }

function setRoom(overrides: Record<string, unknown> = {}) {
  roomRow.current = {
    id: 'r1',
    hostUserId: 'u1',
    currentTurnUserId: 'bot-1',
    updatedAt: new Date(),
    stateVersion: 5,
    status: 'playing',
    gameId: 'fake',
    gameStateJson: JSON.stringify(PLAYING),
    members: [{ userId: 'u1' }, { userId: 'u2' }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setRoom()
  findUniqueMock.mockImplementation(async () => roomRow.current)
  updateManyMock.mockResolvedValue({ count: 1 })
  transactionMock.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => run({}))
  applyActionMock.mockReturnValue({ ok: true, state: { ...PLAYING, turn: 'u1' } })
})

describe('applyRoomAction — tick de service (acteur null)', () => {
  it('joue le tick sous un identifiant de service, écrit en compare-and-swap et réarme', async () => {
    const result = await applyRoomAction('r1', null, { action: 'bot', expectedVersion: 5 })

    expect(applyActionMock).toHaveBeenCalledWith(expect.anything(), SERVICE_ACTOR_ID, {
      action: 'bot',
      expectedVersion: 5,
    })
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1', stateVersion: 5 } })
    )
    expect(armForStateMock).toHaveBeenCalledWith('r1', {
      gameId: 'fake',
      state: { ...PLAYING, turn: 'u1' },
      stateVersion: 6,
    })
    expect(publishMock).toHaveBeenCalledWith('r1', { type: 'changed', stateVersion: 6 })
    // Pas de vue : personne ne lit la réponse du service.
    expect(result).toEqual({
      status: 200,
      body: { ok: true, stateVersion: 6, currentTurnUserId: 'u1' },
    })
  })

  it('n’a pas besoin d’être membre de la salle', async () => {
    setRoom({ members: [] })
    const result = await applyRoomAction('r1', null, { action: 'advance', phaseKey: 'vote#2' })
    expect(result.status).toBe(200)
  })

  it('n’agit JAMAIS à la place d’un humain : seuls bot et advance passent', async () => {
    for (const action of ['bid', 'dudo', 'replace-afk', 'replace-left', undefined]) {
      const result = await applyRoomAction('r1', null, { action })
      expect(result.status).toBe(400)
      expect(result.body.error).toBe('invalid_action')
    }
    expect(applyActionMock).not.toHaveBeenCalled()
    expect(updateManyMock).not.toHaveBeenCalled()
  })

  it('409 si un client a écrit avant lui (version attendue dépassée)', async () => {
    setRoom({ stateVersion: 6 })
    const result = await applyRoomAction('r1', null, { action: 'bot', expectedVersion: 5 })
    expect(result).toMatchObject({ status: 409, body: { error: 'version_conflict', stateVersion: 6 } })
    expect(updateManyMock).not.toHaveBeenCalled()
    expect(armForStateMock).not.toHaveBeenCalled()
  })

  it('409 si le compare-and-swap est perdu, sans réarmer', async () => {
    updateManyMock.mockResolvedValue({ count: 0 })
    const result = await applyRoomAction('r1', null, { action: 'bot', expectedVersion: 5 })
    expect(result).toMatchObject({ status: 409, body: { error: 'version_conflict' } })
    expect(armForStateMock).not.toHaveBeenCalled()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('salle hors partie : 400 game_not_active', async () => {
    setRoom({ status: 'waiting' })
    const result = await applyRoomAction('r1', null, { action: 'bot' })
    expect(result).toMatchObject({ status: 400, body: { error: 'game_not_active' } })
  })

  it('refus du moteur : un code stable, jamais son texte', async () => {
    applyActionMock.mockReturnValue({ ok: false, error: 'NOT_BOT_TURN', status: 409 })
    const result = await applyRoomAction('r1', null, { action: 'bot' })
    expect(result).toMatchObject({ status: 409, body: { error: 'action_failed' } })
    expect(updateManyMock).not.toHaveBeenCalled()
  })

  it('fin de partie : résultats en transaction, minuteur réarmé (donc coupé) sur l’état final', async () => {
    const finished = { ...PLAYING, finished: true }
    applyActionMock.mockReturnValue({ ok: true, state: finished })
    const result = await applyRoomAction('r1', null, { action: 'advance', phaseKey: 'vote#2' })

    expect(result.body).toMatchObject({ ok: true, stateVersion: 6, currentTurnUserId: null })
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(recordMatchResultsMock).toHaveBeenCalledWith(
      {},
      { roomId: 'r1', gameId: 'fake', state: finished }
    )
    expect(armForStateMock).toHaveBeenCalledWith('r1', {
      gameId: 'fake',
      state: finished,
      stateVersion: 6,
    })
    expect(publishMock).toHaveBeenCalledWith('r1', { type: 'finished', stateVersion: 6 })
  })
})

describe('applyRoomAction — joueur (contrat de la route inchangé)', () => {
  it('répond avec la vue du joueur', async () => {
    const result = await applyRoomAction('r1', 'u1', { action: 'play', expectedVersion: 5 })
    expect(applyActionMock).toHaveBeenCalledWith(expect.anything(), 'u1', expect.anything())
    expect(result).toEqual({
      status: 200,
      body: { ok: true, stateVersion: 6, viewJson: 'vue de u1', currentTurnUserId: 'u1' },
    })
  })

  it('un joueur retiré de la salle : 403 replaced_by_bot', async () => {
    const result = await applyRoomAction('r1', 'u9', { action: 'play' })
    expect(result).toMatchObject({ status: 403, body: { error: 'replaced_by_bot' } })
  })

  it('issue normale du jeu (statut < 400) : le code brut du moteur, tel quel', async () => {
    applyActionMock.mockReturnValue({ ok: false, error: 'GUESS_WRONG', status: 200 })
    const result = await applyRoomAction('r1', 'u1', { action: 'guess', text: 'chat' })
    expect(result).toEqual({ status: 200, body: { error: 'GUESS_WRONG' } })
  })

  it('remplacement AFK : l’inactif est expulsé avec sa raison, pour son prochain 403', async () => {
    setRoom({ currentTurnUserId: 'u2', updatedAt: new Date(Date.now() - 4 * 60_000) })
    const result = await applyRoomAction('r1', 'u1', { action: 'replace-afk' })
    expect(result.status).toBe(200)
    expect(applyActionMock).not.toHaveBeenCalled()
    expect(kickMemberMock).toHaveBeenCalledWith('r1', 'u1', 'u2', 'replaced_by_bot')
  })

  it('remplacement AFK trop tôt : 409 not_afk_yet, rien d’écrit', async () => {
    setRoom({ currentTurnUserId: 'u2', updatedAt: new Date() })
    const result = await applyRoomAction('r1', 'u1', { action: 'replace-afk' })
    expect(result).toMatchObject({ status: 409, body: { error: 'not_afk_yet' } })
    expect(updateManyMock).not.toHaveBeenCalled()
    expect(kickMemberMock).not.toHaveBeenCalled()
  })
})
