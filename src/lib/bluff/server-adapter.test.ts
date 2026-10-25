import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyBluffBotAction, convertBluffPlayerToBot } from './server-adapter'
import {
  createBluffState,
  reduceBluff,
  BLUFF_COUNTDOWN_MS,
  BLUFF_REVEAL_MIN_MS,
  BLUFF_VOTE_MS,
  type BluffPrompt,
  type BluffState,
} from './engine'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { phaseKey } from '@/lib/online/phase-clock'

const PROMPTS: BluffPrompt[] = [
  { id: 'q1', q: 'Capitale du Japon ?', answer: 'Tokyo', decoys: ['Osaka', 'Kyoto', 'Nagoya'] },
]

const T0 = 1_000_000

function inSubmit(players: { id: string; name: string; isBot?: boolean }[]): BluffState {
  const raw = createBluffState(players, PROMPTS, 'seed', T0 - BLUFF_COUNTDOWN_MS, 1)
  return reduceBluff(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applyBluffBotAction', () => {
  it('un bot ne vote jamais pour la vraie réponse que son siège avait tapée comme bluff', () => {
    let s = inSubmit([
      { id: 'p0', name: 'P0' },
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
    ])
    s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p0', text: 'tokyo', now: T0 })
    s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p1', text: 'Lyon', now: T0 })
    s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: 'p2', text: 'Nice', now: T0 })
    expect(s.phase).toBe('vote')
    const realId = s.candidates.find((c) => c.isReal)!.candidateId
    const converted = convertBluffPlayerToBot(s, 'p0')!
    for (const r of [0, 0.34, 0.67, 0.99]) {
      vi.spyOn(Math, 'random').mockReturnValue(r)
      const result = applyBluffBotAction(converted)
      if (!result.ok) throw new Error(result.error)
      expect(result.state.pendingVotes.p0).toBeDefined()
      expect(result.state.pendingVotes.p0).not.toBe(realId)
    }
  })

  it('reveal : seul un bot meneur enchaîne, jamais au nom d’un humain', () => {
    const now = Date.now()
    const play = (players: { id: string; name: string; isBot?: boolean }[]) => {
      let s = inSubmit(players)
      for (const p of s.players) {
        s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: p.id, text: `bluff-${p.id}`, now: T0 })
      }
      s = reduceBluff(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + BLUFF_VOTE_MS })
      expect(s.phase).toBe('reveal')
      return { ...s, revealAt: now - BLUFF_REVEAL_MIN_MS - 1_000 }
    }
    const botLed = play([
      { id: 'bot-1', name: 'Bot', isBot: true },
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
    ])
    const result = applyBluffBotAction(botLed)
    expect(result.ok && result.state.phase).toBe('finished')

    const humanLed = play([
      { id: 'p1', name: 'P1' },
      { id: 'bot-1', name: 'Bot', isBot: true },
      { id: 'p2', name: 'P2' },
    ])
    expect(applyBluffBotAction(humanLed)).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
  })
})

describe('registre : Grand Bluff', () => {
  const adapter = getGameAdapter('bluff')!

  it('reveal : personne n’est « au tour » (pas d’expulsion AFK), le tick de service suit le bot meneur', () => {
    let s = inSubmit([
      { id: 'bot-1', name: 'Bot', isBot: true },
      { id: 'p1', name: 'P1' },
      { id: 'p2', name: 'P2' },
    ])
    for (const p of s.players) {
      s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: p.id, text: `bluff-${p.id}`, now: T0 })
    }
    s = reduceBluff(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + BLUFF_VOTE_MS })
    expect(s.phase).toBe('reveal')
    expect(adapter.currentActorId(s)).toBeNull()
    expect(adapter.serviceTick!(s, T0)?.body).toEqual({ action: 'bot' })
  })
})
