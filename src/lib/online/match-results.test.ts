import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { XP_LOSS, XP_WIN, streakBonusXp } from '@/lib/online/cosmetics'
import { clearXpGains, recallXpGain } from '@/lib/online/xp'
import {
  computeMatchResults,
  matchOutcomesFor,
  recordMatchResults,
  type MatchOutcome,
} from './match-results'

/**
 * Règles du classement en ligne : qui est enregistré, qui gagne, qui perd.
 * Les extracteurs par jeu ne lisent que quelques champs de l'état final —
 * les états de test sont des littéraux minimaux (mêmes formes que les moteurs).
 */

const O = (playerId: string, won: boolean, isBot = false, rank?: number): MatchOutcome => ({
  playerId,
  isBot,
  won,
  rank,
})

describe('computeMatchResults (règles de comptage)', () => {
  it('partie à 2 comptes : un gagnant, un perdant', () => {
    const rows = computeMatchResults([O('u1', true), O('u2', false)])
    expect(rows).toEqual([
      { userId: 'u1', outcome: 'win', rank: null, playerCount: 2, humanCount: 2 },
      { userId: 'u2', outcome: 'loss', rank: null, playerCount: 2, humanCount: 2 },
    ])
  })

  it('les bots de complément (bot-N) ne sont jamais enregistrés', () => {
    const rows = computeMatchResults([
      O('u1', false),
      O('u2', true),
      O('bot-1', false, true),
      O('bot-2', false, true),
    ])
    expect(rows.map((r) => r.userId).sort()).toEqual(['u1', 'u2'])
    // Mais ils comptent dans l'effectif total de la partie.
    expect(rows[0].playerCount).toBe(4)
    expect(rows[0].humanCount).toBe(2)
  })

  it('moins de 2 comptes (solo contre bots) → partie non comptée', () => {
    expect(computeMatchResults([O('u1', true), O('bot-1', false, true)])).toEqual([])
    expect(computeMatchResults([O('u1', true)])).toEqual([])
  })

  it('déserteur (compte converti en bot) : défaite, même si son bot a gagné', () => {
    const rows = computeMatchResults([O('u1', false), O('u2', true, true)])
    expect(rows.find((r) => r.userId === 'u2')?.outcome).toBe('loss')
    expect(rows.find((r) => r.userId === 'u1')?.outcome).toBe('loss')
  })

  it('le rang est conservé quand le jeu en produit un', () => {
    const rows = computeMatchResults([O('u1', true, false, 1), O('u2', false, false, 2)])
    expect(rows.find((r) => r.userId === 'u1')?.rank).toBe(1)
    expect(rows.find((r) => r.userId === 'u2')?.rank).toBe(2)
  })
})

describe('matchOutcomesFor (extraction par jeu)', () => {
  it('petit-buveur : winner unique par id', () => {
    const state = {
      winner: 'u1',
      players: [{ id: 'u1' }, { id: 'u2', isBot: true }],
    }
    expect(matchOutcomesFor('petit-buveur', state)).toEqual([
      { playerId: 'u1', isBot: false, won: true },
      { playerId: 'u2', isBot: true, won: false },
    ])
  })

  it('toucher-coule : victoire par équipe', () => {
    const state = {
      winner: 'B',
      players: [
        { id: 'u1', isBot: false, team: 'A' },
        { id: 'u2', isBot: false, team: 'B' },
        { id: 'bot-1', isBot: true, team: 'B' },
      ],
    }
    const out = matchOutcomesFor('toucher-coule', state)!
    expect(out.map((o) => o.won)).toEqual([false, true, true])
  })

  it('menteur : winnerId unique', () => {
    const state = {
      winnerId: 'u2',
      players: [
        { id: 'u1', isBot: false },
        { id: 'u2', isBot: false },
      ],
    }
    const out = matchOutcomesFor('menteur', state)!
    expect(out.find((o) => o.playerId === 'u2')?.won).toBe(true)
    expect(out.find((o) => o.playerId === 'u1')?.won).toBe(false)
  })

  it('imposteur : victoire par camp', () => {
    const state = {
      winnerTeam: 'imposteur',
      players: [
        { id: 'u1', isBot: false, team: 'civil' },
        { id: 'u2', isBot: false, team: 'imposteur' },
      ],
    }
    const out = matchOutcomesFor('imposteur', state)!
    expect(out.find((o) => o.playerId === 'u2')?.won).toBe(true)
    expect(out.find((o) => o.playerId === 'u1')?.won).toBe(false)
  })

  it('quiz : rang compétition, ex æquo co-vainqueurs', () => {
    const state = {
      players: [
        { id: 'u1', isBot: false, score: 300 },
        { id: 'u2', isBot: false, score: 300 },
        { id: 'u3', isBot: false, score: 100 },
      ],
    }
    const out = matchOutcomesFor('quiz', state)!
    expect(out.find((o) => o.playerId === 'u1')).toMatchObject({ won: true, rank: 1 })
    expect(out.find((o) => o.playerId === 'u2')).toMatchObject({ won: true, rank: 1 })
    expect(out.find((o) => o.playerId === 'u3')).toMatchObject({ won: false, rank: 3 })
  })

  it('loup-garou : victoire par camp via le rôle', () => {
    const state = {
      winnerTeam: 'loups',
      players: [
        { id: 'u1', isBot: false, role: 'loup' },
        { id: 'u2', isBot: false, role: 'voyante' },
        { id: 'u3', isBot: false, role: 'villageois' },
      ],
    }
    const out = matchOutcomesFor('loup-garou', state)!
    expect(out.find((o) => o.playerId === 'u1')?.won).toBe(true)
    expect(out.find((o) => o.playerId === 'u2')?.won).toBe(false)
    expect(out.find((o) => o.playerId === 'u3')?.won).toBe(false)
  })

  it('jeu inconnu → null (rien enregistré)', () => {
    expect(matchOutcomesFor('plinko', {})).toBeNull()
  })
})

describe('bout en bout : extraction + règles', () => {
  it('loup-garou 2 humains + 2 bots, village gagne', () => {
    const state = {
      winnerTeam: 'village',
      players: [
        { id: 'u1', isBot: false, role: 'voyante' },
        { id: 'u2', isBot: false, role: 'loup' },
        { id: 'bot-1', isBot: true, role: 'villageois' },
        { id: 'bot-2', isBot: true, role: 'chasseur' },
      ],
    }
    const rows = computeMatchResults(matchOutcomesFor('loup-garou', state)!)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.userId === 'u1')?.outcome).toBe('win')
    expect(rows.find((r) => r.userId === 'u2')?.outcome).toBe('loss')
    expect(rows[0].playerCount).toBe(4)
    expect(rows[0].humanCount).toBe(2)
  })
})

describe('recordMatchResults (enregistrement + XP)', () => {
  // La mémoire du dernier gain est un module partagé : on repart à zéro.
  beforeEach(() => {
    clearXpGains()
  })

  /**
   * Faux client Prisma : capture createMany + updateMany + updates unitaires
   * (streak / XP solo). `users` simule la base pour findUnique/findMany.
   */
  function fakeClient(
    users: Record<string, { onlineXp?: number; streakCount?: number; streakLastDay?: string | null }> = {}
  ) {
    const created: unknown[] = []
    const xpUpdates: { ids: string[]; increment: number }[] = []
    const userUpdates: { id: string; data: Record<string, unknown> }[] = []
    const achievements: { userId: string; type: string }[] = []
    const client = {
      onlineMatchResult: {
        createMany: async ({ data }: { data: unknown[] }) => {
          created.push(...data)
          return { count: data.length }
        },
        // Requêtes des succès (victoires du jour, co-joueurs) : base vide.
        findMany: async () => [],
      },
      achievement: {
        findMany: async () =>
          achievements.map((a) => ({ ...a, unlockedAt: new Date() })),
        create: async ({ data }: { data: { userId: string; type: string } }) => {
          if (achievements.some((a) => a.userId === data.userId && a.type === data.type)) {
            throw new Error('unique constraint')
          }
          achievements.push({ userId: data.userId, type: data.type })
          return data
        },
      },
      user: {
        updateMany: async (args: {
          where: { id: { in: string[] } }
          data: { onlineXp: { increment: number } }
        }) => {
          xpUpdates.push({ ids: args.where.id.in, increment: args.data.onlineXp.increment })
          return { count: args.where.id.in.length }
        },
        findUnique: async ({ where }: { where: { id: string } }) => {
          const u = users[where.id]
          return u ? { onlineXp: u.onlineXp ?? 0 } : null
        },
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in
            .filter((id) => users[id])
            .map((id) => ({
              id,
              streakCount: users[id].streakCount ?? 0,
              streakLastDay: users[id].streakLastDay ?? null,
              onlineXp: users[id].onlineXp ?? 0,
            })),
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          userUpdates.push({ id: args.where.id, data: args.data })
          return {}
        },
      },
    }
    return { client: client as unknown as PrismaClient, created, xpUpdates, userUpdates, achievements }
  }

  it('crédite XP_WIN aux gagnants et XP_LOSS aux perdants, et démarre la série de la semaine', async () => {
    const { client, created, xpUpdates, userUpdates } = fakeClient({ u1: {}, u2: {} })
    const state = { players: [
      { id: 'u1', isBot: false },
      { id: 'u2', isBot: false },
      { id: 'bot-1', isBot: true },
    ], winner: 'u1' }
    const n = await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    expect(n).toBe(2)
    expect(created).toHaveLength(2)
    expect(xpUpdates).toEqual([
      { ids: ['u1'], increment: XP_WIN },
      { ids: ['u2'], increment: XP_LOSS },
    ])
    // Première partie comptée de la semaine : série à 1, bonus +10 pour
    // chacun, et la colonne reçoit une clé de SEMAINE, plus un jour.
    expect(userUpdates.map((u) => u.id).sort()).toEqual(['u1', 'u2'])
    for (const u of userUpdates) {
      expect(u.data.streakCount).toBe(1)
      expect(u.data.streakLastDay).toMatch(/^\d{4}-W\d{2}$/)
      expect(u.data.onlineXp).toEqual({ increment: 10 })
    }
  })

  it('solo contre bots sous le plafond : XP d’entraînement, aucune ligne de classement', async () => {
    const { client, created, xpUpdates, userUpdates } = fakeClient({ u1: { onlineXp: 0 } })
    const state = { players: [
      { id: 'u1', isBot: false },
      { id: 'bot-1', isBot: true },
    ], winner: 'u1' }
    const n = await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    expect(n).toBe(0)
    expect(created).toHaveLength(0)
    expect(xpUpdates).toHaveLength(0)
    // La série d'abord (sa lecture sert de photo de l'XP d'avant-partie),
    // puis les +10 d'entraînement.
    expect(userUpdates[0].data.streakCount).toBe(1)
    expect(userUpdates[1]).toEqual({ id: 'u1', data: { onlineXp: { increment: 10 } } })
  })

  it('solo contre bots AU plafond (niveau 5) : plus rien', async () => {
    // 1000 XP = niveau 5 pile (50·4·5).
    const { client, created, xpUpdates, userUpdates } = fakeClient({ u1: { onlineXp: 1000 } })
    const state = { players: [
      { id: 'u1', isBot: false },
      { id: 'bot-1', isBot: true },
    ], winner: 'u1' }
    const n = await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    expect(n).toBe(0)
    expect(created).toHaveLength(0)
    expect(xpUpdates).toHaveLength(0)
    expect(userUpdates).toHaveLength(0)
  })

  it('déserteur solo (converti en bot) : aucune XP d’entraînement', async () => {
    const { client, userUpdates } = fakeClient({ u1: { onlineXp: 0 } })
    const state = { players: [
      { id: 'u1', isBot: true },
      { id: 'bot-1', isBot: true },
    ], winner: 'bot-1' }
    await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    expect(userUpdates).toHaveLength(0)
  })

  it('dilemmes (sans gagnant) : XP de participation pour tous, zéro ligne de classement', async () => {
    const { client, created, xpUpdates } = fakeClient({ u1: {}, u2: {} })
    const state = { players: [
      { id: 'u1', name: 'A', isBot: false, leftAt: null },
      { id: 'u2', name: 'B', isBot: false, leftAt: null },
      { id: 'bot-1', name: 'Bot', isBot: true, leftAt: null },
    ] }
    const n = await recordMatchResults(client, { roomId: 'r1', gameId: 'dilemmes', state })
    expect(n).toBe(0)
    expect(created).toHaveLength(0)
    expect(xpUpdates).toEqual([{ ids: ['u1', 'u2'], increment: XP_LOSS }])
  })

  it('succès : first_game pour tous, first_win pour le gagnant, speed_demon sur le Quiz', async () => {
    const { client, achievements } = fakeClient({ u1: {}, u2: {} })
    const state = { players: [
      { id: 'u1', isBot: false, score: 5 },
      { id: 'u2', isBot: false, score: 2 },
    ] }
    await recordMatchResults(client, { roomId: 'r1', gameId: 'quiz', state })
    // night_owl dépend de l'heure réelle (Paris) : exclu pour un test stable.
    const of = (u: string) =>
      achievements.filter((a) => a.userId === u && a.type !== 'night_owl').map((a) => a.type).sort()
    expect(of('u1')).toEqual(['first_game', 'first_win', 'speed_demon'])
    expect(of('u2')).toEqual(['first_game'])
  })

  it('succès : le solo au plafond d’XP garde first_game', async () => {
    const { client, achievements } = fakeClient({ u1: { onlineXp: 5000 } })
    const state = { players: [
      { id: 'u1', isBot: false },
      { id: 'bot-1', isBot: true },
    ], winner: 'u1' }
    await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    expect(achievements.map((a) => a.type)).toContain('first_game')
    expect(achievements.map((a) => a.type)).not.toContain('first_win')
  })

  it('détail du gain : le total annoncé = base + bonus de série (F13)', async () => {
    const { client } = fakeClient({ u1: { onlineXp: 60 }, u2: { onlineXp: 0 } })
    const state = { players: [
      { id: 'u1', isBot: false },
      { id: 'u2', isBot: false },
    ], winner: 'u1' }
    await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    const gain = recallXpGain('u1')
    expect(gain).not.toBeNull()
    // Victoire (50) + première semaine de série (10) = 60, et non « +50 ».
    expect(gain!.base).toBe(XP_WIN)
    expect(gain!.streakBonus).toBe(10)
    expect(gain!.total).toBe(60)
    expect(gain!.streakCount).toBe(1)
    // 60 → 120 XP : le passage au niveau 2 (100 XP) tient AU bonus de série.
    expect(gain!.levelBefore).toBe(1)
    expect(gain!.levelAfter).toBe(2)
    expect(recallXpGain('u2')?.reason).toBe('loss')
  })

  it('détail du gain : jeu de participation et solo au plafond disent la vérité', async () => {
    const parti = fakeClient({ u1: {}, u2: {} })
    await recordMatchResults(parti.client, { roomId: 'r1', gameId: 'telephone-dessine', state: {
      players: [
        { id: 'u1', name: 'A', isBot: false, leftAt: null },
        { id: 'u2', name: 'B', isBot: false, leftAt: null },
      ],
    } })
    expect(parti.xpUpdates).toEqual([{ ids: ['u1', 'u2'], increment: XP_LOSS }])
    expect(recallXpGain('u1')).toMatchObject({ reason: 'participation', base: XP_LOSS, total: 30 })

    clearXpGains()
    const capped = fakeClient({ u3: { onlineXp: 5000 } })
    await recordMatchResults(capped.client, { roomId: 'r2', gameId: 'petit-buveur', state: {
      players: [{ id: 'u3', isBot: false }, { id: 'bot-1', isBot: true }],
      winner: 'u3',
    } })
    // Rien n'a été crédité : le détail l'annonce à 0 plutôt que d'inventer.
    expect(capped.userUpdates).toHaveLength(0)
    expect(recallXpGain('u3')).toMatchObject({ reason: 'solo', total: 0 })
  })

  it('détail du gain : les succès débloqués sont annoncés une seule fois (F14)', async () => {
    const { client } = fakeClient({ u1: {}, u2: {} })
    const state = { players: [
      { id: 'u1', isBot: false, score: 5 },
      { id: 'u2', isBot: false, score: 2 },
    ] }
    await recordMatchResults(client, { roomId: 'r1', gameId: 'quiz', state })
    expect(recallXpGain('u1')?.achievements).toEqual(
      expect.arrayContaining(['first_game', 'first_win', 'speed_demon'])
    )
    // Deuxième partie : plus rien à annoncer (aucun nouveau succès).
    await recordMatchResults(client, { roomId: 'r2', gameId: 'quiz', state })
    expect(recallXpGain('u1')?.achievements).toEqual([])
  })

  it('détail du gain : un succès hors partie (première table) est rattrapé', async () => {
    const { client, achievements } = fakeClient({ u1: {}, u2: {} })
    // Débloqué par la route de création de salle, sans écran pour le dire.
    achievements.push({ userId: 'u1', type: 'first_room' })
    const state = { players: [
      { id: 'u1', isBot: false },
      { id: 'u2', isBot: false },
    ], winner: 'u1' }
    await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    expect(recallXpGain('u1')?.achievements).toContain('first_room')
    // Mais pas chez le voisin, qui ne l'a pas.
    expect(recallXpGain('u2')?.achievements).not.toContain('first_room')
  })

  describe('série HEBDOMADAIRE', () => {
    // Horloge figée (Date seule) : jeudi 08/10/2026, 20 h à Paris = 2026-W41.
    // Lire l'horloge réelle rendrait le test faux chaque dimanche à minuit.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-08T18:00:00.000Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    const twoPlayers = {
      players: [
        { id: 'u1', isBot: false },
        { id: 'u2', isBot: false },
      ],
      winner: 'u1',
    }

    it('semaine dernière → +1 avec bonus croissant ; déjà créditée cette semaine → rien', async () => {
      const { client, userUpdates } = fakeClient({
        u1: { streakCount: 3, streakLastDay: '2026-W40' },
        u2: { streakCount: 9, streakLastDay: '2026-W41' },
      })
      await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state: twoPlayers })
      // u1 : 3 → 4 semaines, bonus 40. u2 : déjà créditée cette semaine.
      expect(userUpdates).toEqual([
        {
          id: 'u1',
          data: { streakCount: 4, streakLastDay: '2026-W41', onlineXp: { increment: streakBonusXp(4) } },
        },
      ])
      // Le détail annonce la série SANS rejouer le bonus déjà touché.
      expect(recallXpGain('u1')).toMatchObject({ streakCount: 4, streakBonus: 40, total: XP_WIN + 40 })
      expect(recallXpGain('u2')).toMatchObject({ streakCount: 9, streakBonus: 0, total: XP_LOSS })
    })

    it('une semaine sautée : retour à 1', async () => {
      const { client, userUpdates } = fakeClient({
        u1: { streakCount: 6, streakLastDay: '2026-W39' },
        u2: {},
      })
      await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state: twoPlayers })
      expect(userUpdates.find((u) => u.id === 'u1')?.data).toEqual({
        streakCount: 1,
        streakLastDay: '2026-W41',
        onlineXp: { increment: streakBonusXp(1) },
      })
    })

    it('ancienne valeur quotidienne : lue comme sa semaine, réécrite en semaine', async () => {
      const { client, userUpdates } = fakeClient({
        // Lundi 05/10 : même semaine que jeudi — le bonus est déjà tombé.
        u1: { streakCount: 1, streakLastDay: '2026-10-05' },
        // Samedi 03/10 : la semaine dernière — la série continue.
        u2: { streakCount: 1, streakLastDay: '2026-10-03' },
      })
      await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state: twoPlayers })
      expect(userUpdates).toEqual([
        {
          id: 'u2',
          data: { streakCount: 2, streakLastDay: '2026-W41', onlineXp: { increment: streakBonusXp(2) } },
        },
      ])
      expect(recallXpGain('u1')).toMatchObject({ streakCount: 1, streakBonus: 0 })
    })

    it('deux parties la même semaine : le bonus ne tombe qu’une fois', async () => {
      const users: Record<string, { streakCount?: number; streakLastDay?: string | null }> = { u1: {}, u2: {} }
      const first = fakeClient(users)
      await recordMatchResults(first.client, { roomId: 'r1', gameId: 'petit-buveur', state: twoPlayers })
      // La base telle que la première partie l'a laissée.
      for (const u of first.userUpdates) {
        users[u.id] = { streakCount: u.data.streakCount as number, streakLastDay: u.data.streakLastDay as string }
      }
      // Dimanche 11/10, 23 h 30 à Paris : toujours la W41.
      vi.setSystemTime(new Date('2026-10-11T21:30:00.000Z'))
      const second = fakeClient(users)
      await recordMatchResults(second.client, { roomId: 'r2', gameId: 'petit-buveur', state: twoPlayers })
      expect(second.userUpdates).toEqual([])
      expect(recallXpGain('u1')).toMatchObject({ streakCount: 1, streakBonus: 0, total: XP_WIN })
    })
  })
})


// ─── Fin de partie : tout ou rien ────────────────────────────────────────────
// L'enregistrement écrit le journal, le classement, les séries, l'XP et les
// succès : hors transaction, un échec au milieu laisse un joueur classé sans
// son XP. Deux garanties à tenir, et elles vont ensemble — la route doit
// OUVRIR une transaction, et recordMatchResults ne doit utiliser QUE le client
// reçu (avec connection_limit=1, un `prisma.` global dans le callback
// interbloquerait la route).

/** Client Prisma GLOBAL des modules sous test, réinstallé par chaque test. */
let prismaStub: Record<string, unknown> = {}

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string | symbol) => prismaStub[prop as string],
  }),
}))

vi.mock('@/lib/auth-server', () => ({
  getCurrentUser: async () => ({ id: 'u1' }),
}))

vi.mock('@/lib/online-room', () => ({
  kickMember: async () => {},
  // Présence du joueur (le coup vaut présence, route action).
  PRESENCE_WRITE_INTERVAL_MS: 30_000,
  touchMemberPresence: async () => {},
}))

vi.mock('@/lib/online/room-bus', () => ({
  publishRoomChanged: () => {},
}))

/** Un jeu quelconque : seule compte la transition « pas fini » → « fini ». */
vi.mock('@/lib/online/game-adapters', () => ({
  getGameAdapter: () => ({
    maxPlayers: 8,
    parse: (json: string | null) => (json ? JSON.parse(json) : null),
    serialize: (state: unknown) => JSON.stringify(state),
    applyAction: () => ({
      ok: true,
      state: {
        finished: true,
        players: [
          { id: 'u1', isBot: false },
          { id: 'u2', isBot: false },
        ],
        winner: 'u1',
      },
    }),
    isFinished: (state: unknown) => Boolean((state as { finished?: boolean }).finished),
    currentActorId: () => null,
    actionResponse: () => ({}),
    convertToBot: () => null,
    rejoin: () => null,
  }),
}))

/** Client transactionnel minimal : mémorise ce qui a été écrit à travers lui. */
function fakeTx() {
  const writes: string[] = []
  const client = {
    onlineGameSession: {
      updateMany: async () => {
        writes.push('session')
        return { count: 1 }
      },
    },
    onlineMatchResult: {
      createMany: async ({ data }: { data: unknown[] }) => {
        writes.push('classement')
        return { count: data.length }
      },
      findMany: async () => [],
    },
    achievement: {
      findMany: async () => [],
      create: async () => {
        writes.push('succes')
        return {}
      },
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, streakCount: 0, streakLastDay: null, onlineXp: 0 })),
      findUnique: async () => ({ onlineXp: 0 }),
      update: async () => {
        writes.push('serie')
        return {}
      },
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        writes.push('xp')
        return { count: where.id.in.length }
      },
    },
  }
  return { client: client as unknown as PrismaClient, writes }
}

describe('recordMatchResults : aucun client Prisma global', () => {
  beforeEach(() => {
    clearXpGains()
  })

  it('n’écrit qu’à travers le client reçu (sinon : interblocage en transaction)', async () => {
    // Le moindre accès au client global casse le test, y compris depuis les
    // fonctions appelées (closeGameSession, checkMatchAchievements).
    prismaStub = new Proxy({} as Record<string, unknown>, {
      get: (_target, prop: string | symbol) => {
        throw new Error(`client Prisma global utilisé : prisma.${String(prop)}`)
      },
    })
    const { client, writes } = fakeTx()
    const state = {
      players: [
        { id: 'u1', isBot: false },
        { id: 'u2', isBot: false },
      ],
      winner: 'u1',
    }

    await expect(
      recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    ).resolves.toBe(2)
    expect(writes).toContain('session')
    expect(writes).toContain('classement')
    expect(writes).toContain('xp')
  })
})

describe('POST /api/online/rooms/[roomId]/action : fin de partie sous transaction', () => {
  beforeEach(() => {
    clearXpGains()
  })

  it('enregistre les résultats avec le client TRANSACTIONNEL, pas le global', async () => {
    const tx = fakeTx()
    const transactions: { timeout?: number }[] = []
    let globalClassementWrites = 0

    prismaStub = {
      onlineRoom: {
        findUnique: async () => ({
          id: 'r1',
          hostUserId: 'u1',
          currentTurnUserId: 'u1',
          updatedAt: new Date(),
          stateVersion: 3,
          status: 'playing',
          gameId: 'petit-buveur',
          gameStateJson: JSON.stringify({
            finished: false,
            players: [{ id: 'u1' }, { id: 'u2' }],
          }),
          // Présence fraîche (loadActionRoom la lit) : la route n'a rien à écrire.
          members: [
            { userId: 'u1', lastSeenAt: new Date() },
            { userId: 'u2', lastSeenAt: new Date() },
          ],
        }),
        updateMany: async () => ({ count: 1 }),
      },
      // Filet : si l'enregistrement passait par le client global, il écrirait ici.
      onlineMatchResult: {
        createMany: async () => {
          globalClassementWrites += 1
          return { count: 0 }
        },
      },
      $transaction: async (
        run: (client: PrismaClient) => Promise<unknown>,
        options?: { maxWait?: number; timeout?: number }
      ) => {
        transactions.push(options ?? {})
        return run(tx.client)
      },
    }

    const { POST } = await import('@/app/api/online/rooms/[roomId]/action/route')
    const request = new Request('https://example.test/api/online/rooms/r1/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'play', expectedVersion: 3 }),
    })
    const response = await POST(request, { params: Promise.resolve({ roomId: 'r1' }) })

    expect(response.status).toBe(200)
    // Une transaction ouverte, avec le délai laissé à SQLite ET l'attente d'une
    // connexion libre : `maxWait` vaut 2 s par défaut, or connection_limit=1
    // (src/lib/prisma.ts) oblige la fin de partie à attendre son tour. Sans
    // cette borne explicite, deux tables qui finissent à la même minute
    // perdaient tout leur enregistrement sur un P2028 avalé.
    expect(transactions).toEqual([{ maxWait: 10_000, timeout: 10_000 }])
    // Les écritures de fin de partie sont passées par le client transactionnel.
    expect(tx.writes).toContain('classement')
    expect(tx.writes).toContain('xp')
    expect(globalClassementWrites).toBe(0)
  })
})
