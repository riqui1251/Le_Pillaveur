import { describe, expect, it } from 'vitest'
import { startDisplay, stepDisplay, stepDelayMs } from './useSteppedPositions'
import { outcomeText, type SpectacleLabels } from './InteractionSpectacle'
import { drinkIcon } from './drink-feedback'

describe('useSteppedPositions — logique pure', () => {
  it('sans saut, chaque pion garde sa case affichée ; nouveaux posés, disparus purgés', () => {
    expect(startDisplay({ a: 3, gone: 7 }, { a: 9, b: 4 }, false)).toEqual({ a: 3, b: 4 })
  })

  it('avec saut (snapKey changé), tous les pions sont déjà sur leur cible', () => {
    const shown = startDisplay({ a: 3, b: 20 }, { a: 0, b: 0 }, true)
    expect(shown).toEqual({ a: 0, b: 0 })
    expect(stepDisplay(shown, { a: 0, b: 0 })).toBeNull()
  })

  it('marche une case à la fois, dans les deux sens', () => {
    const step = stepDisplay({ a: 3, b: 5, c: 2 }, { a: 5, b: 4, c: 2 })
    expect(step).toEqual({ next: { a: 4, b: 4, c: 2 }, moved: ['a', 'b'] })
  })

  it('accélère les grands sauts pour rester sous une seconde', () => {
    expect(stepDelayMs(3)).toBe(120)
    expect(stepDelayMs(20) * 20).toBeLessThan(1000)
    expect(stepDelayMs(29)).toBeGreaterThanOrEqual(45)
  })
})

const labels: SpectacleLabels = {
  wheelSafe: 'safe',
  wheelDrinks: '{count}',
  wheelLegendSafe: '',
  wheelLegendDrink: '',
  pfWin: 'win',
  pfLose: '{name} {count}',
  pile: 'pile',
  face: 'face',
  deHonteSafe: 'sauvé',
  deHonteDrink: 'boit',
  deHonteForward: 'avance',
  deHonteBack: 'recule',
  deHonteCannotBack: 'ne peut pas reculer',
}
const six = { kind: 'de-honte' as const, actorId: 'a', value: 6 }

describe('InteractionSpectacle — texte du résultat (règle 14)', () => {
  it("annonce un recul quand l'acteur peut reculer", () => {
    expect(outcomeText(six, labels, '', 4)).toBe('recule')
    expect(outcomeText(six, labels, '')).toBe('recule')
  })

  it("n'annonce jamais de recul depuis la case 1 (index 0)", () => {
    expect(outcomeText(six, labels, '', 0)).toBe('ne peut pas reculer')
    expect(outcomeText(six, { ...labels, deHonteCannotBack: undefined }, '', 0)).toBe('sauvé')
  })

  it('le 5 avance toujours, même depuis la case 1', () => {
    expect(outcomeText({ ...six, value: 5 }, labels, '', 0)).toBe('avance')
  })
})

describe('drink-feedback — picto du gage', () => {
  it("pas d'alcool à l'écran en ambiance Soft", () => {
    expect(drinkIcon('soft')).toBe('🌿')
    expect(drinkIcon('alcool')).toBe('🍺')
  })
})
