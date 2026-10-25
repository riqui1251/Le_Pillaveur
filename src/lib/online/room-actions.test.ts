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
    gameId === 'fake' || gameId === 'autre-jeu'
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

// Votes de Dilemmes, cartes de Sans Filtre, dépôts du Petit Bac au STOP, dessins
// du Téléphone, réponse du Crobard pendant un trait : envoyés SANS version
// attendue. Une écriture concurrente entre la lecture et le compare-and-swap
// renvoyait un 409 muet côté client — le vote se perdait sans un mot.
describe('applyRoomAction — intention joueur concurrente (sans expectedVersion)', () => {
  /** Base fidèle au compare-and-swap : n'écrit que sur la version lue. */
  function casDatabase() {
    updateManyMock.mockImplementation(
      async ({ where, data }: { where: { stateVersion: number }; data: Record<string, unknown> }) => {
        if (!roomRow.current || where.stateVersion !== roomRow.current.stateVersion) return { count: 0 }
        roomRow.current = { ...roomRow.current, ...data }
        return { count: 1 }
      }
    )
    findUniqueMock.mockImplementation(async () => (roomRow.current ? { ...roomRow.current } : null))
    // Le moteur ajoute le vote de l'acteur à l'état qu'on lui donne.
    applyActionMock.mockImplementation((state: { votes?: string[] }, actorId: string) => ({
      ok: true,
      state: { ...state, votes: [...(state.votes ?? []), actorId] },
    }))
  }
  const votesInDb = () => (JSON.parse(String(roomRow.current?.gameStateJson)) as { votes?: string[] }).votes ?? []

  it('deux votes simultanés sur la même version : les deux sont écrits, aucun 409', async () => {
    casDatabase()

    const results = await Promise.all([
      applyRoomAction('r1', 'u1', { action: 'vote', choice: 'a' }),
      applyRoomAction('r1', 'u2', { action: 'vote', choice: 'b' }),
    ])

    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect([...votesInDb()].sort()).toEqual(['u1', 'u2'])
    expect(roomRow.current?.stateVersion).toBe(7)
    // Le perdant a relu la salle et rejoué le moteur sur l'état frais.
    expect(findUniqueMock).toHaveBeenCalledTimes(3)
    expect(applyActionMock).toHaveBeenCalledTimes(3)
  })

  it('rejoue le réducteur sur la salle relue, et répond avec la version écrite', async () => {
    casDatabase()
    // Un trait du dessinateur passe entre la lecture et l'écriture de la réponse.
    updateManyMock.mockImplementationOnce(async () => {
      roomRow.current = {
        ...roomRow.current,
        stateVersion: 6,
        gameStateJson: JSON.stringify({ ...PLAYING, votes: ['trait'] }),
      }
      return { count: 0 }
    })

    const result = await applyRoomAction('r1', 'u1', { action: 'guess', text: 'chat' })

    expect(result).toMatchObject({ status: 200, body: { ok: true, stateVersion: 7 } })
    expect(applyActionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ votes: ['trait'] }),
      'u1',
      { action: 'guess', text: 'chat' }
    )
    expect(updateManyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'r1', stateVersion: 6 } })
    )
    expect(votesInDb()).toEqual(['trait', 'u1'])
    expect(publishMock).toHaveBeenCalledTimes(1)
    expect(publishMock).toHaveBeenCalledWith('r1', { type: 'changed', stateVersion: 7 })
  })

  it('le moteur revalide sur l’état relu : son refus est la réponse', async () => {
    updateManyMock.mockResolvedValueOnce({ count: 0 })
    applyActionMock
      .mockReturnValueOnce({ ok: true, state: { ...PLAYING, turn: 'u1' } })
      .mockReturnValueOnce({ ok: false, error: 'ALREADY_SUBMITTED', status: 409 })

    const result = await applyRoomAction('r1', 'u1', { action: 'submit' })

    expect(result).toMatchObject({ status: 409, body: { error: 'action_failed' } })
    expect(updateManyMock).toHaveBeenCalledTimes(1)
  })

  it('abandonne après 5 écritures perdues : 409 version_conflict', async () => {
    updateManyMock.mockResolvedValue({ count: 0 })

    const result = await applyRoomAction('r1', 'u1', { action: 'vote' })

    expect(result).toMatchObject({ status: 409, body: { error: 'version_conflict' } })
    expect(updateManyMock).toHaveBeenCalledTimes(5)
    expect(armForStateMock).not.toHaveBeenCalled()
  })

  it('avec expectedVersion, le 409 reste : le client a demandé cette version-là', async () => {
    updateManyMock.mockResolvedValue({ count: 0 })

    const result = await applyRoomAction('r1', 'u1', { action: 'bid', expectedVersion: 5 })

    expect(result).toMatchObject({ status: 409, body: { error: 'version_conflict' } })
    expect(updateManyMock).toHaveBeenCalledTimes(1)
    expect(findUniqueMock).toHaveBeenCalledTimes(1)
  })

  it('un tick d’arbitre n’est jamais rejoué sur un état plus récent', async () => {
    updateManyMock.mockResolvedValue({ count: 0 })

    for (const action of ['bot', 'advance', 'replace-left']) {
      const result = await applyRoomAction('r1', 'u1', { action })
      expect(result).toMatchObject({ status: 409, body: { error: 'version_conflict' } })
    }
    expect(updateManyMock).toHaveBeenCalledTimes(3)
    expect(findUniqueMock).toHaveBeenCalledTimes(3)
  })

  it('la salle est revenue au lobby entre-temps : la relecture le dit', async () => {
    updateManyMock.mockImplementationOnce(async () => {
      setRoom({ status: 'waiting' })
      return { count: 0 }
    })

    const result = await applyRoomAction('r1', 'u1', { action: 'vote' })

    expect(result).toMatchObject({ status: 400, body: { error: 'game_not_active' } })
    expect(updateManyMock).toHaveBeenCalledTimes(1)
  })

  it('une autre partie a pris la place : rien n’est appliqué au nouveau jeu', async () => {
    updateManyMock.mockImplementationOnce(async () => {
      setRoom({ gameId: 'autre-jeu', stateVersion: 1 })
      return { count: 0 }
    })

    const result = await applyRoomAction('r1', 'u1', { action: 'vote' })

    expect(result).toMatchObject({ status: 409, body: { error: 'version_conflict' } })
    expect(applyActionMock).toHaveBeenCalledTimes(1)
    expect(updateManyMock).toHaveBeenCalledTimes(1)
  })
})
