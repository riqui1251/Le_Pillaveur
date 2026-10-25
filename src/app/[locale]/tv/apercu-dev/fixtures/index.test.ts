import { describe, expect, it } from 'vitest'
import { PREVIEW_GAMES } from './index'

/**
 * L'aperçu TV de dev rejoue de vraies parties avec les moteurs : une règle
 * nouvelle (plancher de lecture, révélation sans acteur, dernière chance)
 * cassait une fixture sans qu'aucun test ne le voie — la page affichait
 * seulement « fixture cassée ». Chaque jeu doit construire ses états.
 */
describe('aperçu TV : chaque fixture se construit avec les moteurs actuels', () => {
  it.each(PREVIEW_GAMES.map((g) => [g.game, g.build] as const))('%s', (_, build) => {
    const fixtures = build()
    expect(fixtures.length).toBeGreaterThan(0)
    for (const fixture of fixtures) expect(fixture.steps.length).toBeGreaterThan(0)
  })
})

describe('aperçu TV : le Loup-Garou rejoue les parties annoncées', () => {
  it.each([
    ['partie-12', 'village'],
    ['partie-5', 'village'],
    ['loups-12', 'loups'],
  ])('%s : victoire %s', (id, winner) => {
    const fixtures = PREVIEW_GAMES.find((g) => g.game === 'loup-garou')!.build()
    const last = fixtures.find((f) => f.id === id)!.steps.at(-1)!
    expect(JSON.parse(last.room?.gameStateJson ?? 'null')).toMatchObject({ phase: 'finished', winnerTeam: winner })
  })
})
