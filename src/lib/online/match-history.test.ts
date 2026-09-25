import { describe, expect, it } from 'vitest'
import {
  RECENT_TABLES_LIMIT,
  RECENT_TABLES_MAX,
  SAME_MATCH_WINDOW_MS,
  assembleRecentTables,
  clampRecentTablesLimit,
  listRecentTables,
  tableNameOf,
  type MatchHistoryClient,
  type OwnMatchRow,
  type PartnerAccount,
  type PartnerMatchRow,
} from './match-history'

const T0 = new Date('2026-09-20T21:00:00.000Z')
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs)

function own(overrides: Partial<OwnMatchRow> = {}): OwnMatchRow {
  return {
    roomId: 'room-1',
    gameId: 'quiz',
    outcome: 'win',
    rank: null,
    playerCount: 4,
    humanCount: 3,
    finishedAt: T0,
    ...overrides,
  }
}

function account(displayName: string, onlineDisplayName: string | null = null): PartnerAccount {
  return { displayName, onlineDisplayName }
}

describe('assembleRecentTables (regroupement par partie)', () => {
  it('une salle rejouée garde son roomId : chaque partie ne garde que SES partenaires', () => {
    // Même salle, deux parties à dix minutes d'écart (revanche) : Léa n'a
    // joué que la première, Tom que la seconde.
    const ownRows = [
      own({ finishedAt: at(10 * 60_000), outcome: 'loss' }),
      own({ finishedAt: T0 }),
    ]
    const partnerRows: PartnerMatchRow[] = [
      { roomId: 'room-1', userId: 'lea', finishedAt: at(800) },
      { roomId: 'room-1', userId: 'tom', finishedAt: at(10 * 60_000 + 200) },
    ]
    const tables = assembleRecentTables({
      selfUserId: 'me',
      ownRows,
      partnerRows,
      accounts: new Map([
        ['lea', account('Léa')],
        ['tom', account('Tom')],
      ]),
      friendIds: new Set(),
    })
    expect(tables.map((t) => t.partners.map((p) => p.userId))).toEqual([['tom'], ['lea']])
    expect(tables[0].outcome).toBe('loss')
    expect(tables[1].outcome).toBe('win')
  })

  it('fenêtre de ±5 s : incluse à la borne, exclue au-delà', () => {
    const tables = assembleRecentTables({
      selfUserId: 'me',
      ownRows: [own()],
      partnerRows: [
        { roomId: 'room-1', userId: 'avant', finishedAt: at(-SAME_MATCH_WINDOW_MS) },
        { roomId: 'room-1', userId: 'apres', finishedAt: at(SAME_MATCH_WINDOW_MS) },
        { roomId: 'room-1', userId: 'trop-tard', finishedAt: at(SAME_MATCH_WINDOW_MS + 1) },
        { roomId: 'room-2', userId: 'autre-salle', finishedAt: T0 },
      ],
      accounts: new Map([
        ['avant', account('Avant')],
        ['apres', account('Après')],
        ['trop-tard', account('Tard')],
        ['autre-salle', account('Ailleurs')],
      ]),
      friendIds: new Set(),
    })
    expect(tables[0].partners.map((p) => p.userId).sort()).toEqual(['apres', 'avant'])
  })

  it('exclut les comptes supprimés, soi-même et les doublons', () => {
    const tables = assembleRecentTables({
      selfUserId: 'me',
      ownRows: [own()],
      partnerRows: [
        { roomId: 'room-1', userId: 'me', finishedAt: T0 },
        { roomId: 'room-1', userId: 'lea', finishedAt: T0 },
        { roomId: 'room-1', userId: 'lea', finishedAt: at(1_000) },
        { roomId: 'room-1', userId: 'supprime', finishedAt: T0 },
      ],
      accounts: new Map([['lea', account('Léa')]]),
      friendIds: new Set(['supprime']),
    })
    expect(tables[0].partners).toEqual([{ userId: 'lea', name: 'Léa', isFriend: false }])
  })

  it('nom de table (pseudo en ligne sinon pseudo du compte), amis en tête', () => {
    const tables = assembleRecentTables({
      selfUserId: 'me',
      ownRows: [own({ rank: 2 })],
      partnerRows: [
        { roomId: 'room-1', userId: 'zoe', finishedAt: T0 },
        { roomId: 'room-1', userId: 'bob', finishedAt: T0 },
        { roomId: 'room-1', userId: 'max', finishedAt: T0 },
      ],
      accounts: new Map([
        ['zoe', account('Zoé')],
        ['bob', account('Robert', 'Bob')],
        ['max', account('Max', '   ')],
      ]),
      friendIds: new Set(['zoe']),
    })
    expect(tables[0].partners).toEqual([
      { userId: 'zoe', name: 'Zoé', isFriend: true },
      { userId: 'bob', name: 'Bob', isFriend: false },
      { userId: 'max', name: 'Max', isFriend: false },
    ])
    expect(tables[0]).toMatchObject({
      gameId: 'quiz',
      finishedAt: T0.toISOString(),
      rank: 2,
      playerCount: 4,
      humanCount: 3,
    })
  })

  it('une issue inconnue en base est lue comme une défaite', () => {
    const [table] = assembleRecentTables({
      selfUserId: 'me',
      ownRows: [own({ outcome: 'draw' })],
      partnerRows: [],
      accounts: new Map(),
      friendIds: new Set(),
    })
    expect(table.outcome).toBe('loss')
    expect(table.partners).toEqual([])
  })
})

describe('tableNameOf', () => {
  it('pseudo en ligne rogné, sinon pseudo du compte', () => {
    expect(tableNameOf(account('Compte', '  Enligne '))).toBe('Enligne')
    expect(tableNameOf(account('Compte', null))).toBe('Compte')
    expect(tableNameOf(account('Compte', ''))).toBe('Compte')
  })
})

describe('clampRecentTablesLimit (borne)', () => {
  it('ramène la limite dans [1, max]', () => {
    expect(clampRecentTablesLimit(10)).toBe(10)
    expect(clampRecentTablesLimit(0)).toBe(1)
    expect(clampRecentTablesLimit(-3)).toBe(1)
    expect(clampRecentTablesLimit(10_000)).toBe(RECENT_TABLES_MAX)
    expect(clampRecentTablesLimit(4.7)).toBe(4)
    expect(clampRecentTablesLimit(Number.NaN)).toBe(RECENT_TABLES_LIMIT)
  })
})

describe('listRecentTables (client factice)', () => {
  type Captured = {
    ownArgs?: { where?: unknown; take?: number; orderBy?: unknown }
    partnerArgs?: { where?: { userId?: unknown; OR?: unknown[] } }
    userArgs?: { where?: { id?: { in?: string[] } }; select?: Record<string, boolean> }
    friendshipCalls: number
  }

  /** Client factice : répond des lignes fixes et capture les arguments, ne touche aucune base. */
  const fakeClient = (
    captured: Captured,
    data: {
      ownRows: OwnMatchRow[]
      partnerRows: PartnerMatchRow[]
      users: { id: string; onlineDisplayName: string | null; displayName: string }[]
      friendships: { requesterId: string; addresseeId: string }[]
      /** Blocages enregistrés (qui a bloqué qui) — aucun par défaut. */
      blocks?: { blockerId: string; blockedId: string }[]
    }
  ) => {
    let matchCalls = 0
    return {
      onlineMatchResult: {
        findMany: async (args: { take?: number }) => {
          matchCalls += 1
          if (matchCalls === 1) {
            captured.ownArgs = args
            return data.ownRows.slice(0, args.take)
          }
          captured.partnerArgs = args as Captured['partnerArgs']
          return data.partnerRows
        },
      },
      user: {
        findMany: async (args: Captured['userArgs']) => {
          captured.userArgs = args
          const ids = new Set(args?.where?.id?.in ?? [])
          return data.users.filter((u) => ids.has(u.id))
        },
      },
      friendship: {
        findMany: async () => {
          captured.friendshipCalls += 1
          return data.friendships
        },
      },
      userBlock: {
        findMany: async () => data.blocks ?? [],
      },
    } as unknown as MatchHistoryClient
  }

  it('borne : 10 parties par défaut, les plus récentes d’abord, plafond respecté', async () => {
    const captured: Captured = { friendshipCalls: 0 }
    const ownRows = Array.from({ length: 30 }, (_, i) =>
      own({ roomId: `room-${i}`, finishedAt: at(-i * 60_000) })
    )
    const client = fakeClient(captured, { ownRows, partnerRows: [], users: [], friendships: [] })

    const tables = await listRecentTables('me', undefined, client)
    expect(tables).toHaveLength(RECENT_TABLES_LIMIT)
    expect(captured.ownArgs).toMatchObject({
      where: { userId: 'me' },
      orderBy: { finishedAt: 'desc' },
      take: RECENT_TABLES_LIMIT,
    })

    const capturedMax: Captured = { friendshipCalls: 0 }
    const clientMax = fakeClient(capturedMax, { ownRows, partnerRows: [], users: [], friendships: [] })
    await listRecentTables('me', 999, clientMax)
    expect(capturedMax.ownArgs?.take).toBe(RECENT_TABLES_MAX)
  })

  it('aucune partie : aucune autre lecture', async () => {
    const captured: Captured = { friendshipCalls: 0 }
    const client = fakeClient(captured, { ownRows: [], partnerRows: [], users: [], friendships: [] })
    expect(await listRecentTables('me', 10, client)).toEqual([])
    expect(captured.partnerArgs).toBeUndefined()
    expect(captured.userArgs).toBeUndefined()
    expect(captured.friendshipCalls).toBe(0)
  })

  it('partenaires : fenêtre par partie, comptes existants seulement, rien de privé lu', async () => {
    const captured: Captured = { friendshipCalls: 0 }
    const client = fakeClient(captured, {
      ownRows: [own()],
      partnerRows: [
        { roomId: 'room-1', userId: 'lea', finishedAt: T0 },
        { roomId: 'room-1', userId: 'parti', finishedAt: T0 },
      ],
      // `parti` a supprimé son compte : plus de ligne User.
      users: [{ id: 'lea', onlineDisplayName: 'Léa', displayName: 'lea42' }],
      friendships: [{ requesterId: 'lea', addresseeId: 'me' }],
    })

    const tables = await listRecentTables('me', 10, client)
    expect(tables[0].partners).toEqual([{ userId: 'lea', name: 'Léa', isFriend: true }])

    expect(captured.partnerArgs?.where?.userId).toEqual({ not: 'me' })
    expect(captured.partnerArgs?.where?.OR).toEqual([
      {
        roomId: 'room-1',
        finishedAt: { gte: at(-SAME_MATCH_WINDOW_MS), lte: at(SAME_MATCH_WINDOW_MS) },
      },
    ])
    expect(captured.userArgs?.where?.id?.in?.sort()).toEqual(['lea', 'parti'])
    // Ni e-mail ni code de compte : seuls l'id et les deux pseudos sont lus.
    expect(Object.keys(captured.userArgs?.select ?? {}).sort()).toEqual([
      'displayName',
      'id',
      'onlineDisplayName',
    ])
  })

  it('partenaire bloqué, dans un sens ou dans l’autre : absent de la liste, son compte n’est pas lu', async () => {
    const captured: Captured = { friendshipCalls: 0 }
    const client = fakeClient(captured, {
      ownRows: [own()],
      partnerRows: [
        { roomId: 'room-1', userId: 'lea', finishedAt: T0 },
        { roomId: 'room-1', userId: 'bloque', finishedAt: T0 },
        { roomId: 'room-1', userId: 'bloqueur', finishedAt: T0 },
      ],
      users: [
        { id: 'lea', onlineDisplayName: 'Léa', displayName: 'lea42' },
        { id: 'bloque', onlineDisplayName: 'Bloqué', displayName: 'b1' },
        { id: 'bloqueur', onlineDisplayName: 'Bloqueur', displayName: 'b2' },
      ],
      friendships: [],
      blocks: [
        { blockerId: 'me', blockedId: 'bloque' },
        { blockerId: 'bloqueur', blockedId: 'me' },
      ],
    })

    const tables = await listRecentTables('me', 10, client)
    expect(tables[0].partners).toEqual([{ userId: 'lea', name: 'Léa', isFriend: false }])
    expect(captured.userArgs?.where?.id?.in).toEqual(['lea'])
  })
})
