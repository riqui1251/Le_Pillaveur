import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { XP_LOSS, XP_WIN } from '@/lib/online/cosmetics'
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
        findMany: async () => achievements.map((a) => ({ ...a })),
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
            })),
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          userUpdates.push({ id: args.where.id, data: args.data })
          return {}
        },
      },
    }
    return { client: client as unknown as PrismaClient, created, xpUpdates, userUpdates, achievements }
  }

  it('crédite XP_WIN aux gagnants et XP_LOSS aux perdants, et démarre la série du jour', async () => {
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
    // Première partie du jour : série à 1, bonus +10 pour chacun.
    expect(userUpdates.map((u) => u.id).sort()).toEqual(['u1', 'u2'])
    for (const u of userUpdates) {
      expect(u.data.streakCount).toBe(1)
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
    // +10 d'entraînement puis la série du jour.
    expect(userUpdates[0]).toEqual({ id: 'u1', data: { onlineXp: { increment: 10 } } })
    expect(userUpdates[1].data.streakCount).toBe(1)
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

  it('série : hier → +1 avec bonus croissant ; déjà créditée aujourd’hui → rien', async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    const yesterday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(Date.now() - 24 * 60 * 60 * 1000))
    const { client, userUpdates } = fakeClient({
      u1: { streakCount: 3, streakLastDay: yesterday },
      u2: { streakCount: 9, streakLastDay: today },
    })
    const state = { players: [
      { id: 'u1', isBot: false },
      { id: 'u2', isBot: false },
    ], winner: 'u1' }
    await recordMatchResults(client, { roomId: 'r1', gameId: 'petit-buveur', state })
    // u1 : 3 → 4 jours, bonus 40. u2 : déjà créditée aujourd'hui.
    expect(userUpdates).toHaveLength(1)
    expect(userUpdates[0].id).toBe('u1')
    expect(userUpdates[0].data.streakCount).toBe(4)
    expect(userUpdates[0].data.onlineXp).toEqual({ increment: 40 })
  })
})
