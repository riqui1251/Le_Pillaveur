import { describe, expect, it, vi } from 'vitest'
import { recordWinnerStats } from './local-stats'

describe('recordWinnerStats (Petit Buveur local)', () => {
  it('crédite UNE victoire (delta, jamais un total) au seul gagnant', () => {
    const update = vi.fn()
    recordWinnerStats(update, 'p2')
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith('p2', 'petit-buveur', { wins: 1 })
  })

  it('ne touche ni aux parties jouées ni aux gorgées (comptées ailleurs)', () => {
    const update = vi.fn()
    recordWinnerStats(update, 'p1')
    const stats = update.mock.calls[0][2]
    expect(Object.keys(stats)).toEqual(['wins'])
  })

  it("avale l'erreur du stockage : l'écran de victoire s'affiche quand même", () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const update = vi.fn(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => recordWinnerStats(update, 'p1')).not.toThrow()
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })
})
