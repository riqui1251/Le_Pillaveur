import { describe, expect, it } from 'vitest'
import { createLGState, reduceLG, LGEngineError, type LGState } from './engine'
import { applyLGBotAction } from './server-adapter'
import { phaseKey } from '@/lib/online/phase-clock'

/**
 * Test de FUMÉE : des parties complètes jouées par la vraie IA des bots
 * (échéances simulées) se terminent TOUJOURS sur une victoire — quel que
 * soit l'effectif. Attrape les softlocks de la machine à états (phase sans
 * issue, victoire jamais détectée, boucle de revote…).
 */
function playFullGame(count: number, seed: string): LGState {
  const players = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isBot: true,
  }))
  let s = createLGState(players, seed, 60_000, 0)

  let guard = 0
  while (s.phase !== 'finished' && guard < 500) {
    guard += 1
    // Les bots concernés agissent (peut résoudre la phase en avance).
    let acted = true
    while (acted && s.phase !== 'finished') {
      const r = applyLGBotAction(s)
      if (r.ok) s = r.state
      else acted = false
    }
    if (s.phase === 'finished') break
    // Échéance de phase simulée (le tick « advance » de l'arbitre).
    if (s.phaseEndsAt === null) break
    try {
      s = reduceLG(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt })
    } catch (e) {
      if (e instanceof LGEngineError) break
      throw e
    }
  }
  return s
}

describe('simulation : des bots seuls finissent toujours une partie', () => {
  for (const count of [3, 5, 7, 9, 12]) {
    it(`table de ${count} joueurs`, () => {
      for (let seed = 0; seed < 5; seed += 1) {
        const s = playFullGame(count, `smoke-${count}-${seed}`)
        expect(s.phase).toBe('finished')
        expect(s.winnerTeam).not.toBeNull()
        // La compta des vivants colle à la victoire annoncée.
        const wolves = s.players.filter((p) => p.alive && p.role === 'loup').length
        const others = s.players.filter((p) => p.alive && p.role !== 'loup').length
        if (s.winnerTeam === 'village') expect(wolves).toBe(0)
        else expect(wolves).toBeGreaterThanOrEqual(others)
      }
    })
  }
})
