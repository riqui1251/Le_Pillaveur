import { describe, expect, it } from 'vitest'
import { createSeededRng } from '@/lib/online-rng'
import { drawRiders, firstMissingPick, needsPayout, payoutTargets, rankHorses } from './race'

const lea = { id: 'lea' }
const tom = { id: 'tom' }
const zoe = { id: 'zoe' }

const table = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }))
const noRiders = () => [[], [], [], []]
const ids = (lanes: { id: string }[][]) => lanes.map((lane) => lane.map((p) => p.id))

describe('Course PMU — tirage des cavaliers', () => {
  it('met chaque joueur sur un seul cheval', () => {
    const players = table(7)
    const lanes = drawRiders(players, noRiders(), createSeededRng(1))
    expect(lanes).toHaveLength(4)
    expect(ids(lanes).flat().sort()).toEqual(players.map((p) => p.id).sort())
  })

  it('aucun cheval n’a plus d’un cavalier d’avance sur un autre', () => {
    const rng = createSeededRng(2)
    for (let n = 1; n <= 12; n++) {
      for (let k = 0; k < 20; k++) {
        const sizes = drawRiders(table(n), noRiders(), rng).map((lane) => lane.length)
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('les joueurs en trop ne tombent pas toujours sur les premiers chevaux', () => {
    const rng = createSeededRng(3)
    const doubled = new Set<number>()
    for (let k = 0; k < 100; k++) {
      drawRiders(table(5), noRiders(), rng).forEach((lane, horse) => {
        if (lane.length === 2) doubled.add(horse)
      })
    }
    expect([...doubled].sort()).toEqual([0, 1, 2, 3])
  })

  it('garde l’ordre de la table sur chaque cheval', () => {
    const players = table(9)
    for (const lane of drawRiders(players, noRiders(), createSeededRng(4))) {
      const seats = lane.map((p) => players.indexOf(p))
      expect(seats).toEqual([...seats].sort((a, b) => a - b))
    }
  })

  it('un nouveau tirage déplace toujours quelqu’un, même seul ou à deux', () => {
    const rng = createSeededRng(5)
    for (const n of [1, 2, 4]) {
      let lanes = drawRiders(table(n), noRiders(), rng)
      for (let k = 0; k < 50; k++) {
        const next = drawRiders(table(n), lanes, rng)
        expect(ids(next)).not.toEqual(ids(lanes))
        lanes = next
      }
    }
  })
})

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
