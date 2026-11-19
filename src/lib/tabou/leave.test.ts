import { describe, expect, it } from 'vitest'
import {
  createTabouState,
  reduceTabou,
  TABOU_BOT_DESCRIBER_ROUND_MS,
  TABOU_COUNTDOWN_MS,
  TABOU_ROUND_MS,
  type TabouEntry,
  type TabouState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const WORDS: TabouEntry[] = [
  { word: 'Pizza', taboo: ['Italie', 'fromage', 'four', 'tranche'], diff: 1 },
  { word: 'Chat', taboo: ['miauler', 'griffe', 'félin', 'ronronner'], diff: 1 },
  { word: 'Plage', taboo: ['sable', 'mer', 'soleil', 'serviette'], diff: 1 },
  { word: 'Vélo', taboo: ['roue', 'pédale', 'guidon', 'chaîne'], diff: 1 },
  { word: 'Noël', taboo: ['sapin', 'cadeau', 'décembre', 'père Noël'], diff: 1 },
]
const T0 = 1_000_000

/** p0 et p2 en équipe A, p1 et p3 en équipe B : ordre de passage p0, p1, p2, p3. */
function countdown(targetScore = 20): TabouState {
  const players = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
  }))
  return createTabouState(players, WORDS, 'seed-leave', T0 - TABOU_COUNTDOWN_MS, targetScore)
}

/** Manche 1 ouverte à T0 : p0 décrit pour 60 s. */
function describing(targetScore = 20): TabouState {
  const raw = countdown(targetScore)
  const s = reduceTabou(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  expect(s.describerId).toBe('p0')
  return s
}

const leave = (s: TabouState, playerId: string, at: number) => reduceTabou(s, { type: 'LEAVE', playerId, at })
const timeUp = (s: TabouState) =>
  reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt ?? T0 })

describe('Tabou — départ du décrivant', () => {
  it('parti avant son créneau : sa manche est écourtée comme celle d’un bot', () => {
    let s = leave(describing(), 'p1', T0 + 10_000)
    s = timeUp(s)
    const at = T0 + 70_000

    s = reduceTabou(s, { type: 'CONTINUE', playerId: 'p0', now: at })

    // Sans cela : 60 s pleines où personne ne décrit, à chaque tour de table.
    expect(s.describerId).toBe('p1')
    expect(s.phase).toBe('describing')
    expect(s.phaseEndsAt).toBe(at + TABOU_BOT_DESCRIBER_ROUND_MS)
  })

  it('parti en pleine manche : bilan immédiat, les points marqués restent', () => {
    let s = describing()
    s = reduceTabou(s, { type: 'FOUND', playerId: 'p2', now: T0 + 5_000 })
    const word = s.currentWord

    s = leave(s, 'p0', T0 + 20_000)

    expect(s.phase).toBe('roundEnd')
    expect(s.scores).toEqual({ A: 1, B: 0 })
    expect(s.roundStats.found).toBe(1)
    expect(s.lastRoundWord).toEqual(word)
  })

  it('parti pendant le compte à rebours : la première manche est écourtée', () => {
    let s = leave(countdown(), 'p0', T0 - 2_000)

    s = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 })

    expect(s.phase).toBe('describing')
    expect(s.phaseEndsAt).toBe(T0 + TABOU_BOT_DESCRIBER_ROUND_MS)
  })

  it('revenu avant son créneau : il décrit une manche entière', () => {
    let s = leave(describing(), 'p1', T0 + 10_000)
    s = reduceTabou(s, { type: 'REJOIN', playerId: 'p1' })
    s = timeUp(s)
    const at = T0 + 70_000

    s = reduceTabou(s, { type: 'CONTINUE', playerId: 'p0', now: at })

    expect(s.describerId).toBe('p1')
    expect(s.phaseEndsAt).toBe(at + TABOU_ROUND_MS)
  })

  it('score cible atteint puis départ du décrivant : bilan, jamais de fin de partie sur un départ', () => {
    let s = describing(1)
    s = reduceTabou(s, { type: 'FOUND', playerId: 'p2', now: T0 + 5_000 })

    s = leave(s, 'p0', T0 + 6_000)

    // La fin de partie s'enregistre sur /action : un départ ne la déclenche pas.
    expect(s.phase).toBe('roundEnd')
    expect(s.winnerTeam).toBeNull()
  })

  it('le départ d’un autre joueur ne coupe pas la manche', () => {
    const before = describing()

    const s = leave(before, 'p3', T0 + 10_000)

    expect(s.phase).toBe('describing')
    expect(s.phaseEndsAt).toBe(before.phaseEndsAt)
    expect(s.describerId).toBe('p0')
  })
})
