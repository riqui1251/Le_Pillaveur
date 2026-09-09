import { describe, expect, it } from 'vitest'

import { isSameLocalTable, LOCAL_GAME_SAVE_TTL_MS, parseLocalGameSave } from './game-session'

type DemoState = { turn: number }

function envelope(state: unknown, version: number, savedAt: number): string {
  return JSON.stringify({ version, savedAt, state })
}

describe('parseLocalGameSave', () => {
  const now = 1_700_000_000_000

  it('rend l’état d’une sauvegarde fraîche et à la bonne version', () => {
    const raw = envelope({ turn: 7 }, 1, now - 60_000)
    expect(parseLocalGameSave<DemoState>(raw, 1, now)).toEqual({ turn: 7 })
  })

  it('refuse une sauvegarde plus vieille que le délai de conservation', () => {
    const raw = envelope({ turn: 7 }, 1, now - LOCAL_GAME_SAVE_TTL_MS - 1)
    expect(parseLocalGameSave<DemoState>(raw, 1, now)).toBeNull()
  })

  it('accepte une sauvegarde pile à la limite du délai', () => {
    const raw = envelope({ turn: 7 }, 1, now - LOCAL_GAME_SAVE_TTL_MS)
    expect(parseLocalGameSave<DemoState>(raw, 1, now)).toEqual({ turn: 7 })
  })

  it('refuse une sauvegarde produite par une version d’état différente', () => {
    const raw = envelope({ turn: 7 }, 1, now)
    expect(parseLocalGameSave<DemoState>(raw, 2, now)).toBeNull()
  })

  it('refuse une entrée absente, illisible ou incomplète', () => {
    expect(parseLocalGameSave<DemoState>(null, 1, now)).toBeNull()
    expect(parseLocalGameSave<DemoState>('pas du json', 1, now)).toBeNull()
    expect(parseLocalGameSave<DemoState>('null', 1, now)).toBeNull()
    expect(parseLocalGameSave<DemoState>(JSON.stringify({ version: 1, state: { turn: 1 } }), 1, now)).toBeNull()
    expect(parseLocalGameSave<DemoState>(JSON.stringify({ version: 1, savedAt: now }), 1, now)).toBeNull()
  })
})

describe('isSameLocalTable', () => {
  const table = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('accepte la même table, quel que soit l’ordre', () => {
    expect(isSameLocalTable(['a', 'b', 'c'], table)).toBe(true)
    expect(isSameLocalTable(['c', 'a', 'b'], table)).toBe(true)
  })

  it('refuse une table dont un joueur a changé', () => {
    // Sans ce refus, la reprise crédite des gorgées à quelqu’un qui n’a pas joué.
    expect(isSameLocalTable(['a', 'b', 'z'], table)).toBe(false)
  })

  it('refuse une table plus courte ou plus longue', () => {
    // Une table plus courte donnerait un index de joueur hors bornes.
    expect(isSameLocalTable(['a', 'b'], table)).toBe(false)
    expect(isSameLocalTable(['a', 'b', 'c', 'd'], table)).toBe(false)
  })

  it('refuse une sauvegarde sans identifiants exploitables', () => {
    expect(isSameLocalTable(undefined, table)).toBe(false)
    expect(isSameLocalTable(null, table)).toBe(false)
    expect(isSameLocalTable('a,b,c', table)).toBe(false)
    expect(isSameLocalTable([1, 2, 3], table)).toBe(false)
    expect(isSameLocalTable([null, 'b', 'c'], table)).toBe(false)
  })

  it('ne se laisse pas berner par un identifiant répété', () => {
    // Même longueur, mais ce n’est pas la même table.
    expect(isSameLocalTable(['a', 'a', 'c'], table)).toBe(false)
  })

  it('accepte deux tables vides', () => {
    expect(isSameLocalTable([], [])).toBe(true)
  })
})
