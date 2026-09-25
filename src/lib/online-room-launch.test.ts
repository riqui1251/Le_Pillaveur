import { beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma et le lancement Président sont remplacés : on ne teste ici QUE la
// règle métier du vote « Rejouer » (compare-and-swap des votes, réclamation
// unique de la relance, quorum des présents). La base est simulée par une
// ligne en mémoire dont `updateMany` respecte la clause `where` — c'est elle
// qui fait la course.
const { roomMock, historyMock, memberMock, sessionMock, launchPresidentMock } = vi.hoisted(() => ({
  roomMock: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  historyMock: { upsert: vi.fn() },
  memberMock: { updateMany: vi.fn(), deleteMany: vi.fn() },
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

import { processRematchVote, REMATCH_PRESENCE_MS, resetRoomToWaitingLobby } from '@/lib/online-room-launch'

const MEMBERS = ['u1', 'u2', 'u3']

/**
 * Trace d'un membre parti sans quitter : bien au-delà de la fenêtre de
 * présence (le double), là où aucun retard de sondage ne peut la ramener.
 */
const absentSince = () => new Date(Date.now() - 2 * REMATCH_PRESENCE_MS)

/** État d'une partie de Président terminée, avec les votes déjà enregistrés. */
const finished = (votes: string[]) =>
  JSON.stringify({ version: 4, phase: 'finished', rematchVotes: votes })

/** État d'une partie fraîchement relancée (ce que produit un vrai lancement). */
const playing = () => JSON.stringify({ version: 1, phase: 'playing', rematchVotes: [] })

type Row = { gameStateJson: string | null; stateVersion: number }
let db: Row

/**
 * Salle telle que la route la lit AVANT d'appeler processRematchVote. Tous
 * présents (vus à l'instant) sauf `absent`, dont la trace est périmée.
 */
const roomInput = (row: Row, absent: string[] = []) => ({
  id: 'room-1',
  gameId: 'president',
  hostUserId: 'u1',
  settingsJson: null,
  members: MEMBERS.map((userId) => ({
    userId,
    user: { displayName: userId },
    lastSeenAt: absent.includes(userId) ? absentSince() : new Date(),
  })),
  gameStateJson: row.gameStateJson,
  stateVersion: row.stateVersion,
})

/** Effectif effectivement transmis au lancement (la nouvelle distribution). */
const launchedMemberIds = () =>
  (launchPresidentMock.mock.calls[0]?.[1] as { members: { userId: string }[] }).members.map(
    (m) => m.userId
  )

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
  memberMock.deleteMany.mockResolvedValue({ count: 0 })
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

// Quorum des PRÉSENTS : un membre dont la trace a plus de REMATCH_PRESENCE_MS
// ne bloque plus la relance — il en est retiré. Public en soirée, sur
// téléphone : une personne doit toujours pouvoir débloquer la table.
describe('processRematchVote — présence', () => {
  it('relance sans attendre le vote d un membre absent, et le retire de la table', async () => {
    db = { gameStateJson: finished(['u2']), stateVersion: 4 }

    // u3 a fermé l'onglet sans quitter : u1 et u2 suffisent.
    await processRematchVote('room-1', roomInput(db, ['u3']), 'u1')

    expect(launchPresidentMock).toHaveBeenCalledTimes(1)
    expect(launchedMemberIds()).toEqual(['u1', 'u2'])
    expect(memberMock.deleteMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', userId: { in: ['u3'] } },
    })
    expect(db).toEqual({ gameStateJson: playing(), stateVersion: 1 })
  })

  it('ne compte pas le vote d un membre qui a voté puis est parti', async () => {
    // u3 a voté avant de fermer l'onglet : son vote ne remplace pas celui de
    // u2, toujours là et qui n'a pas encore cliqué.
    db = { gameStateJson: finished(['u3']), stateVersion: 4 }

    await processRematchVote('room-1', roomInput(db, ['u3']), 'u1')

    expect(launchPresidentMock).not.toHaveBeenCalled()
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
    expect([...votesInDb()].sort()).toEqual(['u1', 'u3'])

    // Le vote de u2 complète le quorum des présents : relance sans u3.
    await processRematchVote('room-1', roomInput(db, ['u3']), 'u2')

    expect(launchPresidentMock).toHaveBeenCalledTimes(1)
    expect(launchedMemberIds()).toEqual(['u1', 'u2'])
    expect(memberMock.deleteMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', userId: { in: ['u3'] } },
    })
  })

  it('relance seul quand tous les autres sont absents (solo contre les bots)', async () => {
    await processRematchVote('room-1', roomInput(db, ['u2', 'u3']), 'u1')

    expect(launchPresidentMock).toHaveBeenCalledTimes(1)
    expect(launchedMemberIds()).toEqual(['u1'])
    expect(memberMock.deleteMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1', userId: { in: ['u2', 'u3'] } },
    })
  })

  it('exige toujours le vote de chacun quand tout le monde est présent', async () => {
    db = { gameStateJson: finished(['u2']), stateVersion: 4 }

    await processRematchVote('room-1', roomInput(db), 'u1')

    expect(launchPresidentMock).not.toHaveBeenCalled()
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
    expect([...votesInDb()].sort()).toEqual(['u1', 'u2'])

    await processRematchVote('room-1', roomInput(db), 'u3')

    expect(launchPresidentMock).toHaveBeenCalledTimes(1)
    expect(launchedMemberIds()).toEqual(['u1', 'u2', 'u3'])
    // Personne à retirer : pas la moindre écriture sur les membres.
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
  })

  it('retire les absents AVANT de lancer la nouvelle partie', async () => {
    db = { gameStateJson: finished(['u2']), stateVersion: 4 }
    let removedAtLaunch = false
    launchPresidentMock.mockImplementationOnce(async () => {
      removedAtLaunch = memberMock.deleteMany.mock.calls.length === 1
      db = { gameStateJson: playing(), stateVersion: 1 }
    })

    await processRematchVote('room-1', roomInput(db, ['u3']), 'u1')

    // Le moteur distribue à `members` : un fantôme encore en base au
    // lancement aurait eu un tour qui ne vient jamais.
    expect(removedAtLaunch).toBe(true)
  })

  it('transmet l hôte au plus ancien présent quand l hôte est absent', async () => {
    db = { gameStateJson: finished(['u3']), stateVersion: 4 }

    // u1 est l'hôte (roomInput) et a fermé l'onglet : u2 et u3 relancent.
    await processRematchVote('room-1', roomInput(db, ['u1']), 'u2')

    expect(launchPresidentMock).toHaveBeenCalledTimes(1)
    expect(launchedMemberIds()).toEqual(['u2', 'u3'])
    expect(roomMock.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { hostUserId: 'u2' },
    })
    expect(launchPresidentMock.mock.calls[0][1]).toMatchObject({ hostUserId: 'u2' })
  })

  it('tient le votant pour présent même si sa trace est périmée', async () => {
    db = { gameStateJson: finished(['u2', 'u3']), stateVersion: 4 }

    // Onglet revenu au premier plan, clic avant le premier sondage : la
    // requête de vote prouve qu'il est là.
    await processRematchVote('room-1', roomInput(db, ['u1']), 'u1')

    expect(launchPresidentMock).toHaveBeenCalledTimes(1)
    expect(launchedMemberIds()).toEqual(['u1', 'u2', 'u3'])
    expect(memberMock.deleteMany).not.toHaveBeenCalled()
  })
})

describe('resetRoomToWaitingLobby', () => {
  it('rend à chacun le délai de grâce du lobby : présence remise à maintenant, tous « pas prêts »', async () => {
    // En partie, la trace d'un onglet caché date de son dernier coup : sans
    // cette remise, le premier sondage du lobby le purgeait sur-le-champ.
    const before = Date.now()

    await resetRoomToWaitingLobby('room-1')

    expect(memberMock.updateMany).toHaveBeenCalledWith({
      where: { roomId: 'room-1' },
      data: { isReady: false, lastSeenAt: expect.any(Date) },
    })
    const { data } = memberMock.updateMany.mock.calls[0][0] as { data: { lastSeenAt: Date } }
    expect(data.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before)
  })
})
