import { describe, expect, it } from 'vitest'
import { applyPreBotAction } from './server-adapter'
import { createPreState, reducePre, PRE_INTERLUDE_MS, type PreState } from './engine'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { phaseKey } from '@/lib/online/phase-clock'

const NOW = 1_000_000
const c = (rank: number, suit = 0) => rank * 4 + suit

/** Fin de la première manche sur 3, mains choisies : la table entre en interlude. */
function interlude(players: { id: string; name: string; isBot?: boolean }[]): PreState {
  const raw = createPreState(players, 'seed', NOW, 3)
  const dealt = reducePre(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: NOW + 5_000 })
  const [a, b, d, e] = players.map((p) => p.id)
  const hands: Record<string, number[]> = { [a]: [c(9)], [b]: [c(3)], [d]: [c(5)], [e]: [c(7), c(8)] }
  let state: PreState = {
    ...dealt,
    players: dealt.players.map((p) => ({ ...p, hand: hands[p.id] })),
    currentTurnId: a,
    lastPlay: null,
    passedIds: [],
    outOrder: [],
  }
  state = reducePre(state, { type: 'PLAY', playerId: a, cards: [c(9)], now: NOW })
  state = reducePre(state, { type: 'PLAY', playerId: b, cards: [c(3)], now: NOW })
  state = reducePre(state, { type: 'PASS', playerId: d, now: NOW })
  state = reducePre(state, { type: 'PASS', playerId: e, now: NOW })
  state = reducePre(state, { type: 'PLAY', playerId: d, cards: [c(5)], now: NOW })
  expect(state.phase).toBe('interlude')
  return state
}

const HUMAN_FIRST = [
  { id: 'p1', name: 'Alice' },
  { id: 'bot-1', name: 'Bot 1', isBot: true },
  { id: 'p2', name: 'Bruno' },
  { id: 'p3', name: 'Chloé' },
]
const BOT_FIRST = [
  { id: 'bot-1', name: 'Bot 1', isBot: true },
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bruno' },
  { id: 'p3', name: 'Chloé' },
]

describe('interlude du Président', () => {
  const adapter = getGameAdapter('president')!

  it('personne n’est « au tour » : pas de cible pour le remplacement AFK', () => {
    expect(adapter.currentActorId(interlude(HUMAN_FIRST))).toBeNull()
    expect(adapter.currentActorId(interlude(BOT_FIRST))).toBeNull()
  })

  it('un bot meneur lance la manche suivante, jamais au nom d’un humain', () => {
    const botLed = applyPreBotAction(interlude(BOT_FIRST))
    if (!botLed.ok) throw new Error(botLed.error)
    expect(botLed.state.phase).toBe('playing')
    expect(botLed.state.manche).toBe(1)
    expect(applyPreBotAction(interlude(HUMAN_FIRST))).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
  })

  it('tick de service : coup du bot meneur à 5 s, sinon l’échéance seule', () => {
    expect(adapter.serviceTick!(interlude(BOT_FIRST), NOW)).toEqual({ body: { action: 'bot' }, dueAt: NOW + 5000 })
    const humanLed = interlude(HUMAN_FIRST)
    expect(adapter.serviceTick!(humanLed, NOW)).toEqual({
      body: { action: 'advance', phaseKey: phaseKey(humanLed) },
      dueAt: NOW + PRE_INTERLUDE_MS,
    })
  })
})

describe('registre : charges d’action du Président', () => {
  it('des cartes non entières sont refusées en 400 avant le moteur', () => {
    const adapter = getGameAdapter('president')!
    const raw = createPreState(HUMAN_FIRST, 'seed', NOW, 1)
    const dealt = reducePre(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: NOW + 5_000 })
    const actor = dealt.currentTurnId!
    for (const cards of [['5'], [1.5], [null], [{}]]) {
      for (const action of ['play', 'close']) {
        expect(adapter.applyAction(dealt, actor, { action, cards })).toEqual({
          ok: false,
          error: 'invalid_action',
          status: 400,
        })
      }
    }
  })
})
