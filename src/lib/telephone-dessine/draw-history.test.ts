import { describe, expect, it } from 'vitest'
import { DRAW_HISTORY_LIMIT, EMPTY_DRAW_HISTORY, drawHistoryReducer, type DrawHistory } from './draw-history'

const stroke = (n: number) => ({ points: [0, 0, n / 10, n / 10], color: '#24201A', width: 6 })

function draw(history: DrawHistory, count: number): DrawHistory {
  let h = history
  for (let i = 0; i < count; i += 1) h = drawHistoryReducer(h, { type: 'stroke', stroke: stroke(i) })
  return h
}

describe('drawHistoryReducer — brouillon du dessin', () => {
  it('annule le dernier trait, puis le précédent', () => {
    let h = draw(EMPTY_DRAW_HISTORY, 3)
    expect(h.strokes).toHaveLength(3)
    h = drawHistoryReducer(h, { type: 'undo' })
    expect(h.strokes).toEqual([stroke(0), stroke(1)])
    h = drawHistoryReducer(h, { type: 'undo' })
    expect(h.strokes).toEqual([stroke(0)])
    h = drawHistoryReducer(h, { type: 'undo' })
    expect(h.strokes).toEqual([])
  })

  it('annuler sans passé ne change rien', () => {
    expect(drawHistoryReducer(EMPTY_DRAW_HISTORY, { type: 'undo' })).toBe(EMPTY_DRAW_HISTORY)
  })

  it('« Tout effacer » (confirmé) et la manche suivante repartent d’une feuille neuve', () => {
    const h = draw(EMPTY_DRAW_HISTORY, 4)
    expect(drawHistoryReducer(h, { type: 'clear' })).toEqual(EMPTY_DRAW_HISTORY)
    expect(drawHistoryReducer(h, { type: 'reset' })).toEqual(EMPTY_DRAW_HISTORY)
  })

  it('garde un historique borné', () => {
    const h = draw(EMPTY_DRAW_HISTORY, DRAW_HISTORY_LIMIT + 20)
    expect(h.past).toHaveLength(DRAW_HISTORY_LIMIT)
    expect(h.strokes).toHaveLength(DRAW_HISTORY_LIMIT + 20)
  })
})
