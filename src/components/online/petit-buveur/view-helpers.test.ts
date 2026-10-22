import { describe, it, expect } from 'vitest'
import {
  autoAction,
  createInitialState,
  currentDeciderId,
  reduce,
  type EnginePending,
  type EngineSettings,
  type EngineState,
  type LastOutcome,
} from '@/lib/petit-buveur/engine'
import type { EngineCase } from '@/lib/petit-buveur/types'
import { toClientView } from '@/lib/petit-buveur/server-adapter'
import {
  caseDescription,
  choiceOf,
  deciderIdOf,
  defiTextAt,
  diceStageTargets,
  isNewGame,
  landingIndex,
  noteMessage,
  outcomeSignature,
  randomTargetPool,
  rankByShown,
  shownDrinks,
} from './view-helpers'

const SETTINGS: EngineSettings = { difficulty: 'normal', defiDrinks: [1, 2, 1, 3, 2, 1, 2] }
const IDS = ['a', 'b', 'c']

function base(positions: number[] = [0, 0, 0], seed: string | number = 'client'): EngineState {
  const s = createInitialState(
    IDS.map((id) => ({ id, name: id.toUpperCase() })),
    SETTINGS,
    seed
  )
  s.players.forEach((p, i) => {
    p.position = positions[i] ?? 0
  })
  return s
}

function withPending(s: EngineState, c: EngineCase, extra: Partial<EnginePending> = {}): EngineState {
  return {
    ...s,
    phase: 'awaiting-interaction',
    lastCase: c,
    pending: {
      caseType: c.type,
      playerId: s.players[s.currentPlayer].id,
      needsTarget: false,
      case: c,
      ...extra,
    },
  }
}

/** Joue une partie de bots (décisions au hasard du moteur) et rend chaque état diffusé. */
function playStates(seed: string | number, maxSteps = 400): EngineState[] {
  let s = base([0, 0, 0], seed)
  const states: EngineState[] = [s]
  for (let i = 0; i < maxSteps && s.phase !== 'finished'; i += 1) {
    const next = autoAction(s)
    s = reduce(next.state, next.action)
    states.push(s)
  }
  return states
}

describe('deciderIdOf (#3 : la cible choisit pile ou face)', () => {
  it('rend la cible pendant l’étape side, le joueur au tour sinon', () => {
    const s = withPending(base(), { type: 'pile-face', effect: 2 }, { stage: 'side', targetId: 'c' })
    expect(deciderIdOf(s)).toBe('c')
    expect(deciderIdOf({ ...s, pending: null, phase: 'playing' })).toBe('a')
    expect(deciderIdOf({ ...s, phase: 'finished' })).toBeNull()
  })

  it('coïncide avec currentDeciderId du moteur sur des parties entières', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const s of playStates(seed)) expect(deciderIdOf(s)).toBe(currentDeciderId(s))
    }
  })
})

describe('choiceOf (#5, #17, #26)', () => {
  const pend = (c: EngineCase, extra: Partial<EnginePending> = {}) =>
    withPending(base(), c, extra).pending as EnginePending

  it('Échange et Défi en chaîne : cible obligatoire, jamais soi', () => {
    expect(choiceOf(pend({ type: 'echange', effect: 0 }))).toEqual({ kind: 'target', allowSelf: false })
    expect(choiceOf(pend({ type: 'defi-chaine', effect: 5 }))).toEqual({ kind: 'target', allowSelf: false })
    // Rejouée par Répétition : la règle vient de la case rejouée.
    expect(choiceOf(pend({ type: 'echange', effect: 0 }, { via: 'repetition' }))).toEqual({
      kind: 'target',
      allowSelf: false,
    })
  })

  it('Vote et Pile ou face acceptent « Moi »', () => {
    expect(choiceOf(pend({ type: 'vote', effect: 3 }))).toEqual({ kind: 'target', allowSelf: true })
    expect(choiceOf(pend({ type: 'pile-face', effect: 2 }))).toEqual({ kind: 'target', allowSelf: true })
  })

  it('Chance : un choix Relancer / +2, sans fenêtre de cible', () => {
    expect(choiceOf(pend({ type: 'chance', effect: 0 })).kind).toBe('chance')
  })

  it('Défi : cible, puis verdict de l’arbitre ; pile ou face : étape side', () => {
    const defi = pend({ type: 'defi', effect: 2, defiIndex: 0 }, { needsTarget: true })
    expect(choiceOf(defi)).toEqual({ kind: 'target', allowSelf: true })
    expect(choiceOf({ ...defi, needsTarget: false, stage: 'verdict', targetId: 'b' }).kind).toBe('verdict')
    expect(choiceOf(pend({ type: 'pile-face', effect: 2 }, { stage: 'side', targetId: 'b' })).kind).toBe('side')
  })

  it('Téléport, roue, dé de la honte : leurs fenêtres propres', () => {
    expect(choiceOf(pend({ type: 'teleport', effect: 0 })).kind).toBe('teleport')
    expect(choiceOf(pend({ type: 'roue', effect: 0 })).kind).toBe('confirm')
    expect(choiceOf(pend({ type: 'de-honte', effect: 0 })).kind).toBe('confirm')
  })

  it('cible à l’aveugle (vue masquée) : une fenêtre de cible, « Moi » compris', () => {
    const masked = { caseType: 'normal', playerId: 'a', needsTarget: true, hidden: true } as const
    expect(choiceOf(masked)).toEqual({ kind: 'target', allowSelf: true })
  })

  it('chaque fenêtre envoie un choix que le moteur accepte, à toutes les étapes de parties réelles', () => {
    for (const seed of [11, 12, 13, 14]) {
      for (const s of playStates(seed)) {
        if (!s.pending) continue
        // La fenêtre se lit sur la vue que reçoit le téléphone (case cachée comprise).
        const c = choiceOf(toClientView(s).pending as EnginePending)
        const actorId = s.players[s.currentPlayer].id
        const deciderId = deciderIdOf(s) as string
        const choices =
          c.kind === 'target'
            ? randomTargetPool(s.players, actorId, c.allowSelf).map((targetId) => ({ targetId }))
            : c.kind === 'verdict'
              ? [{ succeeded: true }, { succeeded: false }]
              : c.kind === 'side'
                ? [{ side: 'pile' as const }, { side: 'face' as const }]
                : c.kind === 'chance'
                  ? [{ chanceChoice: 'reroll' as const }, { chanceChoice: 'plus2' as const }]
                  : c.kind === 'teleport'
                    ? [{ option: 'leader' }, { option: 'last' }]
                    : [{}]
        expect(choices.length).toBeGreaterThan(0)
        for (const choice of choices) {
          expect(() => reduce(s, { type: 'RESOLVE_INTERACTION', playerId: deciderId, choice })).not.toThrow()
        }
      }
    }
  })
})

describe('randomTargetPool (#17)', () => {
  it('exclut l’acteur quand la case l’interdit, et les joueurs partis', () => {
    const players = [{ id: 'a' }, { id: 'b', leftAt: 5 }, { id: 'c' }]
    expect(randomTargetPool(players, 'a', false)).toEqual(['c'])
    expect(randomTargetPool(players, 'a', true).sort()).toEqual(['a', 'c'])
  })

  it('le tirage d’Échange ne retombe jamais sur l’acteur (le moteur le refuserait)', () => {
    const s = withPending(base([3, 7, 1]), { type: 'echange', effect: 0 })
    for (const targetId of randomTargetPool(s.players, 'a', false)) {
      expect(targetId).not.toBe('a')
      const next = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'a', choice: { targetId } })
      expect(next.players.find((p) => p.id === 'a')?.position).not.toBe(3)
    }
    expect(() =>
      reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'a', choice: { targetId: 'a' } })
    ).toThrow()
  })
})

describe('landingIndex (#2 : la carte cite la case de l’acteur)', () => {
  it('donne la case du dé de l’acteur, pas la position du joueur suivant', () => {
    let mismatchesWithOldFormula = 0
    let checked = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const states = playStates(seed)
      for (let i = 1; i < states.length; i += 1) {
        const before = states[i - 1]
        const after = states[i]
        const o = after.lastOutcome
        if (!o || before.pending || after.pending || after.phase === 'finished') continue
        if (o === before.lastOutcome) continue
        const actorBefore = before.players.find((p) => p.id === o.actorId)
        if (!actorBefore || after.lastMoveDelta == null) continue
        const expected = Math.min(29, actorBefore.position + after.lastMoveDelta)
        expect(landingIndex(after.players, o)).toBe(expected)
        checked += 1
        // Ancienne formule : position du joueur au tour, qui a déjà changé.
        if (after.players[after.currentPlayer].position !== expected) mismatchesWithOldFormula += 1
      }
    }
    expect(checked).toBeGreaterThan(20)
    expect(mismatchesWithOldFormula).toBeGreaterThan(0)
  })

  it('après une case en attente, retient la case d’arrivée même si l’effet a déplacé l’acteur', () => {
    const s = withPending(base([4, 12, 0]), { type: 'echange', effect: 0 })
    const after = reduce(s, { type: 'RESOLVE_INTERACTION', playerId: 'a', choice: { targetId: 'b' } })
    expect(after.players.find((p) => p.id === 'a')?.position).toBe(12)
    expect(landingIndex(after.players, after.lastOutcome)).toBe(4)
  })
})

describe('diceStageTargets (#19 : dé puis effet)', () => {
  it('pose l’acteur sur la case du dé et les autres touchés sur leur case d’avant l’effet', () => {
    const outcome: LastOutcome = {
      caseType: 'grappin',
      actorId: 'c',
      changes: [{ playerId: 'c', drinks: 0, from: 15, to: 18 }],
      diceFrom: 12,
      diceLanding: 15,
    }
    const players = [
      { id: 'a', position: 18 },
      { id: 'b', position: 10 },
      { id: 'c', position: 18 },
    ]
    expect(diceStageTargets(players, outcome)).toEqual({ a: 18, b: 10, c: 15 })
  })

  it('sans dé dans la même action, aucune étape intermédiaire', () => {
    expect(diceStageTargets([{ id: 'a', position: 3 }], null)).toBeNull()
    expect(
      diceStageTargets([{ id: 'a', position: 3 }], { caseType: 'vote', actorId: 'a', changes: [] })
    ).toBeNull()
  })

  it('sur des parties réelles, l’étape du dé correspond au déplacement du dé seul', () => {
    for (const seed of [21, 22, 23]) {
      const states = playStates(seed)
      for (let i = 1; i < states.length; i += 1) {
        const o = states[i].lastOutcome
        if (!o || typeof o.diceLanding !== 'number' || o === states[i - 1].lastOutcome) continue
        const staged = diceStageTargets(states[i].players, o) as Record<string, number>
        const actorBefore = states[i - 1].players.find((p) => p.id === o.actorId)
        if (!o.rerolled && !states[i - 1].pending) {
          expect(staged[o.actorId]).toBe(Math.min(29, (actorBefore?.position ?? 0) + (states[i].lastMoveDelta ?? 0)))
        }
        for (const c of o.changes) {
          if (c.playerId !== o.actorId) expect(staged[c.playerId]).toBe(c.from)
        }
      }
    }
  })
})

describe('outcomeSignature', () => {
  it('ne change pas pendant une étape (verdict) ni au passage d’un tour sans effet', () => {
    const s = playStates(31).find((x) => x.lastOutcome && x.phase === 'playing') as EngineState
    const sig = outcomeSignature(s)
    expect(sig).not.toBe('')
    const passed: EngineState = { ...s, turnCount: s.turnCount + 1 }
    const staged: EngineState = {
      ...s,
      pending: { caseType: 'defi', playerId: 'a', needsTarget: false, stage: 'verdict', targetId: 'b' },
    }
    expect(outcomeSignature(passed)).toBe(sig)
    expect(outcomeSignature(staged)).toBe(sig)
  })

  it('distingue deux effets identiques joués à des tours différents', () => {
    const o: LastOutcome = { caseType: 'solo', actorId: 'a', changes: [{ playerId: 'a', drinks: 1, from: 3, to: 3 }] }
    const first = outcomeSignature({ lastOutcome: o, outcomeHistory: [{ ...o, turn: 2, dice: 1 }] })
    const second = outcomeSignature({ lastOutcome: o, outcomeHistory: [{ ...o, turn: 3, dice: 1 }] })
    expect(first).not.toBe(second)
    expect(outcomeSignature({ lastOutcome: null, outcomeHistory: [] })).toBe('')
  })
})

describe('isNewGame (#22 : Rejouer pose les pions)', () => {
  it('détecte la relance (version qui repart, fin → partie)', () => {
    expect(isNewGame({ version: 80, finished: true }, { version: 0, finished: false })).toBe(true)
    expect(isNewGame({ version: 3, finished: true }, { version: 5, finished: false })).toBe(true)
    expect(isNewGame({ version: 3, finished: false }, { version: 4, finished: false })).toBe(false)
    expect(isNewGame({ version: 4, finished: false }, { version: 5, finished: true })).toBe(false)
  })
})

describe('rankByShown / shownDrinks (#23)', () => {
  it('classe sur la position affichée, pas sur la position réelle', () => {
    const players = [
      { id: 'a', position: 20 },
      { id: 'b', position: 10 },
    ]
    const shown: Record<string, number> = { a: 5, b: 10 }
    expect(rankByShown(players, (id) => shown[id]).map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('retient les gorgées d’un effet pas encore montré', () => {
    const players = [
      { id: 'a', drinks: 5 },
      { id: 'b', drinks: 2 },
    ]
    const o: LastOutcome = { caseType: 'gorgée', actorId: 'a', changes: [{ playerId: 'b', drinks: 2, from: 1, to: 1 }] }
    expect(shownDrinks(players, o)).toEqual({ a: 5, b: 0 })
    expect(shownDrinks(players, null)).toEqual({ a: 5, b: 2 })
  })
})

describe('noteMessage', () => {
  const nameOf = (id: string) => id.toUpperCase()
  it('rend une clé et des valeurs pour chaque note du moteur', () => {
    expect(noteMessage({ kind: 'protected', playerId: 'b' }, nameOf, 'a')).toEqual({
      key: 'game.effects.protectedStatus',
      values: { player: 'B' },
    })
    expect(noteMessage({ kind: 'cannot-move-back', playerId: 'a' }, nameOf, 'a').key).toBe('game.outcomes.cannotRecul')
    expect(noteMessage({ kind: 'bridge', position: 6, delta: -1 }, nameOf, 'a')).toEqual({
      key: 'online.notes.bridgeBack',
      values: { case: 7 },
    })
    expect(noteMessage({ kind: 'nothing-to-replay' }, nameOf, 'a')).toEqual({
      key: 'online.notes.nothingToReplay',
      values: { player: 'A' },
    })
    expect(noteMessage({ kind: 'safe' }, nameOf, 'c').values).toEqual({ player: 'C' })
    expect(noteMessage({ kind: 'no-effect' }, nameOf, 'a').key).toBe('online.notes.noEffect')
    expect(noteMessage({ kind: 'spared', playerId: 'b' }, nameOf, 'a').key).toBe('game.outcomes.rouletteSafe')
  })
})

describe('caseDescription (consigne de la case, comme le jeu local)', () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
  const defis = (i: number | undefined) => (i === 2 ? 'Imite un chat' : null)

  it('défi : le texte résolu par son index, sinon rien', () => {
    expect(caseDescription({ type: 'defi', effect: 3, defiIndex: 2 }, t, defis)).toBe(
      'caseDescriptions.defi {"challenge":"Imite un chat","count":3}'
    )
    expect(caseDescription({ type: 'defi', effect: 3, defiIndex: 9 }, t, defis)).toBeNull()
  })

  it('gorgée cul sec : sa consigne à part ; les autres : leur clé et l’effet', () => {
    expect(caseDescription({ type: 'gorgée', effect: 12, gorgeeCulSec: true }, t, defis)).toBe(
      'caseDescriptions.gorgéeCulSec'
    )
    expect(caseDescription({ type: 'vote', effect: 4 }, t, defis)).toBe('caseDescriptions.vote {"count":4}')
  })
})

describe('defiTextAt (#33)', () => {
  const baseList = [{ text: 'zéro' }, { text: 'bois sans les mains' }, { text: 'deux' }]
  it('remplace un défi alcoolisé en Soft sans décaler les autres index', () => {
    expect(defiTextAt(baseList, [{ text: 'tiens un verre' }], [1], 1, true)).toBe('tiens un verre')
    expect(defiTextAt(baseList, [{ text: 'tiens un verre' }], [1], 2, true)).toBe('deux')
    expect(defiTextAt(baseList, [{ text: 'tiens un verre' }], [1], 1, false)).toBe('bois sans les mains')
    expect(defiTextAt(baseList, null, [1], 1, true)).toBe('bois sans les mains')
  })
})
