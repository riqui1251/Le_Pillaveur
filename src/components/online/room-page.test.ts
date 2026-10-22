import { describe, expect, it } from 'vitest'
import { isRoomGamePath } from './room-page'

describe('isRoomGamePath', () => {
  it('reconnaît la page du jeu de la salle, sous-pages comprises', () => {
    expect(isRoomGamePath('/games/loup-garou', 'loup-garou')).toBe(true)
    expect(isRoomGamePath('/games/loup-garou/', 'loup-garou')).toBe(true)
    expect(isRoomGamePath('/games/loup-garou/regles', 'loup-garou')).toBe(true)
  })

  it("écarte un jeu local ouvert pendant qu'une table attend ailleurs", () => {
    expect(isRoomGamePath('/games/monsieur-3', 'loup-garou')).toBe(false)
    expect(isRoomGamePath('/games/1220', 'loup-garou')).toBe(false)
  })

  it('ne confond pas deux jeux dont un chemin prolonge l’autre', () => {
    const games = [
      { id: 'pmu', path: '/games/pmu' },
      { id: 'pmu-plus', path: '/games/pmu-plus' },
    ]
    expect(isRoomGamePath('/games/pmu-plus', 'pmu', games)).toBe(false)
    expect(isRoomGamePath('/games/pmu-plus', 'pmu-plus', games)).toBe(true)
  })

  it('sans salle, sans jeu ou jeu inconnu : jamais la page de la salle', () => {
    expect(isRoomGamePath('/games/quiz', null)).toBe(false)
    expect(isRoomGamePath(null, 'quiz')).toBe(false)
    expect(isRoomGamePath('/games/quiz', 'jeu-inconnu')).toBe(false)
  })
})
