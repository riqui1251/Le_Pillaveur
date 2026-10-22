import { describe, expect, it } from 'vitest'
import { createCrobardState, reduceCrobard, CROBARD_COUNTDOWN_MS } from './engine'
import { applyCrobardRoomAction } from './server-adapter'
import { phaseKey } from '@/lib/online/phase-clock'

const WORDS = ['Pizza', 'Chat', 'Plage', 'Vélo']
const T0 = 1_000_000

function drawing() {
  const players = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
  const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS)
  const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  return reduceCrobard(choosing, { type: 'CHOOSE_WORD', playerId: choosing.drawerId, index: 0, now: T0 })
}

describe('applyCrobardRoomAction — undo-stroke', () => {
  it('le dessinateur retire son dernier trait', () => {
    const s = drawing()
    const drawn = applyCrobardRoomAction(s, s.drawerId, {
      type: 'draw-stroke',
      stroke: { points: [0, 0, 1, 1], color: '#24201A', width: 6 },
    })
    expect(drawn.ok).toBe(true)
    if (!drawn.ok) return
    const undone = applyCrobardRoomAction(drawn.state, s.drawerId, { type: 'undo-stroke' })
    expect(undone.ok && undone.state.strokes).toEqual([])
  })

  it('refus moteur rendu en code, sans exception', () => {
    const s = drawing()
    expect(applyCrobardRoomAction(s, s.drawerId, { type: 'undo-stroke' })).toEqual({
      ok: false,
      error: 'NOTHING_TO_UNDO',
    })
  })
})
