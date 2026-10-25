import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCrobardState,
  reduceCrobard,
  CROBARD_COUNTDOWN_MS,
  CROBARD_DRAWING_MS,
  CROBARD_GUESS_INTERVAL_MS,
  CROBARD_MAX_GUESSES,
  type CrobardState,
} from './engine'
import { applyCrobardRoomAction, buildCrobardState } from './server-adapter'
import { getCrobardWords } from './data'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { phaseKey } from '@/lib/online/phase-clock'

const WORDS = ['Pizza', 'Chat', 'Plage', 'Vélo']
const T0 = 1_000_000

function drawing() {
  const players = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
  const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS)
  const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  return reduceCrobard(choosing, { type: 'CHOOSE_WORD', playerId: choosing.drawerId, index: 0, now: T0 })
}

describe('applyCrobardRoomAction — undo-stroke', () => {
  it('le dessinateur retire son dernier trait', () => {
    const s = drawing()
    const drawn = applyCrobardRoomAction(s, s.drawerId, {
      type: 'draw-stroke',
      stroke: { points: [0, 0, 1, 1], color: '#24201A', width: 6 },
    })
    expect(drawn.ok).toBe(true)
    if (!drawn.ok) return
    const undone = applyCrobardRoomAction(drawn.state, s.drawerId, { type: 'undo-stroke' })
    expect(undone.ok && undone.state.strokes).toEqual([])
  })

  it('refus moteur rendu en code, sans exception', () => {
    const s = drawing()
    expect(applyCrobardRoomAction(s, s.drawerId, { type: 'undo-stroke' })).toEqual({
      ok: false,
      error: 'NOTHING_TO_UNDO',
    })
  })
})

describe('Crobard — devinettes par l’API (force brute)', () => {
  const adapter = getGameAdapter('crobard')!
  afterEach(() => {
    vi.useRealTimers()
  })

  function drawingOn(word: string): CrobardState {
    const members = ['u1', 'u2', 'u3'].map((userId) => ({ userId, user: { displayName: userId } }))
    const raw = buildCrobardState(members, 'fr', 0, 'seed-crobard')
    const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: raw.phaseEndsAt! })
    const forced = { ...choosing, wordChoices: [word, 'Chat', 'Plage'] }
    return reduceCrobard(forced, { type: 'CHOOSE_WORD', playerId: forced.drawerId, index: 0, now: Date.now() })
  }

  it('la boucle sur la liste des mots est arrêtée au quota : 20 essais notés puis refus', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    let state: unknown = drawingOn('Voilier')
    const guesser = (state as CrobardState).players.find((p) => p.id !== (state as CrobardState).drawerId)!.id
    const results: string[] = []
    for (const w of [...getCrobardWords('fr').filter((x) => x !== 'Voilier'), 'Voilier']) {
      vi.advanceTimersByTime(CROBARD_GUESS_INTERVAL_MS)
      const result = adapter.applyAction(state, guesser, { action: 'guess', text: w })
      if (!result.ok) {
        results.push(`${result.status}:${result.error}`)
        break
      }
      state = result.state
      results.push('ok')
    }
    expect(results.filter((r) => r === 'ok')).toHaveLength(CROBARD_MAX_GUESSES)
    expect(results.at(-1)).toBe('403:GUESS_LIMIT_REACHED')
    expect((state as CrobardState).correctGuessers).toEqual([])
  })

  it('une rafale est refusée (403) sans rien écrire', () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const s = drawingOn('Voilier')
    const guesser = s.players.find((p) => p.id !== s.drawerId)!.id
    const first = adapter.applyAction(s, guesser, { action: 'guess', text: 'Bateau' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(adapter.applyAction(first.state, guesser, { action: 'guess', text: 'Voilier' })).toEqual({
      ok: false,
      error: 'GUESS_TOO_FAST',
      status: 403,
    })
  })

  it('au bilan, personne n’est « au tour » (pas d’expulsion AFK) et le bot meneur continue quand même', () => {
    const base = buildCrobardState([{ userId: 'u1', user: { displayName: 'u1' } }], 'fr', 2, 'seed-crobard')
    const bots = base.players.filter((p) => p.isBot)
    const humans = base.players.filter((p) => !p.isBot)
    const roundEnd: CrobardState = { ...base, players: [...bots, ...humans], phase: 'roundEnd', phaseEndsAt: null }
    expect(adapter.currentActorId(roundEnd)).toBeNull()
    expect(adapter.serviceTick!(roundEnd, T0)?.body).toEqual({ action: 'bot' })
    const result = adapter.applyAction(roundEnd, 'u1', { action: 'bot' })
    expect(result.ok && (result.state as CrobardState).phase).toBe('choosing')
    // Bilan mené par un humain : aucun coup de bot à jouer.
    const humanLed: CrobardState = { ...roundEnd, players: [...humans, ...bots] }
    expect(adapter.applyAction(humanLed, 'u1', { action: 'bot' })).toMatchObject({ ok: false })
    expect(adapter.serviceTick!(humanLed, T0 + CROBARD_DRAWING_MS)).toBeNull()
  })
})
