import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { buildTabouState } from './server-adapter'
import { reduceTabou, TABOU_MIN_WORD_MS, TABOU_ROUND_MS, type TabouState } from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const adapter = getGameAdapter('tabou')!
const members = ['a1', 'a2', 'b1', 'b2'].map((userId) => ({ userId, displayName: userId }))
const teams = { a1: 'A', a2: 'A', b1: 'B', b2: 'B' } as const

/** Manche en cours ; `T0` = instant d'arrivée du premier mot. */
let T0 = 0
function describing(): TabouState {
  const raw = buildTabouState(members, { ...teams }, 'fr', 0, 'tabou-seed')
  T0 = raw.phaseEndsAt!
  return reduceTabou(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

function roles(s: TabouState) {
  const describer = s.players.find((p) => p.id === s.describerId)!
  return {
    describer,
    mate: s.players.find((p) => p.team === describer.team && p.id !== describer.id)!,
    opponent: s.players.find((p) => p.team !== describer.team)!,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Tabou — TROUVÉ / TABOU par l’API', () => {
  it('20 « Trouvé » d’affilée ne rapportent rien : chaque mot doit rester à l’écran', () => {
    let state: unknown = describing()
    vi.useFakeTimers()
    vi.setSystemTime(T0 + 500)
    const { mate, describer } = roles(state as TabouState)
    const statuses: string[] = []
    for (let i = 0; i < 20; i += 1) {
      const result = adapter.applyAction(state, mate.id, { action: 'found' })
      statuses.push(result.ok ? 'ok' : `${result.status}:${result.error}`)
      if (result.ok) state = result.state
    }
    expect(statuses).toEqual(Array(20).fill('403:WORD_TOO_RECENT'))
    expect((state as TabouState).scores[describer.team]).toBe(0)
  })

  it('un clic par seconde en continu plafonne au rythme d’un mot toutes les deux secondes', () => {
    let state: unknown = describing()
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const { mate, describer } = roles(state as TabouState)
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(1_000)
      const result = adapter.applyAction(state, mate.id, { action: 'found' })
      if (result.ok) state = result.state
    }
    expect((state as TabouState).scores[describer.team]).toBe(20_000 / TABOU_MIN_WORD_MS)
  })

  it('un seul verdict par mot : le TABOU qui suit de près un TROUVÉ ne grille pas le mot suivant', () => {
    const s = describing()
    vi.useFakeTimers()
    vi.setSystemTime(T0 + TABOU_MIN_WORD_MS)
    const { mate, opponent, describer } = roles(s)
    const found = adapter.applyAction(s, mate.id, { action: 'found' })
    expect(found.ok).toBe(true)
    if (!found.ok) return
    vi.advanceTimersByTime(150)
    expect(adapter.applyAction(found.state, opponent.id, { action: 'taboo-called' })).toEqual({
      ok: false,
      error: 'WORD_TOO_RECENT',
      status: 403,
    })
    expect(adapter.applyAction(found.state, describer.id, { action: 'found' })).toMatchObject({
      ok: false,
      error: 'WORD_TOO_RECENT',
    })
  })

  it('le décrivant valide un mot resté assez longtemps', () => {
    const s = describing()
    vi.useFakeTimers()
    vi.setSystemTime(T0 + TABOU_MIN_WORD_MS)
    const { describer } = roles(s)
    const result = adapter.applyAction(s, describer.id, { action: 'found' })
    expect(result.ok && (result.state as TabouState).scores[describer.team]).toBe(1)
  })

  it('au bilan, personne n’est « au tour » (pas d’expulsion AFK) et le bot meneur continue quand même', () => {
    const s = describing()
    const ended = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + TABOU_ROUND_MS })
    expect(adapter.currentActorId(ended)).toBeNull()
    const botFirst: TabouState = {
      ...ended,
      players: ended.players.map((p, i) => (i === 0 ? { ...p, isBot: true } : p)),
    }
    expect(adapter.serviceTick!(botFirst, T0)?.body).toEqual({ action: 'bot' })
    const result = adapter.applyAction(botFirst, 'b1', { action: 'bot' })
    expect(result.ok && (result.state as TabouState).phase).toBe('describing')
    expect(adapter.applyAction(ended, 'b1', { action: 'bot' })).toMatchObject({ ok: false })
  })
})
