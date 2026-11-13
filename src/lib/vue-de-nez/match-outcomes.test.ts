import { describe, expect, it } from 'vitest'
import { computeMatchResults } from '@/lib/online/match-results'
import { vueDeNezMatchOutcomes } from './match-outcomes'
import { applyVdnRoomAction, buildVdnOnlineState, type VdnOnlineState } from './server-adapter'

const T0 = 1_700_000_000_000

function played(ids: string[], botsCount: number, values: (answer: number) => number[]): VdnOnlineState {
  let state = buildVdnOnlineState(
    ids.map((id) => ({ userId: id, user: { displayName: id } })),
    { seed: 'issue', botsCount, now: T0 }
  )
  const answer = state.questions[0].answer
  const humans = state.players.filter((p) => !p.isBot)
  values(answer).forEach((value, i) => {
    const result = applyVdnRoomAction(state, humans[i].id, { type: 'estimate', value }, T0 + 1_000)
    if (!result.ok) throw new Error(result.error)
    state = result.state
  })
  return state
}

describe('vueDeNezMatchOutcomes', () => {
  it('rang compétition sur le score ; seul le premier au score positif gagne', () => {
    const state = played(['u1', 'u2', 'u3'], 0, (a) => [a, a + Math.abs(a) + 10, a + 3 * (Math.abs(a) + 10)])
    expect(vueDeNezMatchOutcomes(state)).toEqual([
      { playerId: 'u1', isBot: false, won: true, rank: 1 },
      { playerId: 'u2', isBot: false, won: false, rank: 2 },
      { playerId: 'u3', isBot: false, won: false, rank: 3 },
    ])
  })

  it('personne au-dessus de zéro : pas de vainqueur, ex æquo au même rang', () => {
    const state = played(['u1', 'u2'], 0, () => [])
    expect(vueDeNezMatchOutcomes(state)).toEqual([
      { playerId: 'u1', isBot: false, won: false, rank: 1 },
      { playerId: 'u2', isBot: false, won: false, rank: 1 },
    ])
  })

  it('les bots de complément sont marqués et sortent du classement', () => {
    const state = played(['u1'], 2, () => [])
    const outcomes = vueDeNezMatchOutcomes(state)
    expect(outcomes.map((o) => [o.playerId, o.isBot])).toEqual([
      ['u1', false],
      ['bot-1', true],
      ['bot-2', true],
    ])
    expect(computeMatchResults(outcomes)).toEqual([])
  })
})
