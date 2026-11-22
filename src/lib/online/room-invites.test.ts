import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resultMock, friendshipMock } = vi.hoisted(() => ({
  resultMock: { findMany: vi.fn() },
  friendshipMock: { findMany: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { onlineMatchResult: resultMock, friendship: friendshipMock },
}))

import { SAME_MATCH_WINDOW_MS } from './match-history'
import { REPLAY_MATES_LIMIT, buildReplayMatesForUser, pickReplayMates } from './room-invites'

const invitable = (...pairs: [string, string][]) => new Map<string, string>(pairs)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('pickReplayMates — qui reconvoquer pour rejouer', () => {
  it('propose les humains de la dernière partie, sans soi-même', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      matchRows: [
        { gameId: 'quiz', userId: 'me' },
        { gameId: 'quiz', userId: 'ana' },
        { gameId: 'quiz', userId: 'bob' },
      ],
      invitableById: invitable(['ana', 'Ana'], ['bob', 'Bob']),
    })
    expect(mates).toEqual({
      quiz: [
        { userId: 'ana', displayName: 'Ana' },
        { userId: 'bob', displayName: 'Bob' },
      ],
    })
  })

  it('ignore les joueurs qui ne sont plus invitables (amitié rompue, compte supprimé, banni)', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      matchRows: [
        { gameId: 'quiz', userId: 'ana' },
        { gameId: 'quiz', userId: 'ex-ami' },
      ],
      invitableById: invitable(['ana', 'Ana']),
    })
    expect(mates.quiz).toEqual([{ userId: 'ana', displayName: 'Ana' }])
  })

  it('ne rend rien pour une table qui n’avait que des bots (aucune ligne humaine)', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      matchRows: [],
      invitableById: invitable(['ana', 'Ana']),
    })
    expect(mates).toEqual({})
  })

  it('ne mélange pas les jeux : chacun ne voit que les joueurs de SA dernière partie', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      matchRows: [
        { gameId: 'quiz', userId: 'ana' },
        { gameId: 'bluff', userId: 'bob' },
      ],
      invitableById: invitable(['ana', 'Ana'], ['bob', 'Bob']),
    })
    expect(mates).toEqual({
      quiz: [{ userId: 'ana', displayName: 'Ana' }],
      bluff: [{ userId: 'bob', displayName: 'Bob' }],
    })
  })

  it('un même partenaire peut être proposé pour deux jeux', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      matchRows: [
        { gameId: 'quiz', userId: 'ana' },
        { gameId: 'bluff', userId: 'ana' },
      ],
      invitableById: invitable(['ana', 'Ana']),
    })
    expect(mates).toEqual({
      quiz: [{ userId: 'ana', displayName: 'Ana' }],
      bluff: [{ userId: 'ana', displayName: 'Ana' }],
    })
  })

  it('dédoublonne un joueur qui a plusieurs lignes pour le même jeu', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      matchRows: [
        { gameId: 'quiz', userId: 'ana' },
        { gameId: 'quiz', userId: 'ana' },
      ],
      invitableById: invitable(['ana', 'Ana']),
    })
    expect(mates.quiz).toEqual([{ userId: 'ana', displayName: 'Ana' }])
  })

  it('plafonne la proposition pour rester lisible sur mobile', () => {
    const many = Array.from({ length: REPLAY_MATES_LIMIT + 3 }, (_, i) => `u${i}`)
    const mates = pickReplayMates({
      selfUserId: 'me',
      matchRows: many.map((userId) => ({ gameId: 'quiz', userId })),
      invitableById: new Map(many.map((id) => [id, id.toUpperCase()])),
    })
    expect(mates.quiz).toHaveLength(REPLAY_MATES_LIMIT)
  })
})

/**
 * Une salle rejouée ou passée à un autre jeu garde son identifiant : la lire
 * en entier reproposait un joueur parti avant la dernière manche, ou venu pour
 * un autre jeu. Les partenaires se lisent donc PARTIE par partie.
 */
describe('buildReplayMatesForUser — partenaires de la dernière PARTIE, pas de la salle', () => {
  const QUIZ_END = new Date('2026-11-21T21:05:00.000Z')
  const BLUFF_END = new Date('2026-11-21T22:10:00.000Z')

  const friend = (id: string, displayName: string) => ({
    requesterId: 'me',
    addresseeId: id,
    requester: { id: 'me', displayName: 'Moi', banType: null, bannedUntil: null, banComment: null, bannedAt: null },
    addressee: { id, displayName, banType: null, bannedUntil: null, banComment: null, bannedAt: null },
  })

  it('borne chaque jeu à sa dernière partie : même salle, même jeu, même fin', async () => {
    resultMock.findMany
      // Dernière partie de chaque jeu, jouées dans la MÊME salle.
      .mockResolvedValueOnce([
        { gameId: 'bluff', roomId: 'r1', finishedAt: BLUFF_END },
        { gameId: 'quiz', roomId: 'r1', finishedAt: QUIZ_END },
      ])
      // Ce que la base rend une fois bornée : Ana au Quiz, Bob au Bluff.
      .mockResolvedValueOnce([
        { gameId: 'quiz', userId: 'ana' },
        { gameId: 'bluff', userId: 'bob' },
      ])
    friendshipMock.findMany.mockResolvedValue([friend('ana', 'Ana'), friend('bob', 'Bob')])

    const mates = await buildReplayMatesForUser('me', ['quiz', 'bluff'])

    expect(mates).toEqual({
      quiz: [{ userId: 'ana', displayName: 'Ana' }],
      bluff: [{ userId: 'bob', displayName: 'Bob' }],
    })

    const [lastMatches, partners] = resultMock.findMany.mock.calls.map(([args]) => args)
    expect(lastMatches).toMatchObject({
      where: { userId: 'me', gameId: { in: ['quiz', 'bluff'] } },
      orderBy: { finishedAt: 'desc' },
      distinct: ['gameId'],
    })
    const window = (end: Date) => ({
      gte: new Date(end.getTime() - SAME_MATCH_WINDOW_MS),
      lte: new Date(end.getTime() + SAME_MATCH_WINDOW_MS),
    })
    // Jamais « toute la salle » : une revanche ou un autre jeu y ont laissé d'autres joueurs.
    expect(partners.where).toEqual({
      userId: { not: 'me' },
      OR: [
        { roomId: 'r1', gameId: 'bluff', finishedAt: window(BLUFF_END) },
        { roomId: 'r1', gameId: 'quiz', finishedAt: window(QUIZ_END) },
      ],
    })
    expect(partners.select).toEqual({ gameId: true, userId: true })
  })

  it('aucun jeu demandé, ou aucune partie classée : rien, sans lecture inutile', async () => {
    expect(await buildReplayMatesForUser('me', [])).toEqual({})
    expect(resultMock.findMany).not.toHaveBeenCalled()

    resultMock.findMany.mockResolvedValueOnce([])
    expect(await buildReplayMatesForUser('me', ['quiz'])).toEqual({})
    expect(resultMock.findMany).toHaveBeenCalledTimes(1)
    expect(friendshipMock.findMany).not.toHaveBeenCalled()
  })

  it('dernière partie jouée contre des bots seulement : personne à reproposer', async () => {
    resultMock.findMany
      .mockResolvedValueOnce([{ gameId: 'quiz', roomId: 'r1', finishedAt: QUIZ_END }])
      .mockResolvedValueOnce([])

    expect(await buildReplayMatesForUser('me', ['quiz'])).toEqual({})
    expect(friendshipMock.findMany).not.toHaveBeenCalled()
  })

  it('un partenaire banni n’est pas proposé', async () => {
    resultMock.findMany
      .mockResolvedValueOnce([{ gameId: 'quiz', roomId: 'r1', finishedAt: QUIZ_END }])
      .mockResolvedValueOnce([
        { gameId: 'quiz', userId: 'ana' },
        { gameId: 'quiz', userId: 'banni' },
      ])
    const banned = friend('banni', 'Banni')
    banned.addressee = { ...banned.addressee, banType: 'permanent' as unknown as null }
    friendshipMock.findMany.mockResolvedValue([friend('ana', 'Ana'), banned])

    expect(await buildReplayMatesForUser('me', ['quiz'])).toEqual({
      quiz: [{ userId: 'ana', displayName: 'Ana' }],
    })
  })
})
