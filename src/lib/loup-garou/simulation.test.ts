import { describe, expect, it } from 'vitest'
import { createLGState, reduceLG, LGEngineError, type LGState } from './engine'
import { applyLGBotAction } from './server-adapter'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'

/**
 * Test de FUMÉE : des parties complètes jouées par la vraie IA des bots
 * (échéances simulées) se terminent TOUJOURS sur une victoire — quel que
 * soit l'effectif. Attrape les softlocks de la machine à états (phase sans
 * issue, victoire jamais détectée, boucle de revote…).
 */
function playFullGame(
  count: number,
  seed: string,
  observe?: (before: LGState, after: LGState) => void
): LGState {
  const players = Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isBot: true,
  }))
  let s = createLGState(players, seed, 60_000, 0)
  // Hasard « joueur » des bots seedé lui aussi : une partie rejouable à l'identique.
  const rand = createRng(`bots-${seed}`).next

  let guard = 0
  while (s.phase !== 'finished' && guard < 500) {
    guard += 1
    // Les bots concernés agissent (peut résoudre la phase en avance).
    let acted = true
    while (acted && s.phase !== 'finished') {
      const r = applyLGBotAction(s, rand)
      if (r.ok) {
        observe?.(s, r.state)
        s = r.state
      } else acted = false
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
  for (const count of [4, 5, 7, 9, 12]) {
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

describe('simulation : les bots ne parlent qu’au débat', () => {
  it('20 graines à 7 joueurs : aucune parole hors day-debate ; des remarques d’une manche à l’autre apparaissent', () => {
    let remarks = 0
    for (let seed = 0; seed < 20; seed += 1) {
      const s = playFullGame(7, `nuit-${seed}`, (before, after) => {
        const fresh = after.debateSpeech.filter((sp) => !before.debateSpeech.includes(sp))
        if (before.phase !== 'day-debate') expect(fresh).toEqual([])
        remarks += fresh.filter((sp) => sp.kind === 'toldYou' || sp.kind === 'wrong').length
      })
      expect(s.phase).toBe('finished')
    }
    expect(remarks).toBeGreaterThan(0)
  })
})
