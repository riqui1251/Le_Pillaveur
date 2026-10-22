import { describe, expect, it } from 'vitest'
import { firstMissingPick, needsPayout, payoutTargets, rankHorses } from './race'

const lea = { id: 'lea' }
const tom = { id: 'tom' }
const zoe = { id: 'zoe' }

describe('Course PMU — après la course', () => {
  it('les cibles sont tous ceux qui ne montaient pas le gagnant, non assignés compris', () => {
    expect(payoutTargets([lea, tom, zoe], [lea])).toEqual([tom, zoe])
  })

  it('pas de distribution quand toute la table montait le cheval gagnant', () => {
    expect(needsPayout([lea, tom], [lea, tom])).toBe(false)
  })

  it('pas de distribution quand personne ne montait le cheval gagnant', () => {
    expect(needsPayout([lea, tom], [])).toBe(false)
  })

  it('distribution dès qu’un gagnant a au moins une cible', () => {
    expect(needsPayout([lea, tom, zoe], [lea, tom])).toBe(true)
  })

  it('nomme le premier gagnant sans cible, puis plus personne', () => {
    expect(firstMissingPick([lea, tom], {})).toBe(lea)
    expect(firstMissingPick([lea, tom], { lea: 'zoe' })).toBe(tom)
    expect(firstMissingPick([lea, tom], { lea: 'zoe', tom: 'zoe' })).toBeNull()
  })
})

describe('Course PMU — classement', () => {
  it('met le vainqueur en tête même si un autre cheval a passé la ligne plus loin au même pas', () => {
    const horses = [
      { key: 'a', position: 101 },
      { key: 'b', position: 103 },
      { key: 'c', position: 40 },
    ]
    expect(rankHorses(horses, 'a').map((h) => h.key)).toEqual(['a', 'b', 'c'])
  })

  it('en course, range par position puis par couloir à égalité', () => {
    const horses = [
      { key: 'a', position: 10 },
      { key: 'b', position: 30 },
      { key: 'c', position: 10 },
    ]
    expect(rankHorses(horses, null).map((h) => h.key)).toEqual(['b', 'a', 'c'])
  })
})
