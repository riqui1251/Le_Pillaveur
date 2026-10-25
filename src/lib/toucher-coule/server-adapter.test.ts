import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { phaseKey } from '@/lib/online/phase-clock'
import { buildTCState, parseTCState, serializeTCState } from './server-adapter'
import { TC_PLACEMENT_MS, type TCClientView, type TCState } from './engine'

const adapter = getGameAdapter('toucher-coule')!

const MEMBERS = [
  { userId: 'honest', displayName: 'Honnête' },
  { userId: 'evil', displayName: 'Tricheur' },
]
const TEAMS = { honest: 'A', evil: 'B' } as const
const T0 = 1_700_000_000_000

/** 1v1 entre deux humains, horloge figée sur T0 (échéance du placement). */
function twoHumans(): TCState {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  return buildTCState(MEMBERS, '1v1', TEAMS, 'seed-tc-adapter')
}

function apply(state: TCState, userId: string, body: Record<string, unknown>) {
  return adapter.applyAction(state, userId, body)
}

function okState(result: ReturnType<typeof apply>): TCState {
  if (!result.ok) throw new Error(`refusé : ${result.error}`)
  return result.state as TCState
}

const HONEST_FLEET = [
  [0, 1, 2, 3],
  [16, 17, 18],
  [32, 33],
]

afterEach(() => {
  vi.useRealTimers()
})

describe('adaptateur Toucher-Coulé — charges d’action', () => {
  it('refuse un placement sur des cases à virgule (400 invalid_action), la partie reste en placement', () => {
    const state = twoHumans()
    const result = apply(state, 'evil', {
      action: 'place',
      ships: [
        [0.5, 1.5, 2.5, 3.5],
        [8.5, 9.5, 10.5],
        [16.5, 17.5],
      ],
    })
    expect(result).toEqual({ ok: false, error: 'invalid_action', status: 400 })
  })

  it('refuse une flotte mal formée ou de mauvaise forme (400 invalid_action)', () => {
    const state = twoHumans()
    for (const ships of [[1, 2, 3], [['0', '1', '2', '3'], [16, 17, 18], [32, 33]], [[0, 9, 18, 27], [16, 17, 18], [32, 33]]]) {
      expect(apply(state, 'evil', { action: 'place', ships })).toEqual({
        ok: false,
        error: 'invalid_action',
        status: 400,
      })
    }
  })

  it('refuse un tir à virgule ou hors grille (400 invalid_action) sans passer le tour', () => {
    let state = twoHumans()
    state = okState(apply(state, 'honest', { action: 'place', ships: HONEST_FLEET }))
    state = okState(apply(state, 'evil', { action: 'place', ships: HONEST_FLEET }))
    expect(state.phase).toBe('battle')
    for (const cell of [40.25, 0.75, '3', -1, 64]) {
      expect(apply(state, 'honest', { action: 'fire', cell })).toEqual({
        ok: false,
        error: 'invalid_action',
        status: 400,
      })
    }
    const fired = okState(apply(state, 'honest', { action: 'fire', cell: 63 }))
    expect(fired.shotsAt.B[63]).toBe('miss')
  })
})

describe('adaptateur Toucher-Coulé — échéance du placement', () => {
  it('un joueur qui ne valide jamais ne bloque plus la table : tick de service puis placement au hasard', () => {
    let state = twoHumans()
    state = okState(apply(state, 'honest', { action: 'place', ships: HONEST_FLEET }))
    expect(adapter.currentActorId(state)).toBeNull()

    const tick = adapter.serviceTick!(state, T0 + 10 * 60 * 60 * 1000)
    expect(tick).toEqual({ body: { action: 'advance', phaseKey: phaseKey(state) }, dueAt: T0 + TC_PLACEMENT_MS })

    expect(apply(state, '__service__', tick!.body)).toMatchObject({ ok: false, status: 409 })

    vi.setSystemTime(T0 + TC_PLACEMENT_MS)
    const next = okState(apply(state, '__service__', tick!.body))
    expect(next.phase).toBe('battle')
    expect(next.players.find((p) => p.id === 'evil')?.placed).toBe(true)
    expect(adapter.currentActorId(next)).toBe('honest')
    expect(adapter.serviceTick!(next, T0 + TC_PLACEMENT_MS)).toBeNull()
    // Le second tick (client et serveur ensemble) est un conflit inoffensif.
    expect(apply(next, 'honest', tick!.body)).toMatchObject({ ok: false, status: 409 })
  })

  it('refuse un advance sans clé de phase (400 invalid_action)', () => {
    expect(apply(twoHumans(), 'honest', { action: 'advance' })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
  })

  it('un état stocké avant l’horloge reste lisible (placement sans échéance)', () => {
    const legacy = JSON.parse(serializeTCState(twoHumans())) as Record<string, unknown>
    delete legacy.phaseSeq
    delete legacy.phaseEndsAt
    const parsed = parseTCState(JSON.stringify(legacy))!
    expect(parsed.phaseSeq).toBe(0)
    expect(parsed.phaseEndsAt).toBeNull()
    expect(adapter.serviceTick!(parsed, T0)).toBeNull()
  })
})

describe('adaptateur Toucher-Coulé — vues', () => {
  it('ni la vue de l’attaquant, ni la réponse d’action, ni la TV ne disent quel navire une touche a atteint', () => {
    let state = twoHumans()
    state = okState(apply(state, 'honest', { action: 'place', ships: HONEST_FLEET }))
    state = okState(apply(state, 'evil', { action: 'place', ships: HONEST_FLEET }))
    // 32 : première case du navire de 2 cases de « evil » (index 2 dans l'ordre des tailles).
    state = okState(apply(state, 'honest', { action: 'fire', cell: 32 }))

    const response = adapter.actionResponse(state, 'honest')
    for (const json of [
      adapter.clientViewJson(state, 'honest'),
      adapter.spectatorViewJson(state),
      JSON.stringify(response.view),
      response.viewJson as string,
    ]) {
      const view = JSON.parse(json) as TCClientView
      expect(json).not.toContain('evil-ship-')
      expect(json).not.toContain('rngState')
      expect(view.ships.some((s) => s.ownerId === 'evil')).toBe(false)
      expect(view.shotsAt.B[32]).toBe('hit')
    }
  })
})
