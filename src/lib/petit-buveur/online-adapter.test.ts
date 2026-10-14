import { afterEach, describe, it, expect, vi } from 'vitest'
import { GAME_ADAPTERS } from '@/lib/online/game-adapters'
import { personaForBotName } from '@/lib/online/bot-personas'
import {
  applyBotAction,
  applyRoomAction,
  applyTimeoutAction,
  buildPetitBuveurEngineState,
  PB_SIDE_CHOICE_MS,
} from './server-adapter'
import type { EngineState } from './engine'

const adapter = GAME_ADAPTERS['petit-buveur']
const NOW = 1_700_000_000_000

function table(botsCount = 0): EngineState {
  return buildPetitBuveurEngineState(
    [
      { userId: 'u1', displayName: 'Alice' },
      { userId: 'u2', displayName: 'Bob' },
    ],
    'normal',
    'adapter-pb',
    botsCount
  )
}

function pendingPileFace(state: EngineState): EngineState {
  return {
    ...state,
    phase: 'awaiting-interaction',
    lastCase: { type: 'pile-face', effect: 2 },
    pending: { caseType: 'pile-face', playerId: 'u1', needsTarget: false, case: { type: 'pile-face', effect: 2 } },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('adaptateur Petit Buveur : choix invalides refusés en 400', () => {
  it('côté de pièce hors pile/face', () => {
    const staged = applyRoomAction(pendingPileFace(table()), 'u1', { type: 'resolve', choice: { targetId: 'u2' } }, NOW)
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    const r = adapter.applyAction(staged.state, 'u2', { action: 'resolve', choice: { side: 'tranche' } })
    expect(r).toEqual({ ok: false, error: 'invalid_action', status: 400 })
  })

  it('cible qui n’a jamais existé', () => {
    const s: EngineState = {
      ...table(),
      phase: 'awaiting-interaction',
      lastCase: { type: 'gorgée', effect: 4 },
      pending: { caseType: 'gorgée', playerId: 'u1', needsTarget: true },
    }
    const r = adapter.applyAction(s, 'u1', { action: 'resolve', choice: { targetId: 'ZZZ' } })
    expect(r).toEqual({ ok: false, error: 'invalid_action', status: 400 })
  })
})

describe('pile ou face : étape de la cible', () => {
  it('la cible devient le joueur « au tour », avec une échéance serveur', () => {
    const staged = applyRoomAction(pendingPileFace(table()), 'u1', { type: 'resolve', choice: { targetId: 'u2' } }, NOW)
    if (!staged.ok) throw new Error(staged.error)
    expect(staged.state.pending?.deadlineAt).toBe(NOW + PB_SIDE_CHOICE_MS)
    expect(adapter.currentActorId(staged.state)).toBe('u2')
    expect(adapter.serviceTick!(staged.state, NOW)).toEqual({
      body: { action: 'advance' },
      dueAt: NOW + PB_SIDE_CHOICE_MS,
    })
  })

  it('délai dépassé : côté tiré au hasard ; avant l’échéance : refus', () => {
    const staged = applyRoomAction(pendingPileFace(table()), 'u1', { type: 'resolve', choice: { targetId: 'u2' } }, NOW)
    if (!staged.ok) throw new Error(staged.error)
    expect(applyTimeoutAction(staged.state, NOW + 1000)).toEqual({ ok: false, error: 'NOT_DUE' })
    vi.useFakeTimers()
    vi.setSystemTime(NOW + PB_SIDE_CHOICE_MS)
    const r = adapter.applyAction(staged.state, '__service__', { action: 'advance' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const done = r.state as EngineState
    expect(done.pending).toBeNull()
    expect(done.lastInteraction?.kind).toBe('pile-face')
  })

  it('cible bot : tick bot à son tempo, et le bot choisit son côté', () => {
    const s = table(1)
    const withBot: EngineState = {
      ...pendingPileFace(s),
      pending: { caseType: 'pile-face', playerId: 'u1', needsTarget: false },
    }
    const staged = applyRoomAction(withBot, 'u1', { type: 'resolve', choice: { targetId: 'bot-1' } }, NOW)
    if (!staged.ok) throw new Error(staged.error)
    const bot = staged.state.players.find((p) => p.id === 'bot-1')!
    expect(adapter.serviceTick!(staged.state, NOW)).toEqual({
      body: { action: 'bot' },
      dueAt: NOW + personaForBotName(bot.name)!.tempoMaxMs,
    })
    const r = applyBotAction(staged.state, NOW)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.lastInteraction).toMatchObject({ kind: 'pile-face', targetId: 'bot-1' })
  })
})

describe('#38 départ du joueur au tour', () => {
  it('markLeft rend la main au suivant : la route écrit ce nouveau joueur au tour', () => {
    const next = adapter.markLeft(table(), 'u1', NOW) as EngineState
    expect(adapter.currentActorId(next)).toBe('u2')
  })

  it('décision en attente du partant : le minuteur de service la joue au tempo d’un bot', () => {
    const s = table()
    const pending: EngineState = {
      ...s,
      phase: 'awaiting-interaction',
      lastCase: { type: 'gorgée', effect: 2 },
      pending: { caseType: 'gorgée', playerId: 'u1', needsTarget: true, case: { type: 'gorgée', effect: 2 } },
    }
    const left = adapter.markLeft(pending, 'u1', NOW) as EngineState
    expect(left.pending?.caseType).toBe('gorgée')
    expect(adapter.serviceTick!(left, NOW)).toEqual({ body: { action: 'bot' }, dueAt: NOW + 4000 })
    const r = adapter.applyAction(left, '__service__', { action: 'bot' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(adapter.currentActorId(r.state)).toBe('u2')
  })
})
