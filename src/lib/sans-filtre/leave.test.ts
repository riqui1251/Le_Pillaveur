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
import { applySFBotAction, convertSFPlayerToBot } from './server-adapter'
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

  it('la carte du nouveau juge reste sur la table, mais il ne peut pas la couronner', () => {
    const before = judgingPhase()
    const own = cardOf(before, 'p1')!
    const shown = (s: SFState, viewer: string) => toSFClientView(s, viewer).submissions?.map((x) => x.card)

    const s = leave(before, 'p0', T0 + 10_000)

    // Rien ne disparaît de la liste anonyme : retirer sa carte la désignait à
    // toute la table (et à la TV) comme celle du nouveau juge.
    expect(s.submissions).toEqual(before.submissions)
    for (const viewer of ['p1', 'p2', 'p3', '']) expect(shown(s, viewer)).toEqual(shown(before, viewer))
    // Lui seul sait laquelle est la sienne : son écran la lui désactive.
    expect(toSFClientView(s, 'p1').myPlayed).toBe(own)
    expect(() =>
      reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p1', card: own, now: T0 + 11_000 })
    ).toThrow('CANNOT_PICK_OWN')

    const picked = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p1', card: cardOf(s, 'p2')!, now: T0 + 11_000 })
    expect(picked.phase).toBe('reveal')
    expect(picked.crowned?.playerId).toBe('p2')
    // Sa carte est jouée, donc repiochée comme celles des autres.
    expect(handOf(picked, 'p1')).toHaveLength(SF_HAND_SIZE)
    expect(handOf(picked, 'p1')).not.toContain(own)
  })

  it('jugement non rendu à temps : le tirage au sort ne couronne jamais la carte du juge', () => {
    const handed = leave(judgingPhase(), 'p0', T0 + 10_000)
    expect(handed.judgeId).toBe('p1')

    for (let seed = 1; seed <= 60; seed += 1) {
      const s = reduceSF(
        { ...handed, rngState: seed * 7919 },
        { type: 'ADVANCE', claimedKey: phaseKey(handed), now: handed.phaseEndsAt ?? T0 }
      )
      expect(s.phase).toBe('reveal')
      expect(['p2', 'p3']).toContain(s.crowned?.playerId)
    }
  })

  it('pendant la pose : le rôle passe tout de suite, la manche continue pour les autres', () => {
    let s = play(submitPhase(), 'p1')
    const own = cardOf(s, 'p1')!

    s = leave(s, 'p0', T0 + 5_000)

    expect(s.judgeId).toBe('p1')
    expect(s.phase).toBe('submit')
    expect(s.phaseEndsAt).toBe(T0 + SF_SUBMIT_MS)
    // Sa carte déjà abattue reste en jeu, hors concours.
    expect(cardOf(s, 'p1')).toBe(own)
    expect(() => play(s, 'p1')).toThrow('JUDGE_CANNOT_PLAY')

    s = play(play(s, 'p2'), 'p3')
    expect(s.phase).toBe('judging')
    expect(s.submissions).toHaveLength(3)
    expect(() =>
      reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p1', card: own, now: T0 + 6_000 })
    ).toThrow('CANNOT_PICK_OWN')
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

  it('juge remplacé par un bot (partie d’avant le correctif) : même passation, sa carte hors concours', () => {
    const before = judgingPhase()
    // État tel que l'ancien moteur le laissait : juge parti, toujours juge.
    const legacy: SFState = {
      ...before,
      players: before.players.map((p) => (p.id === 'p0' ? { ...p, leftAt: T0 + 1_000 } : p)),
    }

    const s = reduceSF(legacy, { type: 'REPLACE_LEFT', now: T0 + 20_000, graceMs: 5_000 })

    expect(s.judgeId).toBe('p1')
    expect(s.submissions).toEqual(before.submissions)
    expect(() =>
      reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p1', card: cardOf(s, 'p1')!, now: T0 + 21_000 })
    ).toThrow('CANNOT_PICK_OWN')
  })

  it('juge inactif remplacé par un bot : le nouveau juge ne peut pas non plus couronner sa carte', () => {
    const s = convertSFPlayerToBot(judgingPhase(), 'p0')!

    expect(s.judgeId).toBe('p1')
    expect(() =>
      reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p1', card: cardOf(s, 'p1')!, now: T0 + 2_000 })
    ).toThrow('CANNOT_PICK_OWN')
  })

  it('juge inactif remplacé alors que la seule réponse est celle de son successeur : manche sans couronne', () => {
    // p1 seul a joué, p2 et p3 partent : le jugement s'ouvre sur sa seule carte.
    let s = play(submitPhase(), 'p1')
    s = leave(leave(s, 'p2', T0 + 2_000), 'p3', T0 + 3_000)
    expect(s.phase).toBe('judging')

    s = convertSFPlayerToBot(s, 'p0')!

    // Sans cela : un jugement sans aucune réponse à couronner, jusqu'à l'échéance.
    expect(s.judgeId).toBe('p1')
    expect(s.phase).toBe('reveal')
    expect(s.crowned).toBeNull()
  })

  it('juge bot sans réponse à couronner : son tick ne plante pas, l’échéance clôt la manche', () => {
    let s = play(submitPhase(), 'p1')
    s = leave(leave(s, 'p2', T0 + 2_000), 'p3', T0 + 3_000)
    // État anormal (deux remplacements de suite) : p1, seul auteur, juge et bot.
    const stuck: SFState = {
      ...s,
      judgeId: 'p1',
      players: s.players.map((p) => (p.id === 'p0' || p.id === 'p1' ? { ...p, isBot: true } : p)),
    }

    expect(applySFBotAction(stuck, () => 0.5)).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
    const after = reduceSF(stuck, { type: 'ADVANCE', claimedKey: phaseKey(stuck), now: stuck.phaseEndsAt ?? T0 })
    expect(after.phase).toBe('reveal')
    expect(after.crowned).toBeNull()
  })

  it('un bot devenu juge en cours de manche ne couronne pas sa propre carte', () => {
    // Table solo : p0 humain juge, p1 à p3 bots. Le juge devient un bot qui a déjà joué.
    let s = submitPhase(3)
    for (const id of ['p1', 'p2', 'p3']) s = play(s, id)
    const botJudge: SFState = { ...s, judgeId: 'p1' }

    for (const r of [0, 0.2, 0.5, 0.8, 0.999]) {
      const result = applySFBotAction(botJudge, () => r)
      expect(result.ok && result.state.crowned?.playerId).not.toBe('p1')
      expect(result.ok && result.state.phase).toBe('reveal')
    }
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
