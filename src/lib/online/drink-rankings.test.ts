import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { STAFF_TOGGLEABLE_GAME_IDS } from '@/lib/game-catalog'
import { GAMES } from '@/lib/games'
import { DEFAULT_ONLINE_PREFERENCES } from '@/lib/online-preferences'
import { DEFAULT_ONLINE_ICON, ONLINE_ICON_IDS } from '@/lib/online/cosmetics'
import { DRINK_RANKING_TOP, anonymizeDrinkBoards, buildDrinkRankingsOverview } from './drink-rankings'

/**
 * Classement des comptes par gorgées bues en ligne : vraie agrégation, vrai
 * catalogue ; seule la base est simulée (groupBy et lecture des comptes).
 */

const [A, B, C] = STAFF_TOGGLEABLE_GAME_IDS
const CODE_HIDDEN = GAMES.find((game) => game.hidden)?.id
const OTHER_ICON = ONLINE_ICON_IDS.find((id) => id !== DEFAULT_ONLINE_ICON) ?? DEFAULT_ONLINE_ICON

type GroupRow = { gameId: string; userId: string; drinks: number; games: number }
type FakeUser = {
  id: string
  displayName: string | null
  onlineDisplayName: string | null
  onlinePreferencesJson: string | null
}

/** Base factice : rend les lignes agrégées et les comptes demandés, compte les appels. */
function fakeClient(rows: GroupRow[], users: FakeUser[] = []) {
  const calls = { groupBy: 0, findMany: 0, wantedIds: [] as string[] }
  const client = {
    onlineDrinkResult: {
      groupBy: async () => {
        calls.groupBy++
        return rows.map((r) => ({ gameId: r.gameId, userId: r.userId, _sum: { drinks: r.drinks }, _count: { _all: r.games } }))
      },
    },
    user: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        calls.findMany++
        calls.wantedIds = [...args.where.id.in].sort()
        return users.filter((u) => args.where.id.in.includes(u.id))
      },
    },
  } as unknown as PrismaClient
  return { client, calls }
}

const user = (id: string, name: string): FakeUser => ({
  id,
  displayName: name,
  onlineDisplayName: null,
  onlinePreferencesJson: null,
})

/** `count` comptes sur le jeu A, du plus gros buveur (u01) au plus petit. */
const ladder = (count: number): GroupRow[] =>
  Array.from({ length: count }, (_, i) => ({
    gameId: A,
    userId: `u${String(i + 1).padStart(2, '0')}`,
    drinks: 100 - i,
    games: 3,
  }))

describe('buildDrinkRankingsOverview', () => {
  it('trie par gorgées, puis par parties (moins = mieux), puis par id', async () => {
    const { client } = fakeClient([
      { gameId: A, userId: 'u-a', drinks: 10, games: 4 },
      { gameId: A, userId: 'u-d', drinks: 10, games: 2 },
      { gameId: A, userId: 'u-c', drinks: 12, games: 9 },
      { gameId: A, userId: 'u-b', drinks: 10, games: 2 },
    ])

    const [board] = await buildDrinkRankingsOverview(client, null, [])

    expect(board.rows.map((r) => [r.userId, r.position])).toEqual([
      ['u-c', 1],
      ['u-b', 2],
      ['u-d', 3],
      ['u-a', 4],
    ])
    expect(board.rows[0]).toMatchObject({ drinks: 12, games: 9 })
  })

  it('top 5, et le demandeur 14e reçoit sa ligne avec sa vraie position', async () => {
    const { client, calls } = fakeClient(ladder(20), [user('u01', 'Alice'), user('u14', 'Moi')])

    const [board] = await buildDrinkRankingsOverview(client, 'u14', [])

    expect(DRINK_RANKING_TOP).toBe(5)
    expect(board.rows).toHaveLength(5)
    expect(board.rows.map((r) => r.position)).toEqual([1, 2, 3, 4, 5])
    expect(board.totalPlayers).toBe(20)
    expect(board.me).toMatchObject({ userId: 'u14', displayName: 'Moi', drinks: 87, games: 3, position: 14 })
    expect(calls).toEqual({ groupBy: 1, findMany: 1, wantedIds: ['u01', 'u02', 'u03', 'u04', 'u05', 'u14'] })
  })

  it('demandeur dans le top : `me` reprend sa ligne du top', async () => {
    const { client } = fakeClient(ladder(8))

    const [board] = await buildDrinkRankingsOverview(client, 'u02', [])

    expect(board.me).toEqual(board.rows[1])
    expect(board.me?.position).toBe(2)
  })

  it('demandeur non classé ou visiteur : pas de `me`, son compte n’est pas lu', async () => {
    const { client, calls } = fakeClient(ladder(3))

    const [asStranger] = await buildDrinkRankingsOverview(client, 'inconnu', [])
    expect(asStranger.me).toBeNull()
    expect(calls.wantedIds).toEqual(['u01', 'u02', 'u03'])

    const [asVisitor] = await buildDrinkRankingsOverview(client, null, [])
    expect(asVisitor.me).toBeNull()
  })

  it('écarte les jeux cachés (équipe ou code) et inconnus, garde l’ordre du catalogue', async () => {
    const { client } = fakeClient([
      { gameId: C, userId: 'u1', drinks: 5, games: 1 },
      { gameId: 'jeu-disparu', userId: 'u1', drinks: 50, games: 1 },
      { gameId: B, userId: 'u1', drinks: 7, games: 1 },
      { gameId: A, userId: 'u2', drinks: 3, games: 1 },
      ...(CODE_HIDDEN ? [{ gameId: CODE_HIDDEN, userId: 'u1', drinks: 9, games: 1 }] : []),
    ])

    const boards = await buildDrinkRankingsOverview(client, null, [B])

    expect(boards.map((b) => b.gameId)).toEqual([A, C])
  })

  it('pseudo en ligne d’abord, puis pseudo du compte, sinon un tiret ; préférences relues', async () => {
    const { client } = fakeClient(
      [
        { gameId: A, userId: 'u1', drinks: 9, games: 1 },
        { gameId: A, userId: 'u2', drinks: 8, games: 1 },
        { gameId: A, userId: 'u3', drinks: 7, games: 1 },
      ],
      [
        { id: 'u1', displayName: 'Compte', onlineDisplayName: 'EnLigne', onlinePreferencesJson: JSON.stringify({ icon: OTHER_ICON }) },
        { id: 'u2', displayName: 'Bob', onlineDisplayName: null, onlinePreferencesJson: '{pas du json' },
      ]
    )

    const [board] = await buildDrinkRankingsOverview(client, null, [])

    expect(board.rows.map((r) => r.displayName)).toEqual(['EnLigne', 'Bob', '—'])
    expect(board.rows[0].preferences.icon).toBe(OTHER_ICON)
    expect(board.rows[1].preferences).toEqual(DEFAULT_ONLINE_PREFERENCES)
  })

  it('aucune ligne : aucun tableau, aucune lecture des comptes', async () => {
    const { client, calls } = fakeClient([])

    expect(await buildDrinkRankingsOverview(client, 'u1', [])).toEqual([])
    expect(calls.findMany).toBe(0)
  })
})

describe('anonymizeDrinkBoards', () => {
  it('garde rangs et chiffres, ne laisse fuir ni id, ni pseudo, ni icône', async () => {
    const { client } = fakeClient(
      [...ladder(7), { gameId: B, userId: 'u01', drinks: 4, games: 2 }],
      [
        { id: 'u01', displayName: 'Alice', onlineDisplayName: 'AliceEnLigne', onlinePreferencesJson: JSON.stringify({ icon: OTHER_ICON }) },
        user('u07', 'Moi'),
      ]
    )
    const boards = await buildDrinkRankingsOverview(client, 'u07', [])

    const anonymous = anonymizeDrinkBoards(boards)

    expect(anonymous.map((b) => [b.gameId, b.totalPlayers, b.me])).toEqual([
      [A, 7, null],
      [B, 1, null],
    ])
    expect(anonymous[0].rows).toHaveLength(5)
    expect(anonymous[0].rows[0]).toEqual({ userId: `${A}#1`, displayName: null, preferences: {}, drinks: 100, games: 3, position: 1 })
    expect(anonymous[1].rows).toEqual([{ userId: `${B}#1`, displayName: null, preferences: {}, drinks: 4, games: 2, position: 1 }])
    const text = JSON.stringify(anonymous)
    for (const leak of ['u01', 'u07', 'Alice', 'Moi', OTHER_ICON]) expect(text).not.toContain(leak)
  })
})
