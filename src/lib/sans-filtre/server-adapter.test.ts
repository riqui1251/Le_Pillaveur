import { describe, expect, it } from 'vitest'
import { createSFState, reduceSF, SF_COUNTDOWN_MS, type SFState } from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { applySFBotAction, buildSFState } from './server-adapter'
import { personaForBotName } from '@/lib/online/bot-personas'

const T0 = 1_000_000
const BLACKS = ['Trou n°1 : ___.', 'Trou n°2 : ___.', 'Trou n°3 : ___.']
/** Longueur du texte = index de carte + 1 → « plus courte » = plus petit index. */
const WHITES = Array.from({ length: 48 }, (_, i) => 'x'.repeat(i + 1))

/**
 * Table solo (1 humain + 3 bots à persona), countdown consommé : manche 1 à
 * T0, juge = p0 (l'humain), les bots doivent soumettre via les ticks.
 */
function makeSolo(seed: string | number = 'seed'): SFState {
  const players = [
    { id: 'p0', name: 'P0' },
    { id: 'b1', name: 'Barnabé 🎩', isBot: true }, // prudent
    { id: 'b2', name: 'Gépéto 🤠', isBot: true }, // farceur
    { id: 'b3', name: 'Huguette 👵', isBot: true }, // prudent
  ]
  const raw = createSFState(players, BLACKS, WHITES, seed, T0 - SF_COUNTDOWN_MS)
  return reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

/** Déroule la manche 1 puis contrôle la manche 2 : juge-bot b1, soumissions [p0, b2, b3]. */
function makeBotJudgeJudging(): SFState {
  let s = makeSolo()
  for (const id of ['b1', 'b2', 'b3']) {
    const hand = s.players.find((p) => p.id === id)!.hand
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: id, card: hand[0], now: T0 })
  }
  s = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: s.submissions[0].card, now: T0 })
  s = reduceSF(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
  for (const id of ['p0', 'b2', 'b3']) {
    const hand = s.players.find((p) => p.id === id)!.hand
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: id, card: hand[0], now: T0 })
  }
  return s
}

describe('buildSFState : personas', () => {
  it('les bots de complément portent un persona retrouvable par le nom', () => {
    const members = [{ userId: 'u1', user: { displayName: 'Riqui' } }]
    const state = buildSFState(members, 'soft', 0, 'seed')
    const bots = state.players.filter((p) => p.isBot)
    expect(bots).toHaveLength(3)
    expect(new Set(bots.map((b) => b.name)).size).toBe(bots.length)
    for (const bot of bots) {
      expect(personaForBotName(bot.name)).not.toBeNull()
    }
  })
})

describe('applySFBotAction : soumissions étalées', () => {
  it('un tick fait soumettre exactement UN bot (le premier en attente)', () => {
    let s = makeSolo()
    const r1 = applySFBotAction(s, () => 0)
    if (!r1.ok) throw new Error(r1.error)
    s = r1.state
    expect(s.phase).toBe('submit')
    expect(s.submissions).toHaveLength(1)
    expect(s.submissions[0].playerId).toBe('b1')

    const r2 = applySFBotAction(s, () => 0)
    if (!r2.ok) throw new Error(r2.error)
    s = r2.state
    expect(s.phase).toBe('submit')
    expect(s.submissions).toHaveLength(2)
    expect(s.submissions[1].playerId).toBe('b2')

    // Dernier bot : le raccourci « tous ont soumis » entre au jugement.
    const r3 = applySFBotAction(s, () => 0)
    if (!r3.ok) throw new Error(r3.error)
    s = r3.state
    expect(s.submissions).toHaveLength(3)
    expect(s.phase).toBe('judging')
    expect(applySFBotAction(s).ok).toBe(false) // juge humain : plus rien à ticker
  })

  it('farceur : parmi 3 cartes tirées de sa main, abat la plus courte', () => {
    const s = makeSolo()
    const gepeto = s.players.find((p) => p.id === 'b2')!
    // rand → 0 : tire hand[0..2] ; la plus courte = plus petit index de carte.
    const expected = Math.min(...gepeto.hand.slice(0, 3))
    const r1 = applySFBotAction(s, () => 0) // b1 joue (aléatoire simple)
    if (!r1.ok) throw new Error(r1.error)
    const r2 = applySFBotAction(r1.state, () => 0) // b2 le farceur
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.state.submissions.find((sub) => sub.playerId === 'b2')?.card).toBe(expected)
  })
})

describe('applySFBotAction : juge-bot pondéré', () => {
  it('couronne pondéré 3:1 en faveur des soumissions humaines', () => {
    const s = makeBotJudgeJudging()
    expect(s.phase).toBe('judging')
    expect(s.judgeId).toBe('b1')
    expect(s.submissions.map((sub) => sub.playerId)).toEqual(['p0', 'b2', 'b3'])

    // Poids [humain 3, bot 1, bot 1], total 5 : r < 3/5 → l'humain gagne.
    const pickAt = (r: number) => {
      const result = applySFBotAction(s, () => r)
      if (!result.ok) throw new Error(result.error)
      expect(result.state.phase).toBe('reveal')
      return result.state.crowned?.playerId
    }
    expect(pickAt(0)).toBe('p0')
    expect(pickAt(0.59)).toBe('p0')
    expect(pickAt(0.61)).toBe('b2')
    expect(pickAt(0.99)).toBe('b3')
  })
})
