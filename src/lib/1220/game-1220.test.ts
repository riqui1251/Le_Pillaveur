import { describe, expect, it } from 'vitest'
import { bandOf, evaluatePlayerRoll1220, type Choices1220 } from '@/lib/game-1220'

/**
 * Règles partagées du 1220 (jeu local et moteur en ligne). Les raisons de
 * distribuer sont des IDENTIFIANTS : l'écran les traduit à partir de la somme.
 * Elles étaient écrites en français dans les règles et glissées telles
 * quelles dans les phrases traduites.
 */

const BETS: Choices1220 = { parity: 'pair', band: '11-20', drinkNumber: 7, giveNumber: 13 }

describe('evaluatePlayerRoll1220', () => {
  it('ne renvoie que des identifiants de raison, sans texte', () => {
    // 6 + 8 = 14 : pair, dans 11-20.
    const r = evaluatePlayerRoll1220(6, 8, BETS)
    expect(r.giveReasons).toEqual([{ id: 'band' }, { id: 'parity' }])
    for (const reason of r.giveReasons) expect(Object.keys(reason)).toEqual(['id'])
    expect(r.giveEffective).toBe(2)
    expect(r.drinkSips).toBe(0)
  })

  it('somme = chiffre « donne à boire » : une raison de plus', () => {
    // 5 + 8 = 13 : impair (raté), dans 11-20, et chiffre donné.
    const r = evaluatePlayerRoll1220(5, 8, BETS)
    expect(r.giveReasons.map((g) => g.id)).toEqual(['band', 'giveNum'])
  })

  it('somme = chiffre « fait boire » : une gorgée à boire', () => {
    // 3 + 4 = 7 : impair, hors plage.
    const r = evaluatePlayerRoll1220(3, 4, BETS)
    expect(r.drinkSips).toBe(1)
    expect(r.giveReasons).toEqual([])
  })

  it('un chiffre sur un seul dé divise les gorgées à distribuer par deux', () => {
    // 7 + 9 = 16 : pair, dans 11-20, et le 7 (« fait boire ») sorti sur le D12.
    const r = evaluatePlayerRoll1220(7, 9, BETS)
    expect(r.partialHit).toBe(true)
    expect(r.partialNumbers).toEqual([7])
    expect(r.giveEffective).toBe(1)
  })
})

describe('bandOf', () => {
  it('rend la plage qui contient la somme', () => {
    expect(bandOf(2)).toBe('2-10')
    expect(bandOf(10)).toBe('2-10')
    expect(bandOf(11)).toBe('11-20')
    expect(bandOf(21)).toBe('21-30')
    expect(bandOf(30)).toBe('21-30')
  })

  it('31 et 32 ne sont dans aucune plage', () => {
    expect(bandOf(31)).toBeNull()
    expect(bandOf(32)).toBeNull()
  })
})
