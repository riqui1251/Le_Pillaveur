import { GAMES } from '../src/lib/games'
import { expect, test } from './support/fixtures'
import { LOCAL_SCENARIOS } from './scenarios/local'
import { ONLINE_SCENARIOS } from './scenarios/online'

/**
 * Chaque jeu du registre (src/lib/games.ts) a son scénario de bout en bout :
 * en local s'il se joue sur un seul téléphone, en ligne s'il est
 * `onlineOnly`. Un jeu ajouté sans scénario fait échouer la suite ici.
 */
test('chaque jeu du registre a son scénario e2e, du bon côté', () => {
  const local = LOCAL_SCENARIOS.map((s) => s.id).sort()
  const online = ONLINE_SCENARIOS.map((s) => s.id).sort()
  expect(local).toEqual(GAMES.filter((g) => !g.onlineOnly).map((g) => g.id).sort())
  expect(online).toEqual(GAMES.filter((g) => g.onlineOnly).map((g) => g.id).sort())
  expect(new Set([...local, ...online]).size).toBe(GAMES.length)
})

test('les jeux en ligne avec bots passent par « Essayer avec des bots »', () => {
  for (const scenario of ONLINE_SCENARIOS) {
    const game = GAMES.find((g) => g.id === scenario.id)
    expect(scenario.mode, scenario.id).toBe(game?.botsFillable ? 'bots' : 'guest')
  }
})
