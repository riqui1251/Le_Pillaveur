import { describe, expect, it } from 'vitest'
import { REPLAY_MATES_LIMIT, pickReplayMates } from './room-invites'

const invitable = (...pairs: [string, string][]) => new Map<string, string>(pairs)

describe('pickReplayMates — qui reconvoquer pour rejouer', () => {
  it('propose les humains de la dernière table, sans soi-même', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      lastRoomIdByGame: { quiz: 'room-1' },
      matchRows: [
        { roomId: 'room-1', userId: 'me' },
        { roomId: 'room-1', userId: 'ana' },
        { roomId: 'room-1', userId: 'bob' },
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
      lastRoomIdByGame: { quiz: 'room-1' },
      matchRows: [
        { roomId: 'room-1', userId: 'ana' },
        { roomId: 'room-1', userId: 'ex-ami' },
      ],
      invitableById: invitable(['ana', 'Ana']),
    })
    expect(mates.quiz).toEqual([{ userId: 'ana', displayName: 'Ana' }])
  })

  it('ne rend rien pour une table qui n’avait que des bots (aucune ligne humaine)', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      lastRoomIdByGame: { quiz: 'room-solo' },
      matchRows: [],
      invitableById: invitable(['ana', 'Ana']),
    })
    expect(mates).toEqual({})
  })

  it('ne mélange pas les tables : chaque jeu ne voit que SA dernière salle', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      lastRoomIdByGame: { quiz: 'room-1', bluff: 'room-2' },
      matchRows: [
        { roomId: 'room-1', userId: 'ana' },
        { roomId: 'room-2', userId: 'bob' },
      ],
      invitableById: invitable(['ana', 'Ana'], ['bob', 'Bob']),
    })
    expect(mates).toEqual({
      quiz: [{ userId: 'ana', displayName: 'Ana' }],
      bluff: [{ userId: 'bob', displayName: 'Bob' }],
    })
  })

  it('dédoublonne un joueur qui a plusieurs résultats dans la même salle', () => {
    const mates = pickReplayMates({
      selfUserId: 'me',
      lastRoomIdByGame: { quiz: 'room-1' },
      matchRows: [
        { roomId: 'room-1', userId: 'ana' },
        { roomId: 'room-1', userId: 'ana' },
      ],
      invitableById: invitable(['ana', 'Ana']),
    })
    expect(mates.quiz).toEqual([{ userId: 'ana', displayName: 'Ana' }])
  })

  it('plafonne la proposition pour rester lisible sur mobile', () => {
    const many = Array.from({ length: REPLAY_MATES_LIMIT + 3 }, (_, i) => `u${i}`)
    const mates = pickReplayMates({
      selfUserId: 'me',
      lastRoomIdByGame: { quiz: 'room-1' },
      matchRows: many.map((userId) => ({ roomId: 'room-1', userId })),
      invitableById: new Map(many.map((id) => [id, id.toUpperCase()])),
    })
    expect(mates.quiz).toHaveLength(REPLAY_MATES_LIMIT)
  })
})
