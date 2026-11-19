import { describe, expect, it } from 'vitest'
import {
  createSFState,
  reduceSF,
  toSFClientView,
  SF_COUNTDOWN_MS,
  SF_HAND_SIZE,
  SF_JUDGE_MS,
  SF_SUBMIT_MS,
  type SFState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const T0 = 1_000_000
const BLACKS = ['Trou n°1 : ___.', 'Trou n°2 : ___.', 'Trou n°3 : ___.']
const WHITES = Array.from({ length: 48 }, (_, i) => `réponse ${i}`)

/** Quatre joueurs p0..p3 (les `bots` derniers sont des bots), manche 1 ouverte à T0 : p0 juge. */
function submitPhase(bots = 0): SFState {
  const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: i >= 4 - bots }))
  const raw = createSFState(players, BLACKS, WHITES, 'seed-leave', T0 - SF_COUNTDOWN_MS, 3)
  const s = reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  expect(s.judgeId).toBe('p0')
  return s
}

const play = (s: SFState, playerId: string, now = T0 + 1_000) =>
  reduceSF(s, {
    type: 'PLAY_CARD',
    playerId,
    card: s.players.find((p) => p.id === playerId)!.hand[0],
    now,
  })
const leave = (s: SFState, playerId: string, at: number) => reduceSF(s, { type: 'LEAVE', playerId, at })
const handOf = (s: SFState, id: string) => s.players.find((p) => p.id === id)!.hand
const cardOf = (s: SFState, id: string) => s.submissions.find((x) => x.playerId === id)?.card

function judgingPhase(): SFState {
  let s = submitPhase()
  for (const id of ['p1', 'p2', 'p3']) s = play(s, id)
  expect(s.phase).toBe('judging')
  return s
}

describe('Sans Filtre — départ du juge', () => {
  it('pendant le jugement : un autre humain juge aussitôt, avec un délai entier', () => {
    const before = judgingPhase()

    const s = leave(before, 'p0', T0 + 10_000)

    // Sans cela : 90 s d'attente, puis une couronne tirée au sort.
    expect(s.judgeId).toBe('p1')
    expect(s.phase).toBe('judging')
    expect(s.phaseSeq).toBe(before.phaseSeq + 1)
    expect(s.phaseEndsAt).toBe(T0 + 10_000 + SF_JUDGE_MS)
  })

  it('le nouveau juge reprend sa carte : il ne peut pas couronner sa propre réponse', () => {
    const before = judgingPhase()
    const own = cardOf(before, 'p1')!

    const s = leave(before, 'p0', T0 + 10_000)

    expect(s.submissions.map((x) => x.playerId).sort()).toEqual(['p2', 'p3'])
    expect(handOf(s, 'p1')).toHaveLength(SF_HAND_SIZE)
    expect(handOf(s, 'p1')).toContain(own)
    expect(toSFClientView(s, 'p1').submissions?.map((x) => x.card)).not.toContain(own)
    expect(() =>
      reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p1', card: own, now: T0 + 11_000 })
    ).toThrow('INVALID_PICK')

    const picked = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p1', card: cardOf(s, 'p2')!, now: T0 + 11_000 })
    expect(picked.phase).toBe('reveal')
    expect(picked.crowned?.playerId).toBe('p2')
    // Le juge n'a rien joué cette manche : sa main ne grossit pas à la repioche.
    expect(handOf(picked, 'p1')).toHaveLength(SF_HAND_SIZE)
  })

  it('pendant la pose : le rôle passe tout de suite, la manche continue pour les autres', () => {
    let s = play(submitPhase(), 'p1')

    s = leave(s, 'p0', T0 + 5_000)

    expect(s.judgeId).toBe('p1')
    expect(s.phase).toBe('submit')
    expect(s.phaseEndsAt).toBe(T0 + SF_SUBMIT_MS)
    expect(s.submissions).toEqual([])
    expect(handOf(s, 'p1')).toHaveLength(SF_HAND_SIZE)
    expect(() => play(s, 'p1')).toThrow('JUDGE_CANNOT_PLAY')

    s = play(play(s, 'p2'), 'p3')
    expect(s.phase).toBe('judging')
    expect(s.submissions).toHaveLength(2)
  })

  it('pendant la pose, les autres ayant déjà joué : le jugement s’ouvre aussitôt', () => {
    let s = play(play(submitPhase(), 'p2'), 'p3')

    s = leave(s, 'p0', T0 + 5_000)

    expect(s.judgeId).toBe('p1')
    expect(s.phase).toBe('judging')
    expect(s.phaseEndsAt).toBe(T0 + 5_000 + SF_JUDGE_MS)
  })

  it('le seul auteur d’une réponse devient juge : manche sans couronne', () => {
    let s = play(submitPhase(), 'p1')
    s = reduceSF(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + SF_SUBMIT_MS })
    expect(s.phase).toBe('judging')

    s = leave(s, 'p0', T0 + SF_SUBMIT_MS + 1_000)

    expect(s.phase).toBe('reveal')
    expect(s.crowned).toBeNull()
    expect(handOf(s, 'p1')).toHaveLength(SF_HAND_SIZE)
  })

  it('revenu, l’ancien juge joue comme les autres', () => {
    let s = leave(submitPhase(), 'p0', T0 + 5_000)
    s = reduceSF(s, { type: 'REJOIN', playerId: 'p0' })

    expect(s.judgeId).toBe('p1')
    s = play(play(play(s, 'p0'), 'p2'), 'p3')
    expect(s.phase).toBe('judging')
    expect(s.submissions).toHaveLength(3)
  })

  it('dernier présent : son départ ne touche à rien', () => {
    let s = judgingPhase()
    for (const id of ['p1', 'p2', 'p3']) s = leave(s, id, T0 + 5_000)
    const before = s

    s = leave(s, 'p0', T0 + 6_000)

    expect(s.judgeId).toBe('p0')
    expect(s.phase).toBe('judging')
    expect(s.phaseEndsAt).toBe(before.phaseEndsAt)
    expect(s.submissions).toEqual(before.submissions)
  })

  it('dernier humain d’une table de bots : il reste juge, aucun bot ne juge dans le vide', () => {
    let s = submitPhase(3)
    for (const id of ['p1', 'p2', 'p3']) s = play(s, id)
    expect(s.phase).toBe('judging')
    const before = s

    s = leave(s, 'p0', T0 + 5_000)

    expect(s.judgeId).toBe('p0')
    expect(s.submissions).toEqual(before.submissions)
    expect(s.phaseEndsAt).toBe(before.phaseEndsAt)
  })

  it('juge remplacé par un bot (partie d’avant le correctif) : même passation, carte reprise', () => {
    const before = judgingPhase()
    // État tel que l'ancien moteur le laissait : juge parti, toujours juge.
    const legacy: SFState = {
      ...before,
      players: before.players.map((p) => (p.id === 'p0' ? { ...p, leftAt: T0 + 1_000 } : p)),
    }

    const s = reduceSF(legacy, { type: 'REPLACE_LEFT', now: T0 + 20_000, graceMs: 5_000 })

    expect(s.judgeId).toBe('p1')
    expect(s.submissions.map((x) => x.playerId).sort()).toEqual(['p2', 'p3'])
    expect(handOf(s, 'p1')).toHaveLength(SF_HAND_SIZE)
  })
})

describe('Sans Filtre — départ d’un joueur attendu', () => {
  it('le dernier à ne pas avoir joué s’en va : le jugement s’ouvre sans attendre le chrono', () => {
    let s = play(play(submitPhase(), 'p1'), 'p2')
    expect(s.phase).toBe('submit')

    s = leave(s, 'p3', T0 + 5_000)

    expect(s.phase).toBe('judging')
    expect(s.judgeId).toBe('p0')
    expect(s.submissions).toHaveLength(2)
    expect(s.phaseEndsAt).toBe(T0 + 5_000 + SF_JUDGE_MS)
  })

  it('un départ ne clôt rien tant qu’un présent n’a pas joué', () => {
    let s = play(submitPhase(), 'p1')

    s = leave(s, 'p3', T0 + 5_000)

    expect(s.phase).toBe('submit')
    expect(s.phaseEndsAt).toBe(T0 + SF_SUBMIT_MS)
  })

  it('la carte d’un joueur parti après l’avoir abattue reste en lice', () => {
    let s = play(submitPhase(), 'p1')
    s = leave(s, 'p1', T0 + 5_000)
    s = play(play(s, 'p2'), 'p3')

    expect(s.phase).toBe('judging')
    expect(s.submissions).toHaveLength(3)
  })
})
