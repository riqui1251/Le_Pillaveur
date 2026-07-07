import { describe, expect, it } from 'vitest'
import { computeMatchResults, matchOutcomesFor, type MatchOutcome } from './match-results'

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
