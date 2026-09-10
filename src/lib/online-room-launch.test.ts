import { beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma et le lancement Président sont remplacés : on ne teste ici QUE la
// règle métier du vote « Rejouer » (compare-and-swap des votes, réclamation
// unique de la relance). La base est simulée par une ligne en mémoire dont
// `updateMany` respecte la clause `where` — c'est elle qui fait la course.
const { roomMock, historyMock, memberMock, sessionMock, launchPresidentMock } = vi.hoisted(() => ({
  roomMock: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  historyMock: { upsert: vi.fn() },
  memberMock: { updateMany: vi.fn() },
  // Journal des parties : écrit lui aussi au lancement, sans rien y changer.
  sessionMock: { create: vi.fn(), updateMany: vi.fn() },
  launchPresidentMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    onlineRoom: roomMock,
    onlineGameHistory: historyMock,
    onlineRoomMember: memberMock,
    onlineGameSession: sessionMock,
  },
}))
vi.mock('@/lib/online-president', () => ({ launchPresidentRoom: launchPresidentMock }))

import { processRematchVote } from '@/lib/online-room-launch'

const MEMBERS = ['u1', 'u2', 'u3']

/** État d'une partie de Président terminée, avec les votes déjà enregistrés. */
const finished = (votes: string[]) =>
  JSON.stringify({ version: 4, phase: 'finished', rematchVotes: votes })

/** État d'une partie fraîchement relancée (ce que produit un vrai lancement). */
const playing = () => JSON.stringify({ version: 1, phase: 'playing', rematchVotes: [] })

type Row = { gameStateJson: string | null; stateVersion: number }
let db: Row

/** Salle telle que la route la lit AVANT d'appeler processRematchVote. */
const roomInput = (row: Row) => ({
  id: 'room-1',
  gameId: 'president',
  hostUserId: 'u1',
  settingsJson: null,
  members: MEMBERS.map((userId) => ({ userId, user: { displayName: userId } })),
  gameStateJson: row.gameStateJson,
  stateVersion: row.stateVersion,
})

const votesInDb = () => (JSON.parse(db.gameStateJson ?? '{}').rematchVotes as string[]) ?? []

beforeEach(() => {
  vi.resetAllMocks()
  db = { gameStateJson: finished([]), stateVersion: 4 }
  roomMock.updateMany.mockImplementation(async ({ where, data }: { where: Row; data: Partial<Row> }) => {
    if (where.stateVersion !== db.stateVersion) return { count: 0 }
    db = { ...db, ...data }
    return { count: 1 }
  })
  roomMock.update.mockImplementation(async ({ data }: { data: Partial<Row> }) => {
    db = { ...db, ...data }
    return { ...db }
  })
  roomMock.findUnique.mockImplementation(async () => ({ ...db }))
  historyMock.upsert.mockResolvedValue({})
  sessionMock.updateMany.mockResolvedValue({ count: 0 })
  sessionMock.create.mockResolvedValue({})
  // Un vrai lancement remplace l'état terminé par la nouvelle partie.
  launchPresidentMock.mockImplementation(async () => {
    db = { gameStateJson: playing(), stateVersion: 1 }
  })
})

describe('processRematchVote', () => {
  it('enregistre le vote sans relancer tant que tout le monde n a pas voté', async () => {
    await processRematchVote('room-1', roomInput(db), 'u1')

    expect(votesInDb()).toEqual(['u1'])
    expect(db.stateVersion).toBe(5)
    expect(launchPresidentMock).not.toHaveBeenCalled()
  })

  it('ne perd aucun vote quand deux joueurs votent en même temps', async () => {
    const snapshot: Row = { gameStateJson: finished([]), stateVersion: 4 }
    // u2 gagne la course : la première écriture conditionnelle de u1 échoue.
    // Sans le compare-and-swap, u1 écrasait le vote de u2 en repartant de son
    // instantané périmé — et u2 croyait pourtant avoir voté.
    roomMock.updateMany.mockImplementationOnce(async () => {
      db = { gameStateJson: finished(['u2']), stateVersion: 5 }
      return { count: 0 }
    })

    await processRematchVote('room-1', roomInput(snapshot), 'u1')

    expect([...votesInDb()].sort()).toEqual(['u1', 'u2'])
    expect(db.stateVersion).toBe(6)
  })

  it('ne relance qu une seule fois quand les deux derniers votes se croisent', async () => {
    db = { gameStateJson: finished(['u2', 'u3']), stateVersion: 4 }
    const snapshot: Row = { ...db }
    let stateSeenAtLaunch: string | null = null

    // Le vote de u2 arrive PENDANT la relance déclenchée par u1, avec le même
    // instantané (version 4) : c'est exactement la fenêtre où l'ancienne garde
    // laissait passer une seconde distribution de cartes.
    launchPresidentMock.mockImplementationOnce(async () => {
      stateSeenAtLaunch = db.gameStateJson
      await processRematchVote('room-1', roomInput(snapshot), 'u2')
      db = { gameStateJson: playing(), stateVersion: 1 }
    })

    await processRematchVote('room-1', roomInput(snapshot), 'u1')

    expect(launchPresidentMock).toHaveBeenCalledTimes(1)
    // La relance dispose bien de l'état terminé (le Président y relit le
    // classement final pour les positions héritées).
    expect(stateSeenAtLaunch).toBe(finished(['u2', 'u3']))
    expect(db).toEqual({ gameStateJson: playing(), stateVersion: 1 })
  })

  it('ignore sans erreur un vote arrivé après la relance', async () => {
    const snapshot: Row = { gameStateJson: finished(['u2', 'u3']), stateVersion: 4 }
    db = { gameStateJson: playing(), stateVersion: 1 }

    await expect(processRematchVote('room-1', roomInput(snapshot), 'u1')).resolves.toBeUndefined()
    expect(launchPresidentMock).not.toHaveBeenCalled()
  })

  it('refuse un vote sur une partie qui n est pas terminée', async () => {
    await expect(
      processRematchVote('room-1', roomInput({ gameStateJson: playing(), stateVersion: 1 }), 'u1')
    ).rejects.toThrow('game_not_finished')
  })
})
