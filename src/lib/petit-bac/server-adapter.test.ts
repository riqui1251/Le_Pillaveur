import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyPbcRoomAction, buildPbcState } from './server-adapter'
import { PBC_COUNTDOWN_MS, PBC_STOP_MIN_MS, type PbcState } from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

/**
 * L'adaptateur lit l'horloge (Date.now) : on la fige pour franchir le
 * countdown puis le plancher du STOP (PBC_STOP_MIN_MS) sans attendre.
 */
const T0 = 1_000_000
const WRITE_AT = T0 + PBC_COUNTDOWN_MS
const STOP_AT = WRITE_AT + PBC_STOP_MIN_MS

const MEMBERS = [
  { userId: 'p1', user: { displayName: 'Alice' } },
  { userId: 'p2', user: { displayName: 'Bruno' } },
]

function expectOk(result: ReturnType<typeof applyPbcRoomAction>): PbcState {
  if (!result.ok) throw new Error(`action refusée : ${result.error}`)
  return result.state
}

/**
 * Partie d'une manche construite par l'adaptateur, countdown consommé, avec
 * la lettre IMPOSÉE : le tirage est aléatoire et ces tests portent sur des
 * mots précis.
 */
function inWrite(letter: string): PbcState {
  vi.setSystemTime(T0)
  const raw = buildPbcState(MEMBERS, 'seed', 1)
  vi.setSystemTime(WRITE_AT)
  const write = expectOk(applyPbcRoomAction(raw, 'p1', { type: 'advance', phaseKey: phaseKey(raw) }))
  expect(write.phase).toBe('write')
  return { ...write, letters: [letter] }
}

/** p1 crie STOP avec ses réponses, p2 dépose les siennes → grille de comptage. */
function stopThenReveal(state: PbcState, stopAnswers: string[], otherAnswers: string[]): PbcState {
  vi.setSystemTime(STOP_AT)
  const flush = expectOk(applyPbcRoomAction(state, 'p1', { type: 'stop', answers: stopAnswers }))
  expect(flush.phase).toBe('flush')
  const reveal = expectOk(applyPbcRoomAction(flush, 'p2', { type: 'submit', answers: otherAnswers }))
  expect(reveal.phase).toBe('reveal')
  return reveal
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('petit-bac — réponses libres non censurées', () => {
  it('garde « Monique » telle quelle : le STOP passe et la case rapporte des points', () => {
    const answers = ['Monique', 'Mexique', 'Melon', 'Marteau', 'Médecin']
    const reveal = stopThenReveal(inWrite('M'), answers, ['', '', '', '', ''])
    expect(reveal.answers.p1).toEqual(answers)
    expect(reveal.stopperId).toBe('p1')
    expect(reveal.roundPoints?.p1[0]).toBeGreaterThan(0)
  })

  it('garde « Député » et « Drapeau » (accents compris) : plus de STOP bloqué', () => {
    const answers = ['Député', 'Danemark', 'Datte', 'Dauphin', 'Drapeau']
    const reveal = stopThenReveal(inWrite('D'), answers, ['', '', '', '', ''])
    expect(reveal.answers.p1).toEqual(answers)
    expect(reveal.roundPoints?.p1.every((pts) => pts > 0)).toBe(true)
  })

  it('laisse passer une grossièreté à la bonne lettre (ce n’est pas un filtre de vulgarité)', () => {
    const answers = ['Connard', 'Canada', 'Cerise', 'Castor', 'Cuisinier']
    const reveal = stopThenReveal(inWrite('C'), answers, ['', '', '', '', ''])
    expect(reveal.answers.p1[0]).toBe('Connard')
    expect(reveal.roundPoints?.p1[0]).toBeGreaterThan(0)
  })
})

describe('petit-bac — coordonnées masquées', () => {
  it('masque un numéro de téléphone et une adresse e-mail déposés en réponse', () => {
    const reveal = stopThenReveal(
      inWrite('M'),
      ['Monique', 'Mexique', 'Melon', 'Marteau', 'Médecin'],
      ['06 12 34 56 78', 'a@b.fr', 'Mon 0612345678', 'Marseille', '']
    )
    const [phone, email, mixed, plain, blank] = reveal.answers.p2
    expect(phone).toMatch(/^\*+$/)
    expect(email).toMatch(/^\*+$/)
    expect(mixed).toMatch(/^Mon \*+$/)
    expect(plain).toBe('Marseille')
    expect(blank).toBe('')
  })

  it('un STOP dont une case n’est qu’un numéro masqué reste incomplet', () => {
    const state = inWrite('M')
    vi.setSystemTime(STOP_AT)
    const result = applyPbcRoomAction(state, 'p1', {
      type: 'stop',
      answers: ['0612345678', 'Mexique', 'Melon', 'Marteau', 'Médecin'],
    })
    expect(result).toEqual({ ok: false, error: 'INCOMPLETE_STOP' })
  })
})

describe('petit-bac — garde-fous du STOP via l’adaptateur', () => {
  it('refuse un STOP avant le plancher de PBC_STOP_MIN_MS', () => {
    const state = inWrite('M')
    vi.setSystemTime(STOP_AT - 1)
    const result = applyPbcRoomAction(state, 'p1', {
      type: 'stop',
      answers: ['Monique', 'Mexique', 'Melon', 'Marteau', 'Médecin'],
    })
    expect(result).toEqual({ ok: false, error: 'STOP_TOO_EARLY' })
  })

  it('remplace par une case vide toute réponse qui n’est pas une chaîne', () => {
    const state = inWrite('M')
    vi.setSystemTime(STOP_AT)
    const flush = expectOk(
      applyPbcRoomAction(state, 'p1', {
        type: 'stop',
        answers: ['Monique', 'Mexique', 'Melon', 'Marteau', 'Médecin'],
      })
    )
    const reveal = expectOk(
      applyPbcRoomAction(flush, 'p2', {
        type: 'submit',
        answers: [42, null, 'Moto'] as unknown as string[],
      })
    )
    expect(reveal.answers.p2).toEqual(['', '', 'Moto', '', ''])
  })
})
