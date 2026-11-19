import { describe, expect, it } from 'vitest'
import {
  createTelephoneState,
  reduceTelephone,
  toTelephoneClientView,
  toTelephoneSpectatorView,
  TELEPHONE_COUNTDOWN_MS,
  TELEPHONE_DRAW_MS,
  TELEPHONE_WRITE_MS,
  type TelephoneState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const T0 = 1_000_000

/** Manche d'écriture (0) ouverte à T0. */
function writing(n: number): TelephoneState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
  const raw = createTelephoneState(players, 'seed-leave', T0 - TELEPHONE_COUNTDOWN_MS)
  return reduceTelephone(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

const write = (s: TelephoneState, playerId: string, now = T0 + 1_000) =>
  reduceTelephone(s, { type: 'WRITE', playerId, text: `phrase de ${playerId}`, now })
const submit = (s: TelephoneState, playerId: string, now: number) =>
  reduceTelephone(s, { type: 'SUBMIT', playerId, strokes: [], now })
const leave = (s: TelephoneState, playerId: string, at: number) =>
  reduceTelephone(s, { type: 'LEAVE', playerId, at })

/** Manche de dessin (1) ouverte à T0 + 10 s. */
function drawingRound(n: number): TelephoneState {
  let s = writing(n)
  for (let i = 0; i < n; i += 1) s = write(s, `p${i}`, T0 + 10_000)
  expect(s.round).toBe(1)
  return s
}

describe('Téléphone Dessiné — un joueur part après avoir rendu son maillon', () => {
  it('la manche attend encore le dernier présent', () => {
    let s = write(writing(4), 'p0')
    s = leave(s, 'p0', T0 + 2_000)
    s = write(s, 'p1')
    s = write(s, 'p2')

    // Le maillon du partant comptait deux fois : trois rendus pour trois
    // présents, alors que p3 écrivait encore.
    expect(s.round).toBe(0)
    expect(s.phase).toBe('contributing')

    s = write(s, 'p3', T0 + 30_000)
    expect(s.round).toBe(1)
    expect(s.chains.p3[0]).toEqual({ type: 'text', text: 'phrase de p3' })
    // Le maillon rendu avant le départ est gardé.
    expect(s.chains.p0[0]).toEqual({ type: 'text', text: 'phrase de p0' })
  })

  it('le compteur « x/y ont rendu » ne compte que les présents', () => {
    let s = write(writing(4), 'p0')
    s = leave(s, 'p0', T0 + 2_000)
    s = write(s, 'p1')

    for (const view of [toTelephoneClientView(s, 'p2'), toTelephoneSpectatorView(s)]) {
      expect(view.totalToSubmit).toBe(3)
      expect(view.submittedCount).toBe(1)
    }
  })

  it('revenu, son maillon déjà rendu compte de nouveau', () => {
    let s = write(writing(3), 'p0')
    s = leave(s, 'p0', T0 + 2_000)
    s = reduceTelephone(s, { type: 'REJOIN', playerId: 'p0' })
    s = write(s, 'p1')
    expect(s.round).toBe(0)

    s = write(s, 'p2')
    expect(s.round).toBe(1)
  })
})

describe('Téléphone Dessiné — le dernier joueur attendu part', () => {
  it('en manche d’écriture : la manche se résout aussitôt', () => {
    let s = writing(4)
    for (const id of ['p0', 'p1', 'p2']) s = write(s, id)
    expect(s.round).toBe(0)

    s = leave(s, 'p3', T0 + 5_000)

    // Sans cela : plus personne ne peut résoudre, la table attend l'échéance.
    expect(s.round).toBe(1)
    expect(s.phase).toBe('contributing')
    expect(s.phaseEndsAt).toBe(T0 + 5_000 + TELEPHONE_DRAW_MS)
    expect(s.chains.p3[0]).toEqual({ type: 'text', text: '' })
  })

  it('en manche de dessin : pas 80 s d’attente pour un maillon blanc de toute façon', () => {
    let s = drawingRound(4)
    for (const id of ['p0', 'p1', 'p2']) s = submit(s, id, T0 + 20_000)
    expect(s.round).toBe(1)

    s = leave(s, 'p3', T0 + 25_000)

    expect(s.round).toBe(2)
    expect(s.phaseEndsAt).toBe(T0 + 25_000 + TELEPHONE_WRITE_MS)
  })

  it('à la dernière manche : la révélation s’ouvre, jamais de fin de partie sur un départ', () => {
    let s = drawingRound(3)
    for (const id of ['p0', 'p1', 'p2']) s = submit(s, id, T0 + 20_000)
    expect(s.round).toBe(2)
    s = write(write(s, 'p0', T0 + 30_000), 'p1', T0 + 30_000)

    s = leave(s, 'p2', T0 + 31_000)

    expect(s.phase).toBe('reveal')
  })

  it('un départ ne résout rien tant qu’un présent n’a pas rendu', () => {
    let s = write(writing(4), 'p0')

    s = leave(s, 'p3', T0 + 5_000)

    expect(s.round).toBe(0)
    expect(s.phaseEndsAt).toBe(T0 + TELEPHONE_WRITE_MS)
  })

  it('dernier présent : son départ ne résout rien', () => {
    let s = writing(3)
    s = leave(s, 'p0', T0 + 1_000)
    s = leave(s, 'p1', T0 + 2_000)

    s = leave(s, 'p2', T0 + 3_000)

    expect(s.round).toBe(0)
    expect(s.phase).toBe('contributing')
  })
})
