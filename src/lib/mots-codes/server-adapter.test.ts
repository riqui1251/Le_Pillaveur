import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMCRoomAction, buildMCState, type MCRoomMember } from './server-adapter'
import { mcSpymasterOf, reduceMC, MC_COUNTDOWN_MS, type MCState, type MCTeam } from './engine'
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

describe('mots-codes — équipe sans devineur présent', () => {
  /** Phase guess de l'équipe active, ses devineurs partis (pas encore remplacés). */
  function guessersGone(): MCState {
    const state = expectOk(giveClue(inClue(), 'Zorglub'))
    expect(state.phase).toBe('guess')
    return {
      ...state,
      players: state.players.map((p) =>
        p.team === state.activeTeam && !p.isSpymaster ? { ...p, leftAt: T0 } : p
      ),
    }
  }

  it('le tick bot passe la main à l’autre équipe au lieu d’attendre 2 min', () => {
    const state = guessersGone()
    const next = expectOk(applyMCRoomAction(state, 'r1', { type: 'bot' }))
    expect(next.phase).toBe('clue')
    expect(next.activeTeam).not.toBe(state.activeTeam)
  })

  it('un devineur humain présent : le bot n’a pas la main', () => {
    const state = expectOk(giveClue(inClue(), 'Zorglub'))
    expect(applyMCRoomAction(state, 'r1', { type: 'bot' })).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
  })

  it('le moteur refuse de passer la main tant qu’un devineur est là', () => {
    const state = expectOk(giveClue(inClue(), 'Zorglub'))
    expect(() => reduceMC(state, { type: 'SKIP_GUESS', now: T0 })).toThrow('GUESSERS_PRESENT')
    expect(() => reduceMC(inClue(), { type: 'SKIP_GUESS', now: T0 })).toThrow('NOT_GUESS_PHASE')
  })
})

describe('mots-codes — tuile entière seulement', () => {
  it('une tuile 1.5 ne passe plus la main : refusée par l’adaptateur (400) et le moteur', async () => {
    const state = expectOk(giveClue(inClue(), 'Zorglub'))
    const guesser = state.players.find((p) => p.team === state.activeTeam && !p.isSpymaster)!
    expect(() =>
      reduceMC(state, { type: 'GUESS', playerId: guesser.id, tile: 1.5, now: T0 })
    ).toThrow('INVALID_TILE')
    const { getGameAdapter } = await import('@/lib/online/game-adapters')
    expect(getGameAdapter('mots-codes')!.applyAction(state, guesser.id, { action: 'guess', tile: 1.5 })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
  })
})
