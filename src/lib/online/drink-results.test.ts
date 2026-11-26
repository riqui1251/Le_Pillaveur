import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { recordOnlineDrinkResults } from './drink-results'

/**
 * Lignes par compte de fin de partie en ligne. La base est simulée : on
 * vérifie les comptes cherchés et les lignes demandées, pas Prisma.
 */
const findManyMock = vi.fn()
const createManyMock = vi.fn()
const client = {
  user: { findMany: findManyMock },
  onlineDrinkResult: { createMany: createManyMock },
} as unknown as PrismaClient

/** La base connaît ces comptes, et seulement eux. */
function knownAccounts(...ids: string[]) {
  findManyMock.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.filter((id) => ids.includes(id)).map((id) => ({ id }))
  )
}

const record = (seats: { playerId: string; drinks: number }[]) =>
  recordOnlineDrinkResults(client, { roomId: 'r1', gameId: 'menteur', seats })

const writtenRows = () => createManyMock.mock.calls[0][0].data

beforeEach(() => {
  vi.resetAllMocks()
  knownAccounts('u1', 'u2', 'u3')
  createManyMock.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }))
})

describe('recordOnlineDrinkResults', () => {
  it('une ligne par compte, avec la salle et le jeu', async () => {
    expect(await record([{ playerId: 'u1', drinks: 4 }, { playerId: 'u2', drinks: 1 }])).toBe(2)
    expect(createManyMock).toHaveBeenCalledTimes(1)
    expect(writtenRows()).toEqual([
      { roomId: 'r1', gameId: 'menteur', userId: 'u1', drinks: 4 },
      { roomId: 'r1', gameId: 'menteur', userId: 'u2', drinks: 1 },
    ])
  })

  it('id préfixé `online-` : le compte derrière le siège', async () => {
    await record([{ playerId: 'online-u3', drinks: 2 }])
    expect(findManyMock).toHaveBeenCalledWith({ where: { id: { in: ['u3'] } }, select: { id: true } })
    expect(writtenRows()).toEqual([{ roomId: 'r1', gameId: 'menteur', userId: 'u3', drinks: 2 }])
  })

  it('bots de complément écartés avant même la lecture des comptes', async () => {
    await record([{ playerId: 'bot-1', drinks: 9 }, { playerId: 'online-bot-2', drinks: 3 }, { playerId: 'u1', drinks: 1 }])
    expect(findManyMock).toHaveBeenCalledWith({ where: { id: { in: ['u1'] } }, select: { id: true } })
    expect(writtenRows()).toEqual([{ roomId: 'r1', gameId: 'menteur', userId: 'u1', drinks: 1 }])
  })

  it('compte supprimé ou id inconnu : écarté, les autres lignes partent quand même', async () => {
    expect(await record([{ playerId: 'u1', drinks: 3 }, { playerId: 'parti-depuis', drinks: 5 }])).toBe(1)
    expect(writtenRows()).toEqual([{ roomId: 'r1', gameId: 'menteur', userId: 'u1', drinks: 3 }])
  })

  it('un même compte sur deux sièges : une seule ligne, gorgées additionnées', async () => {
    await record([{ playerId: 'u2', drinks: 2 }, { playerId: 'online-u2', drinks: 5 }])
    expect(findManyMock).toHaveBeenCalledWith({ where: { id: { in: ['u2'] } }, select: { id: true } })
    expect(writtenRows()).toEqual([{ roomId: 'r1', gameId: 'menteur', userId: 'u2', drinks: 7 }])
  })

  it('0 gorgée : la ligne est écrite, la partie compte', async () => {
    expect(await record([{ playerId: 'u1', drinks: 0 }])).toBe(1)
    expect(writtenRows()).toEqual([{ roomId: 'r1', gameId: 'menteur', userId: 'u1', drinks: 0 }])
  })

  it('une valeur mal formée tombe à 0 au lieu de partir en base', async () => {
    await record([{ playerId: 'u1', drinks: -3 }, { playerId: 'u2', drinks: 1.5 }])
    expect(writtenRows()).toEqual([
      { roomId: 'r1', gameId: 'menteur', userId: 'u1', drinks: 0 },
      { roomId: 'r1', gameId: 'menteur', userId: 'u2', drinks: 0 },
    ])
  })

  it('aucun siège : aucune requête', async () => {
    expect(await record([])).toBe(0)
    expect(findManyMock).not.toHaveBeenCalled()
    expect(createManyMock).not.toHaveBeenCalled()
  })

  it('que des bots : aucune requête', async () => {
    expect(await record([{ playerId: 'bot-1', drinks: 4 }])).toBe(0)
    expect(findManyMock).not.toHaveBeenCalled()
    expect(createManyMock).not.toHaveBeenCalled()
  })

  it('aucun compte connu : rien à écrire', async () => {
    knownAccounts()
    expect(await record([{ playerId: 'u9', drinks: 4 }])).toBe(0)
    expect(createManyMock).not.toHaveBeenCalled()
  })

  it('un échec d’écriture remonte à l’appelant, qui le journalise', async () => {
    createManyMock.mockRejectedValue(new Error('SQLITE_BUSY'))
    await expect(record([{ playerId: 'u1', drinks: 1 }])).rejects.toThrow('SQLITE_BUSY')
  })
})
