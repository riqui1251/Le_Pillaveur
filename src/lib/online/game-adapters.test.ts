import { describe, expect, it } from 'vitest'
import { GAME_ADAPTERS } from './game-adapters'
import { GAMES } from '@/lib/games'

/**
 * Les bornes de joueurs vivent à DEUX endroits : le registre (vérité serveur,
 * enforcement lobby/launch) et `games.ts` (affichage hub + lobby, bundle
 * client). Ce test garantit qu'elles ne divergent jamais.
 */
describe('bornes de joueurs : registre ↔ GAMES', () => {
  for (const [gameId, adapter] of Object.entries(GAME_ADAPTERS)) {
    it(`${gameId} : min/max identiques des deux côtés`, () => {
      const meta = GAMES.find((g) => g.id === gameId)
      expect(meta, `${gameId} absent de GAMES`).toBeTruthy()
      expect(meta?.onlineReady, `${gameId} devrait être onlineReady`).toBe(true)
      expect(meta?.minPlayers, `minPlayers de ${gameId}`).toBe(adapter.minPlayers)
      expect(meta?.maxPlayers, `maxPlayers de ${gameId}`).toBe(adapter.maxPlayers)
      expect(Boolean(meta?.botsFillable), `botsFillable de ${gameId}`).toBe(
        Boolean(adapter.botsFillable)
      )
    })
  }
})
