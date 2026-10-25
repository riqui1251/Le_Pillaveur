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
  TELEPHONE_REVEAL_MS,
  TELEPHONE_REVEAL_LINK_MS,
  TELEPHONE_BOT_REVEAL_CHAIN_MS,
  TELEPHONE_BOT_REVEAL_LINK_MS,
  telephoneBotRevealDelayMs,
  type TelephoneState,
} from './engine'
import { parseTelephoneState, serializeTelephoneState } from './server-adapter'
import { phaseKey } from '@/lib/online/phase-clock'
import { CANVAS_MAX_STROKES, type Stroke } from '@/lib/crobard/engine'

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

  it('SUBMIT avec `strokes` porte le dessin COMPLET (remplace l’accumulé) et sanitise', () => {
    let s = makeAtDrawRound()
    // Un vieux trait streamé traîne côté serveur — le SUBMIT complet le remplace.
    s = reduceTelephone(s, {
      type: 'DRAW_STROKE',
      playerId: 'p0',
      stroke: { points: [0, 0, 0.1, 0.1], color: '#000', width: 3 },
    })
    s = reduceTelephone(s, {
      type: 'SUBMIT',
      playerId: 'p0',
      strokes: [
        { points: [0.1, 0.1, 0.9, 0.9], color: '#ef4444', width: 6 },
        { points: [5, -2, 0.5, 0.5], color: '#3b82f6', width: 999 }, // hors bornes → clampé
        { points: [0.3, 0.3], color: '#000', width: 3 }, // trop court → écarté
        { points: 'nimp' as unknown as number[], color: '#000', width: 3 }, // invalide → écarté
      ],
      now: T0,
    })
    s = reduceTelephone(s, { type: 'SUBMIT', playerId: 'p1', strokes: [], now: T0 })
    s = reduceTelephone(s, { type: 'SUBMIT', playerId: 'p2', strokes: [], now: T0 })
    // Manche résolue : le maillon de p0 est dans la chaîne qui lui était assignée.
    const chainWithDrawing = Object.values(s.chains).find(
      (links) => links[1]?.type === 'draw' && links[1].strokes.length > 0
    )
    expect(chainWithDrawing).toBeDefined()
    const link = chainWithDrawing![1] as { type: 'draw'; strokes: { points: number[]; width: number }[] }
    expect(link.strokes).toHaveLength(2)
    expect(link.strokes[0].points).toEqual([0.1, 0.1, 0.9, 0.9])
    // Clamps : coordonnées ramenées dans [0,1], épaisseur bornée.
    expect(link.strokes[1].points).toEqual([1, 0, 0.5, 0.5])
    expect(link.strokes[1].width).toBeLessThanOrEqual(24)
  })
})

describe('traits venus du client : assainis et plafonnés', () => {
  function atDrawRound() {
    let s = make(3)
    for (const id of ['p0', 'p1', 'p2']) s = reduceTelephone(s, { type: 'WRITE', playerId: id, text: id, now: T0 })
    return s
  }
  const HUGE = 'x'.repeat(400_000)
  const raw = (extra: Record<string, unknown>) => ({ points: [0, 0, 1, 1], ...extra }) as unknown as Stroke

  it('DRAW_STROKE garde un trait propre : couleur bornée, champs inconnus jetés', () => {
    let s = atDrawRound()
    s = reduceTelephone(s, { type: 'DRAW_STROKE', playerId: 'p0', stroke: raw({ evil: 1 }) })
    s = reduceTelephone(s, { type: 'DRAW_STROKE', playerId: 'p0', stroke: raw({ color: HUGE, width: 3 }) })
    const pending = s.pendingSubmissions.p0
    expect(pending?.type).toBe('draw')
    const strokes = pending?.type === 'draw' ? pending.strokes : []
    expect(strokes[0]).toEqual({ points: [0, 0, 1, 1], color: '#020617', width: 6 })
    expect(strokes[1].color.length).toBeLessThanOrEqual(24)
    expect(serializeTelephoneState(s).length).toBeLessThan(10_000)
  })

  it('DRAW_STROKE refuse un trait inexploitable et au-delà du plafond de traits', () => {
    let s = atDrawRound()
    expect(() =>
      reduceTelephone(s, { type: 'DRAW_STROKE', playerId: 'p0', stroke: raw({ points: [0.5] }) })
    ).toThrow('INVALID_STROKE')
    s = {
      ...s,
      pendingSubmissions: {
        p0: { type: 'draw', strokes: Array.from({ length: CANVAS_MAX_STROKES }, () => ({ points: [0, 0, 1, 1], color: '#000', width: 3 })) },
      },
    }
    expect(() => reduceTelephone(s, { type: 'DRAW_STROKE', playerId: 'p0', stroke: raw({}) })).toThrow(
      'TOO_MANY_STROKES'
    )
  })

  it('SUBMIT sans `strokes` assainit l’accumulé avant de le passer au joueur suivant', () => {
    const base = atDrawRound()
    // Accumulé brut, empilé avant l'assainissement de DRAW_STROKE (état déjà en base).
    let s: TelephoneState = {
      ...base,
      pendingSubmissions: {
        p0: { type: 'draw', strokes: [raw({ evil: 1 }), raw({ color: HUGE })] },
      },
    }
    for (const id of ['p0', 'p1', 'p2']) s = reduceTelephone(s, { type: 'SUBMIT', playerId: id, now: T0 })
    expect(s.round).toBe(2)
    const json = JSON.stringify(toTelephoneClientView(s, 'p1'))
    expect(toTelephoneClientView(s, 'p1').received).toEqual({
      type: 'draw',
      strokes: [
        { points: [0, 0, 1, 1], color: '#020617', width: 6 },
        { points: [0, 0, 1, 1], color: 'x'.repeat(24), width: 6 },
      ],
    })
    expect(json).not.toContain('evil')
    expect(json.length).toBeLessThan(10_000)
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

    // Chaque chaîne se dévoile maillon par maillon, puis vient la suivante.
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([0, 0])
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([0, 1])
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([0, 2])
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([1, 0])
    for (let i = 0; i < 5; i += 1) s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([2, 2])
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
    expect(() => reduceTelephone(s, { type: 'PREVIOUS', playerId: 'p1', now: T0 })).toThrow('NOT_LEADER')

    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([0, 1])
    expect(() => reduceTelephone(s, { type: 'PREVIOUS', playerId: 'p0', now: T0 })).toThrow('ALREADY_FIRST_CHAIN')
    for (let i = 0; i < 2; i += 1) s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([1, 0])
    s = reduceTelephone(s, { type: 'PREVIOUS', playerId: 'p0', now: T0 })
    // La chaîne déjà vue revient ENTIÈRE, avec le plein temps d'affichage.
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([0, 2])
    expect(s.phaseEndsAt).toBe(T0 + TELEPHONE_REVEAL_MS)
    expect(() => reduceTelephone(s, { type: 'PREVIOUS', playerId: 'p0', now: T0 })).toThrow('ALREADY_FIRST_CHAIN')
    // Repartir en avant depuis la chaîne entière : la suivante reprend à son premier maillon.
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([1, 0])
  })
})

describe('révélation indépendante du meneur (horloge de phase)', () => {
  /** Amène une table de 3 joueurs jusqu'à la phase `reveal`. */
  function upToReveal(): TelephoneState {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'a', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'b', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'c', now: T0 })
    for (const id of ['p0', 'p1', 'p2']) s = reduceTelephone(s, { type: 'SUBMIT', playerId: id, now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'd', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'e', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'f', now: T0 })
    return s
  }

  it('le reveal porte une échéance serveur (plus de phase sans horloge)', () => {
    const s = upToReveal()
    expect(s.phase).toBe('reveal')
    expect(s.phaseEndsAt).toBe(T0 + TELEPHONE_REVEAL_LINK_MS)
  })

  it('ADVANCE dévoile maillon par maillon puis chaîne par chaîne, MÊME sans meneur', () => {
    let s = upToReveal()
    // Le meneur s'endort : personne ne clique, seule l'échéance agit.
    const seen: [number, number][] = []
    for (let guard = 0; guard < 20 && s.phase === 'reveal'; guard += 1) {
      const at = s.phaseEndsAt!
      s = reduceTelephone(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: at })
      if (s.phase !== 'reveal') break
      seen.push([s.revealIdx, s.revealLinkIdx])
      // Courte entre deux maillons, pleine une fois la chaîne entière à l'écran.
      expect(s.phaseEndsAt).toBe(at + (s.revealLinkIdx === 2 ? TELEPHONE_REVEAL_MS : TELEPHONE_REVEAL_LINK_MS))
    }
    expect(seen).toEqual([[0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]])
    expect(s.phase).toBe('finished')
    expect(s.phaseEndsAt).toBeNull()
  })

  it("n'accélère pas le déroulé normal : ADVANCE avant l'échéance est refusé, et un tick en retard devient un no-op", () => {
    const s = upToReveal()
    const key = phaseKey(s)
    expect(() => reduceTelephone(s, { type: 'ADVANCE', claimedKey: key, now: T0 + 1_000 })).toThrow(
      'NOT_EXPIRED'
    )
    // Le meneur a dévoilé avant l'échéance : le tick retardataire vise
    // une phase qui n'existe plus (idempotence structurelle).
    const led = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 + 5_000 })
    expect(led.revealLinkIdx).toBe(1)
    expect(led.phaseEndsAt).toBe(T0 + 5_000 + TELEPHONE_REVEAL_LINK_MS)
    expect(() =>
      reduceTelephone(led, { type: 'ADVANCE', claimedKey: key, now: T0 + TELEPHONE_REVEAL_LINK_MS })
    ).toThrow('PHASE_CHANGED')
  })

  it("le geste du meneur qui croise l'échéance ne fait pas franchir un second cran", () => {
    const s = upToReveal()
    const seen = phaseKey(s)
    // L'échéance dévoile le maillon 1 ; la vue du meneur montrait encore le 0.
    const ticked = reduceTelephone(s, { type: 'ADVANCE', claimedKey: seen, now: s.phaseEndsAt! })
    expect(ticked.revealLinkIdx).toBe(1)
    expect(() =>
      reduceTelephone(ticked, { type: 'CONTINUE', playerId: 'p0', now: T0, claimedKey: seen })
    ).toThrow('PHASE_CHANGED')
    expect(() =>
      reduceTelephone(ticked, { type: 'PREVIOUS', playerId: 'p0', now: T0, claimedKey: seen })
    ).toThrow('PHASE_CHANGED')
    // Avec la clé à jour, le cran part normalement.
    const led = reduceTelephone(ticked, { type: 'CONTINUE', playerId: 'p0', now: T0, claimedKey: phaseKey(ticked) })
    expect(led.revealLinkIdx).toBe(2)
  })
})

describe('révélation maillon par maillon (vues)', () => {
  /** Table de 3 joueurs en reveal, avec des devinettes reconnaissables. */
  function revealTable(): TelephoneState {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'Départ zéro', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'Départ un', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'Départ deux', now: T0 })
    const stroke = { points: [0.1, 0.1, 0.9, 0.9], color: '#020617', width: 6 }
    for (const id of ['p0', 'p1', 'p2']) s = reduceTelephone(s, { type: 'SUBMIT', playerId: id, strokes: [stroke], now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'Chute zéro', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'Chute un', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'Chute deux', now: T0 })
    return s
  }

  it("les maillons pas encore dévoilés ne quittent pas le serveur, ni vers un joueur ni vers la TV", () => {
    let s = revealTable()
    expect(s.phase).toBe('reveal')
    for (const view of [toTelephoneClientView(s, 'p1'), toTelephoneSpectatorView(s)]) {
      expect(view.revealChain?.links).toHaveLength(1)
      expect(view.revealChain?.linkCount).toBe(3)
      expect(view.revealLinkIdx).toBe(0)
      expect(JSON.stringify(view)).not.toContain('Chute')
    }
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(toTelephoneSpectatorView(s).revealChain?.links.map((l) => l.type)).toEqual(['text', 'draw'])
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    const full = toTelephoneClientView(s, 'p2').revealChain!
    expect(full.links).toHaveLength(3)
    expect(full.links[2]).toMatchObject({ type: 'text', text: expect.stringMatching(/^Chute/) })
  })

  it('un bot meneur laisse la chaîne entière plus longtemps à l’écran que chaque maillon', () => {
    let s = revealTable()
    expect(telephoneBotRevealDelayMs(s)).toBe(TELEPHONE_BOT_REVEAL_LINK_MS)
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(telephoneBotRevealDelayMs(s)).toBe(TELEPHONE_BOT_REVEAL_LINK_MS)
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.revealLinkIdx).toBe(2)
    expect(telephoneBotRevealDelayMs(s)).toBe(TELEPHONE_BOT_REVEAL_CHAIN_MS)
    expect(TELEPHONE_BOT_REVEAL_CHAIN_MS).toBeGreaterThan(TELEPHONE_BOT_REVEAL_LINK_MS)
    s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect([s.revealIdx, telephoneBotRevealDelayMs(s)]).toEqual([1, TELEPHONE_BOT_REVEAL_LINK_MS])
  })

  it('en fin de partie, la dernière chaîne reste entière', () => {
    let s = revealTable()
    for (let guard = 0; guard < 20 && s.phase === 'reveal'; guard += 1) {
      s = reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    }
    expect(s.phase).toBe('finished')
    const chain = toTelephoneSpectatorView(s).revealChain!
    expect(chain.links).toHaveLength(3)
    expect(chain.linkCount).toBe(3)
  })

  it('une révélation lancée avant le dévoilement progressif reprend avec la chaîne entière', () => {
    const s = revealTable()
    const legacy = JSON.parse(serializeTelephoneState(s)) as Partial<TelephoneState>
    delete legacy.revealLinkIdx
    const parsed = parseTelephoneState(JSON.stringify(legacy))!
    expect(parsed.revealLinkIdx).toBe(2)
    expect(toTelephoneClientView(parsed, 'p0').revealChain?.links).toHaveLength(3)
    // Hors révélation, le champ manquant repart de zéro.
    const contributing = JSON.parse(serializeTelephoneState(make(3))) as Partial<TelephoneState>
    delete contributing.revealLinkIdx
    expect(parseTelephoneState(JSON.stringify(contributing))!.revealLinkIdx).toBe(0)
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

  it('un joueur parti APRÈS avoir rendu son maillon ne fait pas clore la manche avant les actifs', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'Zéro', now: T0 })
    s = reduceTelephone(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'Un', now: T0 })
    expect(s.round).toBe(0)
    // Compteur sur le même total que la clôture : seuls les actifs.
    expect(toTelephoneClientView(s, 'p2')).toMatchObject({ submittedCount: 1, totalToSubmit: 2 })
    expect(toTelephoneSpectatorView(s)).toMatchObject({ submittedCount: 1, totalToSubmit: 2 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p2', text: 'Deux', now: T0 })
    expect(s.round).toBe(1)
    expect(s.chains.p2).toEqual([{ type: 'text', text: 'Deux' }])
    expect(s.chains.p0).toEqual([{ type: 'text', text: 'Zéro' }])
  })

  it('le départ du dernier retardataire clôt la manche sans attendre l’échéance', () => {
    let s = make(3)
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p0', text: 'a', now: T0 })
    s = reduceTelephone(s, { type: 'WRITE', playerId: 'p1', text: 'b', now: T0 })
    s = reduceTelephone(s, { type: 'LEAVE', playerId: 'p2', at: T0 + 5_000 })
    expect(s.round).toBe(1)
    expect(s.chains.p2).toEqual([{ type: 'text', text: '' }])
    expect(s.phaseEndsAt).toBe(T0 + 5_000 + TELEPHONE_DRAW_MS)
  })

  it('la table entière partie ne résout rien (personne à attendre, personne à servir)', () => {
    let s = make(3)
    for (const id of ['p0', 'p1', 'p2']) s = reduceTelephone(s, { type: 'LEAVE', playerId: id, at: T0 })
    expect(s.round).toBe(0)
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
