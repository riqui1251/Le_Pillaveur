import { describe, expect, it } from 'vitest'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { buildTelephoneState } from './server-adapter'
import { reduceTelephone, type TelephoneState } from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const adapter = getGameAdapter('telephone-dessine')!
const members = ['u1', 'u2', 'u3'].map((userId) => ({ userId, user: { displayName: userId } }))

/** Partie à 3 posée en manche de dessin (après les trois phrases de départ). */
function atDrawRound(): TelephoneState {
  const raw = buildTelephoneState(members, 'seed-telephone')
  let s = reduceTelephone(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: raw.phaseEndsAt! })
  for (const m of members) s = reduceTelephone(s, { type: 'WRITE', playerId: m.userId, text: m.userId, now: Date.now() })
  return s
}

describe('Téléphone Dessiné — actions HTTP', () => {
  it('draw-stroke et clear ne sont plus des actions : le dessin arrive entier avec submit', () => {
    const s = atDrawRound()
    expect(s.round).toBe(1)
    const stroke = { points: [0, 0, 1, 1], color: 'x'.repeat(400_000) }
    expect(adapter.applyAction(s, 'u1', { action: 'draw-stroke', stroke })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
    expect(adapter.applyAction(s, 'u1', { action: 'clear' })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
  })

  it('submit assainit le dessin envoyé : la vue du joueur suivant reste légère et propre', () => {
    let s: unknown = atDrawRound()
    const dirty = Array.from({ length: 20 }, () => ({ points: [0, 0, 1, 1], color: 'x'.repeat(20_000), evil: 1 }))
    for (const m of members) {
      const result = adapter.applyAction(s, m.userId, { action: 'submit', strokes: dirty })
      expect(result.ok).toBe(true)
      if (result.ok) s = result.state
    }
    expect((s as TelephoneState).round).toBe(2)
    const view = adapter.clientViewJson(s, 'u2')
    expect(view).not.toContain('evil')
    expect(view.length).toBeLessThan(20_000)
    expect(adapter.serialize(s).length).toBeLessThan(60_000)
  })
})
