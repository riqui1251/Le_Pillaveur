import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMCRoomAction, buildMCState, type MCRoomMember } from './server-adapter'
import { mcSpymasterOf, MC_COUNTDOWN_MS, type MCState, type MCTeam } from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

/** L'adaptateur lit l'horloge (Date.now) : on la fige pour sortir du countdown. */
const T0 = 1_000_000

const MEMBERS: MCRoomMember[] = [
  { userId: 'g1', displayName: 'Alice' },
  { userId: 'g2', displayName: 'Bruno' },
  { userId: 'r1', displayName: 'Chloé' },
  { userId: 'r2', displayName: 'Dédé' },
]
const TEAMS: Record<string, MCTeam> = { g1: 'gold', g2: 'gold', r1: 'red', r2: 'red' }

function expectOk(result: ReturnType<typeof applyMCRoomAction>): MCState {
  if (!result.ok) throw new Error(`action refusée : ${result.error}`)
  return result.state
}

/** Partie FR construite par l'adaptateur, countdown consommé : phase clue. */
function inClue(): MCState {
  vi.setSystemTime(T0)
  const raw = buildMCState(MEMBERS, TEAMS, 'fr', 'seed')
  vi.setSystemTime(T0 + MC_COUNTDOWN_MS)
  const clue = expectOk(applyMCRoomAction(raw, 'g1', { type: 'advance', phaseKey: phaseKey(raw) }))
  expect(clue.phase).toBe('clue')
  return clue
}

/** Le maître-mot de l'équipe active donne `word` en indice. */
function giveClue(state: MCState, word: string) {
  const master = mcSpymasterOf(state, state.activeTeam)!
  return applyMCRoomAction(state, master.id, { type: 'clue', word, count: 2 })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mots-codes — indice libre non censuré', () => {
  it('garde « Cocktail » tel quel', () => {
    const state = expectOk(giveClue(inClue(), 'Cocktail'))
    expect(state.phase).toBe('guess')
    expect(state.clue).toEqual({ word: 'Cocktail', count: 2 })
  })

  it('laisse passer une grossièreté (ce n’est pas un filtre de vulgarité)', () => {
    const state = expectOk(giveClue(inClue(), 'Connard'))
    expect(state.clue?.word).toBe('Connard')
  })

  it('masque un numéro de téléphone donné en indice', () => {
    const state = expectOk(giveClue(inClue(), '0612345678'))
    expect(state.clue?.word).toMatch(/^\*+$/)
  })
})

describe('mots-codes — mot de la grille refusé, jamais maquillé', () => {
  it('refuse « Drapeau » quand drapeau est sur la grille (CLUE_ON_GRID, pas d’astérisques)', () => {
    const base = inClue()
    // Le tirage des 25 mots est aléatoire : on pose « drapeau » sur la grille.
    const state: MCState = { ...base, words: base.words.map((w, i) => (i === 0 ? 'drapeau' : w)) }
    expect(giveClue(state, 'Drapeau')).toEqual({ ok: false, error: 'CLUE_ON_GRID' })
  })

  it('refuse n’importe quel mot encore visible de la partie construite', () => {
    const state = inClue()
    const word = state.words[5].toUpperCase()
    expect(giveClue(state, word)).toEqual({ ok: false, error: 'CLUE_ON_GRID' })
  })
})
