import { describe, expect, it } from 'vitest'
import {
  createTelephoneState,
  currentTelephoneActorId,
  telephoneActive,
  reduceTelephone,
  toTelephoneClientView,
  toTelephoneSpectatorView,
  TelephoneEngineError,
  TELEPHONE_COUNTDOWN_MS,
  TELEPHONE_WRITE_MS,
  TELEPHONE_DRAW_MS,
  type TelephoneState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const T0 = 1_000_000

function make(n = 3, seed: string | number = 'seed'): TelephoneState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
  const raw = createTelephoneState(players, seed, T0 - TELEPHONE_COUNTDOWN_MS)
  return reduceTelephone(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

describe('createTelephoneState', () => {
  it('borne 3-8 joueurs, countdown au lancement puis écriture chronométrée', () => {
    const two = [
      { id: 'p0', name: 'P0' },
      { id: 'p1', name: 'P1' },
    ]
    expect(() => createTelephoneState(two, 1, T0)).toThrow(TelephoneEngineError)
    const nine = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createTelephoneState(nine, 1, T0)).toThrow(TelephoneEngineError)
    const raw = createTelephoneState(
      Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
      1,
      T0
    )
    expect(raw.phase).toBe('countdown')
    expect(raw.totalRounds).toBe(3)
    const s = make(3)
    expect(s.phase).toBe('contributing')
    expect(s.round).toBe(0)
    expect(s.phaseEndsAt).toBe(T0 + TELEPHONE_WRITE_MS)
  })
})

describe('manche 0 (écriture initiale)', () => {
  it('WRITE assigne directement à SA PROPRE chaîne ; résout dès que tous ont soumis', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'Un chat bleu', now: T0 })
    expect(s.phase).toBe('contributing') // pas encore résolu
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'Une maison rouge', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'Un arbre vert', now: T0 })
    expect(s.round).toBe(1) // manche de dessin
    expect(s.phaseEndsAt).toBe(T0 + TELEPHONE_DRAW_MS)
    expect(s.submittedIds).toEqual([])
  })

  it('refuse une double soumission ou WRITE hors manche d’écriture', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'x', now: T0 })
    expect(() =>
      reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'y', now: T0 })
    ).toThrow('ALREADY_SUBMITTED')
  })

  it('DRAW_STROKE/SUBMIT refusés pendant une manche d’écriture', () => {
    const s = make(3)
    expect(() =>
      reduceTelephone(s, { type: 'DRAW_STROKE', playerId: 'p0', stroke: { points: [0, 0, 1, 1], color: '#000', width: 3 } })
    ).toThrow('NOT_DRAW_ROUND')
    expect(() => reduceTelephone(s, { type: 'SUBMIT', playerId: 'p0', now: T0 })).toThrow('NOT_DRAW_ROUND')
  })
})

describe('rotation des chaînes', () => {
  it('à la manche 1, le joueur j reçoit le maillon de la chaîne (j-1+N)%N', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'Zéro', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'Un', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'Deux', now: T0 })
    expect(s.round).toBe(1)
    // p0 reçoit la chaîne de p2 (dernier), p1 reçoit celle de p0, p2 reçoit celle de p1.
    expect(toTelephoneClientView(s, 'p0').received).toEqual({ type: 'text', text: 'Deux' })
    expect(toTelephoneClientView(s, 'p1').received).toEqual({ type: 'text', text: 'Zéro' })
    expect(toTelephoneClientView(s, 'p2').received).toEqual({ type: 'text', text: 'Un' })
  })
})

describe('manche de dessin (DRAW_STROKE / CLEAR / SUBMIT)', () => {
  function makeAtDrawRound() {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'a', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'b', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'c', now: T0 })
    return s
  }

  it('accumule les traits, CLEAR les efface, SUBMIT verrouille et résout', () => {
    let s = makeAtDrawRound()
    s = reduceTelephone(s, {
      type: 'DRAW_STROKE',
      playerId: 'p0',
      stroke: { points: [0, 0, 1, 1], color: '#000', width: 3 },
    })
    s = reduceTelephone(s, {
      type: 'DRAW_STROKE',
      playerId: 'p0',
      stroke: { points: [0, 0, 1, 1], color: '#000', width: 3 },
    })
    s = reduceTelephone(s, { type: 'CLEAR', playerId: 'p0' })
    s = reduceTelephone(s, {
      type: 'DRAW_STROKE',
      playerId: 'p0',
      stroke: { points: [0.2, 0.2, 0.5, 0.5], color: '#fff', width: 6 },
    })
    s = reduceTelephone(s, { type: 'SUBMIT', playerId: 'p0', now: T0 })
    expect(s.submittedIds).toEqual(['p0'])
    expect(() => reduceTelephone(s, { type: 'SUBMIT', playerId: 'p0', now: T0 })).toThrow('ALREADY_SUBMITTED')
    s = reduceTelephone(s, { type: 'SUBMIT', playerId: 'p1', now: T0 }) // vide accepté
    s = reduceTelephone(s, { type: 'SUBMIT', playerId: 'p2', now: T0 })
    expect(s.round).toBe(2) // manche d'écriture (devinette)
  })

  it('WRITE refusé pendant une manche de dessin', () => {
    const s = makeAtDrawRound()
    expect(() => reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'x', now: T0 })).toThrow(
      'NOT_WRITE_ROUND'
    )
  })
})

describe('ADVANCE : timeout de manche', () => {
  it('les non-soumissions deviennent des maillons blancs, sans bloquer la partie', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'seul à répondre', now: T0 })
    const advanced = reduceTelephone(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + TELEPHONE_WRITE_MS,
    })
    expect(advanced.round).toBe(1)
    // p1 reçoit la chaîne de p0 (non vide, il a soumis avant le timeout).
    expect(toTelephoneClientView(advanced, 'p1').received).toEqual({ type: 'text', text: 'seul à répondre' })
    // p2 reçoit la chaîne de p1 : p1 n'a rien écrit → maillon texte blanc.
    expect(toTelephoneClientView(advanced, 'p2').received).toEqual({ type: 'text', text: '' })
  })
})

describe('partie complète (N=3) jusqu’au reveal', () => {
  it('3 manches puis reveal avec 3 chaînes de 3 maillons, puis finished', () => {
    let s = make(3)
    // Manche 0 : écriture initiale.
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'Un chat', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'Une maison', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'Un arbre', now: T0 })
    expect(s.round).toBe(1)
    // Manche 1 : dessin (chacun dessine ce qu'il a reçu).
    for (const id of ['p0', 'p1', 'p2']) {
      s = reduceTelephone(s, { type: 'SUBMIT', playerId: id, now: T0 })
    }
    expect(s.round).toBe(2)
    // Manche 2 : devinette écrite (dernière manche, N=3).
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'devine 1', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'devine 2', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'devine 3', now: T0 })
    expect(s.phase).toBe('reveal')
    expect(s.revealOrder).toHaveLength(3)
    expect(new Set(s.revealOrder)).toEqual(new Set(['p0', 'p1', 'p2']))
    for (const id of ['p0', 'p1', 'p2']) {
      expect(s.chains[id]).toHaveLength(3)
    }

    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.revealIdx).toBe(1)
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.revealIdx).toBe(2)
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('finished')
    expect(s.phaseEndsAt).toBeNull()
  })

  it('refuse CONTINUE hors phase reveal ou pour un joueur inconnu', () => {
    const s = make(3)
    expect(() => reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })).toThrow('NOT_REVEAL')
  })

  it('seul le meneur (premier joueur actif) peut CONTINUE/PREVIOUS ; les autres sont rejetés', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'a', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'b', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'c', now: T0 })
    for (const id of ['p0', 'p1', 'p2']) s = reduceTelephone(s, { type: 'SUBMIT', playerId: id, now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'd', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'e', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'f', now: T0 })
    expect(s.phase).toBe('reveal')
    expect(currentTelephoneActorId(s)).toBe('p0')

    expect(() => reduceTelephone(s, { type: 'CONTINUE', playerId: 'p1', now: T0 })).toThrow('NOT_LEADER')
    expect(() => reduceTelephone(s, { type: 'PREVIOUS', playerId: 'p1' })).toThrow('NOT_LEADER')

    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.revealIdx).toBe(1)
    s = reduceTelephone(s, { type: 'PREVIOUS', playerId: 'p0' })
    expect(s.revealIdx).toBe(0)
    expect(() => reduceTelephone(s, { type: 'PREVIOUS', playerId: 'p0' })).toThrow('ALREADY_FIRST_CHAIN')
  })
})

describe('LEAVE / REJOIN / REPLACE_LEFT', () => {
  it('un joueur parti ne compte plus dans le total requis pour résoudre la manche', () => {
    let s = make(4)
    s = reduceTelephone(s, { type: 'LEAVE', playerId: 'p3', at: T0 })
    expect(telephoneActive(s)).toHaveLength(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'a', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'b', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'c', now: T0 })
    expect(s.round).toBe(1) // résolu sans attendre p3
  })

  it('REJOIN restaure un joueur parti ; REPLACE_LEFT le convertit en bot après le délai', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    s = reduceTelephone(s, { type: 'REJOIN', playerId: 'p0' })
    expect(s.players.find((p) => p.id === 'p0')?.leftAt).toBeNull()
    s = reduceTelephone(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    expect(() =>
      reduceTelephone(s, { type: 'REPLACE_LEFT', now: T0 + 1000, graceMs: 180_000 })
    ).toThrow('NOTHING_TO_REPLACE')
    const replaced = reduceTelephone(s, { type: 'REPLACE_LEFT', now: T0 + 200_000, graceMs: 180_000 })
    expect(replaced.players.find((p) => p.id === 'p0')?.isBot).toBe(true)
  })
})

describe('currentTelephoneActorId', () => {
  it('null pendant contributing (simultané), premier joueur actif en reveal', () => {
    const s = make(3)
    expect(currentTelephoneActorId(s)).toBeNull()
  })
})

describe('vues anti-triche', () => {
  it('chaque joueur ne voit que son maillon assigné, jamais les chaînes complètes avant reveal', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'Zéro', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'Un', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'Deux', now: T0 })
    const view = toTelephoneClientView(s, 'p0')
    expect(view).not.toHaveProperty('chains')
    expect(view).not.toHaveProperty('pendingSubmissions')
    expect(view).not.toHaveProperty('rngState')
    expect(view.revealChain).toBeNull()
  })

  it('le spectateur (TV) ne reçoit jamais de maillon personnel, mais voit la chaîne au reveal', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'Zéro', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'Un', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'Deux', now: T0 })
    const spectator = toTelephoneSpectatorView(s)
    expect(spectator.received).toBeNull()
    expect(spectator.haveISubmitted).toBe(false)
  })

  it('submittedCount progresse sans révéler QUI a soumis quoi', () => {
    let s = make(3)
    expect(toTelephoneClientView(s, 'p0').submittedCount).toBe(0)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'x', now: T0 })
    expect(toTelephoneClientView(s, 'p1').submittedCount).toBe(1)
    expect(toTelephoneClientView(s, 'p1').haveISubmitted).toBe(false)
    expect(toTelephoneClientView(s, 'p0').haveISubmitted).toBe(true)
  })
})
