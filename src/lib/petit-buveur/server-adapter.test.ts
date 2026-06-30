import { describe, it, expect } from 'vitest'
import {
  buildPetitBuveurEngineState,
  serializeEngineState,
  parseEngineState,
  toClientView,
} from './server-adapter'
import { DEFI_DRINKS } from './game-data'

const MEMBERS = [
  { userId: 'u1', displayName: 'Alice' },
  { userId: 'u2', displayName: 'Bob' },
]

describe('server-adapter Petit Buveur', () => {
  it("construit l'état moteur avec userId comme id joueur", () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'seed-x')
    expect(s.players.map((p) => p.id)).toEqual(['u1', 'u2'])
    expect(s.players.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(s.settings.defiDrinks).toEqual(DEFI_DRINKS)
    expect(s.players.every((p) => p.position === 0)).toBe(true)
  })

  it('sérialise puis reparse à l’identique', () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'difficile', 42)
    const round = parseEngineState(serializeEngineState(s))
    expect(round).toEqual(s)
  })

  it('parseEngineState gère null et JSON invalide', () => {
    expect(parseEngineState(null)).toBeNull()
    expect(parseEngineState('pas du json')).toBeNull()
    expect(parseEngineState('{"foo":1}')).toBeNull()
  })

  it('toClientView masque rngState mais garde le reste', () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'seed-y')
    const view = toClientView(s)
    expect('rngState' in view).toBe(false)
    expect(view.players).toHaveLength(2)
    expect(view.currentPlayer).toBe(0)
    expect(view.phase).toBe('playing')
  })
})
