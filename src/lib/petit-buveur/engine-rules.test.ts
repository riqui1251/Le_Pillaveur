import { describe, it, expect, vi } from 'vitest'
import {
  autoAction,
  createInitialState,
  currentDeciderId,
  reduce,
  type EngineAction,
  type EnginePending,
  type EngineSettings,
  type EngineState,
  type InteractionChoice,
} from './engine'
import { BOARD_SIZE, CASES_INTERACTIVE, needsTarget, type EngineCase } from './types'
import { applyBotAction, deciderPlaysAuto, markPlayerLeft, rejoinPlayer, withPetitBuveurSay } from './server-adapter'

/** Contrat de règles commun local / en ligne, scénarios repris de l'audit. */

const SETTINGS: EngineSettings = { difficulty: 'normal', defiDrinks: [1, 2, 1, 3, 2, 1, 2] }
const IDS = ['a', 'b', 'c']

function base(positions: number[], seed: string | number = 'rules'): EngineState {
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
      needsTarget: needsTarget(c.type),
      case: c,
      ...extra,
    },
  }
}

function resolve(s: EngineState, playerId: string, choice?: InteractionChoice): EngineState {
  return reduce(s, { type: 'RESOLVE_INTERACTION', playerId, choice })
}

function player(s: EngineState, id: string) {
  return s.players.find((p) => p.id === id)!
}

function protect(s: EngineState, id: string): void {
  const p = player(s, id)
  p.protected = true
  p.protectionTurnsLeft = 3
}

/** ROLL de l'acteur ; le duel proposé sur une case occupée est passé (ces scénarios portent sur la case). */
function rollPastDuel(before: EngineState): EngineState {
  const id = before.players[before.currentPlayer].id
  const rolled = reduce(before, { type: 'ROLL', playerId: id })
  return rolled.pending?.stage === 'duel' ? resolve(rolled, id) : rolled
}

/** Première graine dont le ROLL vérifie `accept` (les scénarios dépendent du dé et de la case tirée). */
function rollUntil(
  make: (seed: number) => EngineState,
  accept: (after: EngineState, before: EngineState) => boolean,
  max = 60000
): { before: EngineState; after: EngineState } {
  for (let seed = 0; seed < max; seed += 1) {
    const before = make(seed)
    const after = rollPastDuel(before)
    if (accept(after, before)) return { before, after }
  }
  throw new Error('aucune graine ne produit ce scénario')
}

function errorOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (e) {
    return (e as Error).message
  }
}

describe('#0 Répétition, Rewind et Double case', () => {
  it('Répétition rejoue la dernière case effective sur la cible choisie', () => {
    const { after } = rollUntil(
      (seed) => ({ ...base([0, 5, 8], `rep-${seed}`), lastEffectiveCase: { type: 'gorgée', effect: 3 } }),
      (s) => s.lastCase?.type === 'repetition'
    )
    expect(after.pending?.caseType).toBe('gorgée')
    expect(after.pending?.via).toBe('repetition')
    expect(after.pending?.needsTarget).toBe(true)
    const done = resolve(after, 'a', { targetId: 'b' })
    expect(player(done, 'b').drinks).toBe(3)
    expect(done.lastOutcome?.caseType).toBe('repetition')
    expect(done.lastOutcome?.effectiveCase?.type).toBe('gorgée')
  })

  it('Rewind sans case effective auparavant : message « rien à rejouer », sans ciblage', () => {
    const { after } = rollUntil(
      (seed) => base([0, 5, 8], `rew-${seed}`),
      (s) => s.lastCase?.type === 'rewind'
    )
    expect(after.pending).toBeNull()
    expect(after.phase).toBe('playing')
    expect(after.lastOutcome?.notes).toEqual([{ kind: 'nothing-to-replay' }])
  })

  it('Répétition d’une case sans cible : rejouée d’office', () => {
    const { before, after } = rollUntil(
      (seed) => ({ ...base([0, 20, 25], `rep-bonus-${seed}`), lastEffectiveCase: { type: 'case-bonus', effect: 1 } }),
      (s) => s.lastCase?.type === 'repetition'
    )
    expect(after.pending).toBeNull()
    expect(player(after, 'a').position).toBe(player(before, 'a').position + after.lastDice! + 1)
    expect(after.lastOutcome?.effectiveCase?.type).toBe('case-bonus')
  })

  it('la case effective retenue ignore les méta-cases et la case Normale', () => {
    const drawn = rollUntil(
      (seed) => base([0, 5, 8], `eff-${seed}`),
      (s) => s.lastCase?.type === 'gorgée'
    ).after
    expect(drawn.lastEffectiveCase?.type).toBe('gorgée')
    const normal = rollUntil(
      (seed) => ({ ...base([0, 5, 8], `eff-n-${seed}`), lastEffectiveCase: { type: 'piege', effect: 0 } }),
      (s) => s.lastCase?.type === 'normal'
    ).after
    expect(normal.lastEffectiveCase?.type).toBe('piege')
  })

  it('Double case : deux cases simples appliquées l’une après l’autre à la même cible', () => {
    const { after } = rollUntil(
      (seed) => base([0, 5, 8], `dbl-${seed}`),
      (s) => s.lastCase?.type === 'double-case' && s.pending !== null
    )
    const cases = after.pending!.cases!
    expect(cases).toHaveLength(2)
    expect(after.pending!.needsTarget).toBe(true)
    expect(errorOf(() => resolve(after, 'a'))).toBe('INVALID_TARGET')
    const done = resolve(after, 'a', { targetId: 'b' })
    expect(done.lastOutcome?.caseType).toBe('double-case')
    expect(done.lastOutcome?.cases).toEqual(cases)
    expect(done.lastOutcome?.targetId).toBe('b')
    expect(done.pending).toBeNull()
  })

  it('Double case ne tire jamais de case modale, méta, Normale ni à arbitrage', () => {
    let seen = 0
    for (let seed = 0; seed < 40000 && seen < 40; seed += 1) {
      const before = base([0, 5, 8], `dbl-pool-${seed}`)
      const after = rollPastDuel(before)
      if (after.lastCase?.type !== 'double-case') continue
      seen += 1
      const cases = after.pending?.cases ?? after.lastOutcome?.cases
      expect(cases).toHaveLength(2)
      for (const c of cases!) {
        expect(CASES_INTERACTIVE.has(c.type)).toBe(false)
        expect(['repetition', 'rewind', 'double-case', 'normal', 'defi', 'question']).not.toContain(c.type)
      }
    }
    expect(seen).toBeGreaterThan(5)
  })
})

describe('#1 / #27 Pont', () => {
  it('égalité sur l’arrivée : l’acteur qui déclenche le pont gagne, pas le premier assis', () => {
    const { after } = rollUntil(
      (seed) => ({ ...base([28, 3, 22], `pont-tie-${seed}`), currentPlayer: 2 }),
      (s) => s.lastCase?.type === 'pont' && s.lastDice === 6 && s.players[2].position === BOARD_SIZE - 1
    )
    expect(player(after, 'a').position).toBe(BOARD_SIZE - 1)
    expect(after.phase).toBe('finished')
    expect(after.winner).toBe('c')
  })

  it('liste des joueurs du pont figée avant de déplacer (+1)', () => {
    const { after } = rollUntil(
      (seed) => base([4, 11, 10], `pont-up-${seed}`),
      (s) => s.lastCase?.type === 'pont' && s.lastDice === 6 && s.players[0].position === 11
    )
    expect(player(after, 'b').position).toBe(11)
    expect(player(after, 'c').position).toBe(11)
    expect(after.lastOutcome?.notes).toContainEqual({ kind: 'bridge', position: 10, delta: 1 })
  })

  it('pont −1 : un joueur protégé sur le pont ne recule pas, les autres oui', () => {
    const { after } = rollUntil(
      (seed) => {
        const s = base([4, 10, 10], `pont-down-${seed}`)
        protect(s, 'c')
        return s
      },
      (s) => s.lastCase?.type === 'pont' && s.lastDice === 6 && s.players[0].position === 9
    )
    expect(player(after, 'b').position).toBe(9)
    expect(player(after, 'c').position).toBe(10)
    expect(after.lastOutcome?.notes).toContainEqual({ kind: 'protected', playerId: 'c' })
  })
})

describe('#3 Pile ou face : la cible choisit un côté valide', () => {
  const pf: EngineCase = { type: 'pile-face', effect: 2 }

  it('l’acteur désigne la cible, puis c’est la cible qui choisit', () => {
    const staged = resolve(withPending(base([3, 4, 5]), pf), 'a', { targetId: 'b' })
    expect(staged.phase).toBe('awaiting-interaction')
    expect(staged.pending?.stage).toBe('side')
    expect(staged.pending?.targetId).toBe('b')
    expect(currentDeciderId(staged)).toBe('b')
    expect(errorOf(() => resolve(staged, 'a', { side: 'pile' }))).toBe('NOT_YOUR_INTERACTION')
    const done = resolve(staged, 'b', { side: 'face' })
    expect(done.lastInteraction).toMatchObject({ kind: 'pile-face', targetId: 'b', side: 'face' })
    expect(done.pending).toBeNull()
  })

  it('un côté hors pile/face est refusé (avant : la cible perdait 100 % du temps)', () => {
    const staged = resolve(withPending(base([3, 4, 5]), pf), 'a', { targetId: 'b' })
    expect(
      errorOf(() => resolve(staged, 'b', { side: 'tranche' as unknown as 'pile' }))
    ).toBe('INVALID_CHOICE')
  })

  it('vraie chance sur deux pour la cible', () => {
    let lost = 0
    for (let seed = 0; seed < 200; seed += 1) {
      const staged = resolve(withPending(base([3, 4, 5], `pf-${seed}`), pf), 'a', { targetId: 'b' })
      const done = resolve(staged, 'b', { side: 'pile' })
      if (player(done, 'b').drinks > 0) lost += 1
    }
    expect(lost).toBeGreaterThan(70)
    expect(lost).toBeLessThan(130)
  })

  it('cible bot : son côté est tiré au hasard par le moteur', () => {
    const s = withPending(base([3, 4, 5]), pf)
    s.players[1].isBot = true
    const staged = resolve(s, 'a', { targetId: 'b' })
    const auto = autoAction(staged)
    expect(auto.action).toMatchObject({ type: 'RESOLVE_INTERACTION', playerId: 'b' })
    const done = reduce(auto.state, auto.action)
    expect(['pile', 'face']).toContain(done.lastInteraction?.kind === 'pile-face' && done.lastInteraction.side)
  })
})

describe('#4 / #50 Protection : seuls les effets négatifs imposés par autrui sont bloqués', () => {
  it('Miroir sur une cible protégée : elle garde sa case, les autres sont miroités', () => {
    const s = withPending(base([20, 4, 10]), { type: 'miroir', effect: 0 })
    protect(s, 'b')
    const done = resolve(s, 'a', { targetId: 'b' })
    expect(player(done, 'b').position).toBe(4)
    expect(player(done, 'a').position).toBe(10)
    expect(player(done, 'c').position).toBe(20)
  })

  it('Mélange visant un autre joueur : le protégé garde sa case', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const s = withPending(base([3, 20, 10], `mel-${seed}`), { type: 'melange', effect: 0 })
      protect(s, 'b')
      const done = resolve(s, 'a', { targetId: 'c' })
      expect(player(done, 'b').position).toBe(20)
      expect(done.players.map((p) => p.position).sort((x, y) => x - y)).toEqual([3, 10, 20])
    }
  })

  it('Échange et Téléport visant un protégé : annulés avec message', () => {
    const ex = withPending(base([3, 20, 10]), { type: 'echange', effect: 0 })
    protect(ex, 'b')
    const swapped = resolve(ex, 'a', { targetId: 'b' })
    expect(player(swapped, 'a').position).toBe(3)
    expect(player(swapped, 'b').position).toBe(20)
    expect(swapped.lastOutcome?.notes).toContainEqual({ kind: 'protected', playerId: 'b' })

    const tp = withPending(base([3, 20, 10]), { type: 'teleport', effect: 0 })
    protect(tp, 'b')
    const tele = resolve(tp, 'a', { option: 'leader' })
    expect(player(tele, 'a').position).toBe(3)
    expect(player(tele, 'b').position).toBe(20)
  })

  it('Recul groupé : un protégé derrière l’acteur ne recule pas', () => {
    const { after } = rollUntil(
      (seed) => {
        const s = base([6, 2, 1], `rg-${seed}`)
        protect(s, 'b')
        return s
      },
      (s) => s.lastCase?.type === 'recul-groupe'
    )
    expect(player(after, 'b').position).toBe(2)
    expect(player(after, 'c').position).toBe(0)
  })

  it('effets positifs non bloqués : Copie et Avance s’appliquent à un protégé', () => {
    const copie = withPending({ ...base([10, 5, 0]), lastMoveDelta: 4, turnDiceTotal: 4 }, { type: 'copie', effect: 0 })
    protect(copie, 'b')
    expect(player(resolve(copie, 'a', { targetId: 'b' }), 'b').position).toBe(9)

    const avance = withPending(base([10, 5, 0]), { type: 'avance', effect: 1 })
    protect(avance, 'b')
    expect(player(resolve(avance, 'a', { targetId: 'b' }), 'b').position).toBe(6)
  })

  // Même règle que le jeu local (local-rules.ts) : un lien est un effet bloqué, même vers l'acteur.
  it('gorgée propagée par un lien jusqu’à un protégé, acteur compris : bloquée', () => {
    const chain = withPending(base([3, 4, 5]), { type: 'gorgée', effect: 2 })
    protect(chain, 'a')
    player(chain, 'a').linkedTo = 'b'
    player(chain, 'a').linkedTurns = 3
    const own = resolve(chain, 'a', { targetId: 'b' })
    expect(player(own, 'b').drinks).toBe(2)
    expect(player(own, 'a').drinks).toBe(0)

    const solo = withPending(base([3, 4, 5]), { type: 'gorgée', effect: 2 })
    protect(solo, 'a')
    expect(player(resolve(solo, 'a', { targetId: 'a' }), 'a').drinks).toBe(2)

    const other = withPending(base([3, 4, 5]), { type: 'gorgée', effect: 2 })
    protect(other, 'c')
    player(other, 'c').linkedTo = 'b'
    player(other, 'c').linkedTurns = 3
    const blocked = resolve(other, 'a', { targetId: 'b' })
    expect(player(blocked, 'b').drinks).toBe(2)
    expect(player(blocked, 'c').drinks).toBe(0)
  })
})

describe('#5 Chance : Relancer ou +2, sans cible', () => {
  const chance: EngineCase = { type: 'chance', effect: 0 }

  it('refuse une résolution sans option valide', () => {
    const s = withPending(base([10, 4, 5]), chance)
    expect(s.pending?.needsTarget).toBe(false)
    expect(errorOf(() => resolve(s, 'a'))).toBe('INVALID_CHOICE')
    expect(errorOf(() => resolve(s, 'a', { chanceChoice: 'x' as 'plus2' }))).toBe('INVALID_CHOICE')
  })

  it('« Relancer » : nouveau lancer complet (déplacement + nouvelle case)', () => {
    const s = withPending({ ...base([10, 4, 5]), lastDice: 3, lastMoveDelta: 3, turnDiceTotal: 3 }, chance)
    const done = resolve(s, 'a', { chanceChoice: 'reroll' })
    const step = done.outcomeHistory!.find((o) => o.caseType === 'chance')!
    expect(step.chanceChoice).toBe('reroll')
    expect(step.diceFrom).toBe(10)
    expect(step.diceLanding).toBe(10 + done.lastMoveDelta!)
    expect(done.turnDiceTotal).toBe(3 + done.lastMoveDelta!)
    expect(done.lastCase).not.toBe(chance)
  })

  it('Copie après une relance : la cible subit tout le déplacement au dé du tour', () => {
    const s = withPending(
      { ...base([10, 2, 0]), lastDice: 3, lastMoveDelta: 3, turnDiceTotal: 7 },
      { type: 'copie', effect: 0 }
    )
    expect(player(resolve(s, 'a', { targetId: 'b' }), 'b').position).toBe(9)
  })
})

describe('#17 Échange et Défi en chaîne : jamais l’acteur comme cible', () => {
  it('le moteur refuse l’auto-ciblage', () => {
    const ex = withPending(base([3, 20, 10]), { type: 'echange', effect: 0 })
    expect(errorOf(() => resolve(ex, 'a', { targetId: 'a' }))).toBe('INVALID_TARGET')
    const ch = withPending(base([3, 20, 10]), { type: 'defi-chaine', effect: 5 })
    expect(errorOf(() => resolve(ch, 'a', { targetId: 'a' }))).toBe('INVALID_TARGET')
  })

  it('un bot ne se choisit jamais', () => {
    for (const type of ['echange', 'defi-chaine'] as const) {
      for (let seed = 0; seed < 200; seed += 1) {
        const s = withPending(base([3, 20, 10], `self-${type}-${seed}`), { type, effect: 5 })
        expect(autoAction(s).action).not.toMatchObject({ choice: { targetId: 'a' } })
      }
    }
  })
})

describe('#19 Dé puis effet : case d’arrivée du dé exposée', () => {
  it('case résolue d’office : lastOutcome donne départ et arrivée du dé avant l’effet', () => {
    const { before, after } = rollUntil(
      (seed) => base([0, 20, 25], `grap-${seed}`),
      (s) => s.lastCase?.type === 'grappin'
    )
    expect(after.lastOutcome?.diceFrom).toBe(player(before, 'a').position)
    expect(after.lastOutcome?.diceLanding).toBe(after.lastDice)
    expect(player(after, 'a').position).toBe(20)
  })
})

describe('#25 Miroir inversé : actif jusqu’à la fin du prochain tour de l’acteur', () => {
  it('quand l’acteur boit au tour suivant, la cible boit aussi ; jamais l’inverse', () => {
    const created = resolve(withPending(base([3, 4, 5]), { type: 'miroir-inverse', effect: 1 }), 'a', {
      targetId: 'b',
    })
    expect(player(created, 'a').mirrorDrinkTargetId).toBe('b')
    expect(player(created, 'a').mirrorDrinkTurns).toBe(1)

    const bDrinks = resolve(withPending({ ...created, currentPlayer: 1 }, { type: 'gorgée', effect: 2 }), 'b', {
      targetId: 'b',
    })
    expect(player(bDrinks, 'a').drinks).toBe(0)

    const nextTurn = withPending({ ...created, currentPlayer: 0 }, { type: 'gorgée', effect: 2 })
    const aDrinks = resolve(nextTurn, 'a', { targetId: 'a' })
    expect(player(aDrinks, 'a').drinks).toBe(2)
    expect(player(aDrinks, 'b').drinks).toBe(2)
    expect(player(aDrinks, 'a').mirrorDrinkTurns).toBe(0)
    expect(player(aDrinks, 'a').mirrorDrinkTargetId).toBeUndefined()
  })
})

describe('#26 Défi / Question : le joueur au tour arbitre', () => {
  for (const type of ['defi', 'question'] as const) {
    it(`${type} : cible désignée, puis réussi = personne ne boit, raté = la cible boit`, () => {
      const s = withPending(base([3, 4, 5]), { type, effect: 2, defiIndex: 0 })
      const staged = resolve(s, 'a', { targetId: 'b' })
      expect(staged.pending?.stage).toBe('verdict')
      expect(player(staged, 'b').drinks).toBe(0)
      expect(errorOf(() => resolve(staged, 'b', { succeeded: true }))).toBe('NOT_YOUR_INTERACTION')
      expect(errorOf(() => resolve(staged, 'a', { succeeded: 'oui' as unknown as boolean }))).toBe(
        'INVALID_CHOICE'
      )
      const ok = resolve(staged, 'a', { succeeded: true })
      expect(player(ok, 'b').drinks).toBe(0)
      expect(ok.lastOutcome?.succeeded).toBe(true)
      const ko = resolve(staged, 'a', { succeeded: false })
      expect(player(ko, 'b').drinks).toBe(2)
      expect(ko.lastOutcome?.succeeded).toBe(false)
    })
  }

  it('cible protégée par un autre : bloqué d’office, sans arbitrage (comme en local)', () => {
    for (const type of ['defi', 'question'] as const) {
      const s = withPending(base([3, 4, 5]), { type, effect: 2, defiIndex: 0 })
      protect(s, 'b')
      const done = resolve(s, 'a', { targetId: 'b' })
      expect(done.pending).toBeNull()
      expect(done.phase).toBe('playing')
      expect(player(done, 'b').drinks).toBe(0)
      expect(done.lastOutcome).toMatchObject({ caseType: type, targetId: 'b', notes: [{ kind: 'protected', playerId: 'b' }] })
      expect(done.lastOutcome?.succeeded).toBeUndefined()
      // Sa propre protection ne le dispense pas de son propre défi.
      protect(s, 'a')
      expect(resolve(s, 'a', { targetId: 'a' }).pending?.stage).toBe('verdict')
    }
  })

  it('un bot arbitre tranche au hasard', () => {
    const verdicts = new Set<boolean | undefined>()
    for (let seed = 0; seed < 40; seed += 1) {
      const s = withPending(base([3, 4, 5], `arb-${seed}`), { type: 'defi', effect: 2, defiIndex: 0 })
      s.players[0].isBot = true
      const staged = resolve(s, 'a', { targetId: 'b' })
      const auto = autoAction(staged)
      verdicts.add((auto.action as Extract<EngineAction, { type: 'RESOLVE_INTERACTION' }>).choice?.succeeded)
    }
    expect(verdicts).toEqual(new Set([true, false]))
  })
})

describe('#31 Durées : défi en chaîne (5 tours d’initiateur) et malédiction', () => {
  it('le lien couvre 5 tours de l’initiateur après celui de sa création', () => {
    let s = resolve(withPending(base([3, 4, 5]), { type: 'defi-chaine', effect: 5 }), 'a', { targetId: 'b' })
    expect(player(s, 'a').linkedTo).toBe('b')
    expect(player(s, 'a').linkedTurns).toBe(5)
    for (let turn = 1; turn <= 5; turn += 1) {
      expect(player(s, 'a').linkedTo).toBe('b')
      s = resolve(withPending({ ...s, currentPlayer: 0 }, { type: 'avance', effect: 1 }), 'a', { targetId: 'c' })
    }
    expect(player(s, 'a').linkedTo).toBeUndefined()
  })

  it('un tour sauté par Passe-ton-tour coûte quand même la gorgée de malédiction', () => {
    const s = withPending(base([3, 4, 5]), { type: 'avance', effect: 1 })
    player(s, 'b').cursed = 3
    player(s, 'b').skipNextTurn = true
    const done = resolve(s, 'a', { targetId: 'c' })
    expect(done.currentPlayer).toBe(2)
    expect(player(done, 'b').drinks).toBe(1)
    expect(player(done, 'b').cursed).toBe(2)
  })
})

describe('#36 Case Normale : aucun ciblage', () => {
  it('résolue d’office avec le message « case normale »', () => {
    expect(needsTarget('normal')).toBe(false)
    const { after } = rollUntil(
      (seed) => base([0, 5, 8], `norm-${seed}`),
      (s) => s.lastCase?.type === 'normal'
    )
    expect(after.pending).toBeNull()
    expect(after.phase).toBe('playing')
    expect(after.lastOutcome?.notes).toEqual([{ kind: 'safe' }])
  })
})

describe('Duel sur case partagée, comme en local', () => {
  /** Duel en attente sur la case 4 (a et b), avant la case `c`. */
  const duelOn = (c: EngineCase, seed: string | number = 'duel', positions = [4, 4, 9]) =>
    withPending(base(positions, seed), c, { stage: 'duel', opponents: ['b'], needsTarget: false })
  const normal: EngineCase = { type: 'normal', effect: 0 }

  it('arrivé au dé sur une case occupée : duel proposé avant la case, contre les présents ; jamais au départ', () => {
    let offered = 0
    for (let seed = 0; seed < 300; seed += 1) {
      const s = base([3, 4, 4], `duel-any-${seed}`)
      player(s, 'c').leftAt = 1
      const rolled = reduce(s, { type: 'ROLL', playerId: 'a' })
      if (rolled.lastDice === 1) {
        offered += 1
        // c, parti, n'est pas un adversaire ; la case tirée attend la fin du duel.
        expect(rolled.pending).toMatchObject({ stage: 'duel', playerId: 'a', needsTarget: false, opponents: ['b'] })
        expect(rolled.pending?.case).toEqual(rolled.lastCase)
        expect(rolled.lastOutcome).toBeNull()
      } else {
        expect(rolled.pending?.stage).not.toBe('duel')
      }
    }
    expect(offered).toBeGreaterThan(10)
    const anchoredAtStart = base([0, 0, 9], 'duel-start')
    player(anchoredAtStart, 'a').anchored = true
    expect(reduce(anchoredAtStart, { type: 'ROLL', playerId: 'a' }).pending?.stage).not.toBe('duel')
  })

  it('passer le duel : la case tirée se joue, sans duel ni recul', () => {
    const done = resolve(duelOn({ type: 'solo', effect: 1 }), 'a')
    expect(done.lastInteraction).toBeNull()
    expect(done.lastOutcome).toMatchObject({ caseType: 'solo', actorId: 'a' })
    expect(done.lastOutcome?.duel).toBeUndefined()
    expect(player(done, 'a')).toMatchObject({ position: 4, drinks: 1 })
    expect(player(done, 'b').position).toBe(4)
  })

  it('duel : une chance sur deux, le perdant recule d’une case ; la case se joue ensuite', () => {
    const winners = new Set<boolean>()
    for (let seed = 0; seed < 40; seed += 1) {
      const done = resolve(duelOn(normal, `duel-${seed}`), 'a', { targetId: 'b' })
      const inter = done.lastInteraction
      if (inter?.kind !== 'duel') throw new Error('duel sans tirage')
      winners.add(inter.challengerWins)
      expect(player(done, 'a').position).toBe(inter.challengerWins ? 4 : 3)
      expect(player(done, 'b').position).toBe(inter.challengerWins ? 3 : 4)
      expect(done.lastOutcome).toMatchObject({
        caseType: 'normal',
        duel: { opponentId: 'b', challengerWins: inter.challengerWins, loserProtected: false },
      })
      expect(done.phase).toBe('playing')
      expect(done.currentPlayer).toBe(1)
    }
    expect(winners).toEqual(new Set([true, false]))
  })

  it('perdant protégé, challenger compris : il ne recule pas', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const s = duelOn(normal, `duel-prot-${seed}`)
      protect(s, 'a')
      protect(s, 'b')
      const done = resolve(s, 'a', { targetId: 'b' })
      expect(player(done, 'a').position).toBe(4)
      expect(player(done, 'b').position).toBe(4)
      expect(done.lastOutcome?.duel?.loserProtected).toBe(true)
    }
  })

  it('adversaire hors de la case, soi-même ou inconnu : refusé', () => {
    const s = duelOn(normal)
    for (const targetId of ['c', 'a', 'zzz']) {
      expect(errorOf(() => resolve(s, 'a', { targetId }))).toBe('INVALID_TARGET')
    }
    expect(errorOf(() => resolve(s, 'b', { targetId: 'a' }))).toBe('NOT_YOUR_INTERACTION')
  })

  it('le duel s’attache à l’effet de la case, même quand elle attend encore une cible', () => {
    const fought = resolve(duelOn({ type: 'gorgée', effect: 3 }, 'duel-then-target'), 'a', { targetId: 'b' })
    expect(fought.pending).toMatchObject({ caseType: 'gorgée', needsTarget: true })
    expect(fought.pending?.stage).toBeUndefined()
    expect(fought.lastInteraction?.kind).toBe('duel')
    const note = fought.duelNote
    expect(note?.opponentId).toBe('b')
    const done = resolve(fought, 'a', { targetId: 'c' })
    expect(done.lastOutcome).toMatchObject({ caseType: 'gorgée', targetId: 'c', duel: note })
    expect(done.duelNote).toBeNull()
    // Le duel ne se rattache qu'une fois : le tour suivant repart sans.
    const next = reduce(done, { type: 'ROLL', playerId: 'b' })
    expect(next.lastOutcome?.duel).toBeUndefined()
  })

  it('bot : relève le duel ou passe, au hasard du moteur', () => {
    const picks = new Set<string | undefined>()
    for (let seed = 0; seed < 40; seed += 1) {
      const s = duelOn(normal, `duel-bot-${seed}`)
      s.players[0].isBot = true
      const auto = autoAction(s)
      const choice = (auto.action as Extract<EngineAction, { type: 'RESOLVE_INTERACTION' }>).choice
      picks.add(choice?.targetId)
      expect(() => reduce(auto.state, auto.action)).not.toThrow()
    }
    expect(picks).toEqual(new Set(['b', undefined]))
  })
})

describe('#55 Cible inexistante refusée', () => {
  const gorgee: EngineCase = { type: 'gorgée', effect: 4 }

  it('un id qui n’a jamais existé, ou aucune cible, est refusé', () => {
    const s = withPending(base([3, 4, 5]), gorgee)
    expect(errorOf(() => resolve(s, 'a', { targetId: 'ZZZ' }))).toBe('INVALID_TARGET')
    expect(errorOf(() => resolve(s, 'a'))).toBe('INVALID_TARGET')
  })

  it('un joueur qui vient de partir : l’effet passe au suivant encore présent', () => {
    const s = withPending(base([3, 4, 5]), gorgee)
    player(s, 'b').leftAt = 1000
    const done = resolve(s, 'a', { targetId: 'b' })
    expect(player(done, 'b').drinks).toBe(0)
    expect(player(done, 'c').drinks).toBe(4)
  })
})

describe('#38 Départ du joueur qui doit agir : la main passe aussitôt', () => {
  it('au tour du partant, sans case en attente : le suivant joue', () => {
    const left = markPlayerLeft(base([3, 4, 5]), 'a', 1000)!
    expect(currentDeciderId(left)).toBe('b')
    expect(left.phase).toBe('playing')
  })

  // La décision peut finir la partie : seule la route d'action enregistre les résultats.
  it('case en attente du partant : laissée au tick de service, qui la tire au hasard, puis main au suivant', () => {
    const left = markPlayerLeft(withPending(base([3, 4, 5]), { type: 'gorgée', effect: 2 }), 'a', 1000)!
    expect(left.pending?.caseType).toBe('gorgée')
    expect(deciderPlaysAuto(left)).toBe(true)
    const played = applyBotAction(left, 2000)
    if (!played.ok) throw new Error(played.error)
    expect(played.state.pending).toBeNull()
    expect(played.state.lastOutcome?.caseType).toBe('gorgée')
    expect(currentDeciderId(played.state)).toBe('b')
  })

  it('départ pendant sa case Avance sur un joueur en 28 : la partie ne finit pas dans le départ', () => {
    const s = withPending(base([3, 28, 28]), { type: 'avance', effect: 1 })
    const left = markPlayerLeft(s, 'a', 1000)!
    expect(left.phase).toBe('awaiting-interaction')
    const played = applyBotAction(left, 2000)
    if (!played.ok) throw new Error(played.error)
    expect(played.state.phase).toBe('finished')
  })

  it('cible de pile ou face qui part : son côté est tiré au hasard par le tick de service', () => {
    const staged = resolve(withPending(base([3, 4, 5]), { type: 'pile-face', effect: 2 }), 'a', { targetId: 'b' })
    const left = markPlayerLeft(staged, 'b', 1000)!
    expect(left.pending?.stage).toBe('side')
    const played = applyBotAction(left, 2000)
    if (!played.ok) throw new Error(played.error)
    expect(played.state.pending).toBeNull()
    expect(played.state.lastInteraction?.kind).toBe('pile-face')
  })

  it('le tick de service ne joue pas pour un humain présent', () => {
    expect(applyBotAction(base([3, 4, 5]), 2000)).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
  })

  it('un joueur parti pendant le tour d’un autre est sauté tant qu’il n’est pas revenu', () => {
    const left = markPlayerLeft(base([3, 4, 5]), 'b', 1000)!
    const afterA = resolve(withPending(left, { type: 'avance', effect: 1 }), 'a', { targetId: 'c' })
    expect(currentDeciderId(afterA)).toBe('c')
    const back = rejoinPlayer(afterA, 'b')!
    const afterC = resolve(withPending({ ...back, currentPlayer: 0 }, { type: 'avance', effect: 1 }), 'a', {
      targetId: 'c',
    })
    expect(currentDeciderId(afterC)).toBe('b')
  })
})

describe('Recul depuis la case de départ', () => {
  it('aucun déplacement et message « ne peut pas reculer »', () => {
    const done = resolve(withPending(base([3, 0, 5]), { type: 'recul', effect: -1 }), 'a', { targetId: 'b' })
    expect(player(done, 'b').position).toBe(0)
    expect(done.lastOutcome?.notes).toEqual([{ kind: 'cannot-move-back', playerId: 'b' }])
  })
})

describe('Rétrocompatibilité : états d’avant (sans nouveaux champs)', () => {
  it('Double case en attente sans cases tirées : tirées à la résolution', () => {
    const legacy: EngineState = {
      ...base([3, 4, 5]),
      phase: 'awaiting-interaction',
      lastCase: { type: 'double-case', effect: 0 },
      pending: { caseType: 'double-case', playerId: 'a', needsTarget: false },
    }
    let s = resolve(legacy, 'a')
    if (s.phase === 'awaiting-interaction') {
      expect(s.pending?.cases).toHaveLength(2)
      s = resolve(s, 'a', { targetId: 'b' })
    }
    expect(s.lastOutcome?.caseType).toBe('double-case')
    expect(s.lastOutcome?.cases).toHaveLength(2)
  })

  it('Répétition en attente d’une cible, sans case effective connue : rien à rejouer', () => {
    const legacy: EngineState = {
      ...base([3, 4, 5]),
      phase: 'awaiting-interaction',
      lastCase: { type: 'repetition', effect: 0 },
      pending: { caseType: 'repetition', playerId: 'a', needsTarget: true },
    }
    const s = resolve(legacy, 'a', { targetId: 'b' })
    expect(s.phase).toBe('playing')
    expect(s.lastOutcome?.notes).toEqual([{ kind: 'nothing-to-replay' }])
  })

  it('sans `lastEffectiveCase`, la dernière case tirée (rejouable) est celle que Répétition rejoue', () => {
    const { after } = rollUntil(
      (seed) => {
        const s = base([0, 5, 8], `legacy-rep-${seed}`)
        delete s.lastEffectiveCase
        return { ...s, lastCase: { type: 'gorgée', effect: 3 } }
      },
      (s) => s.lastCase?.type === 'repetition'
    )
    expect(after.pending?.caseType).toBe('gorgée')
    expect(after.pending?.via).toBe('repetition')
  })
})

// ─── Propriétés sur des parties aléatoires ──────────────────────────────────

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Effet visible d'une résolution (gorgées, déplacement, note, spectacle, statut posé). */
function observable(before: EngineState, after: EngineState): string | null {
  const o = after.lastOutcome
  if (!o || o === before.lastOutcome) return null
  if (o.caseType === 'normal') return o.notes?.some((n) => n.kind === 'safe') ? null : 'normale sans message'
  if (o.changes.length > 0 || (o.notes?.length ?? 0) > 0 || o.succeeded !== undefined) return null
  if (o.caseChanges?.some((c) => c.length > 0)) return null
  if (after.lastInteraction) return null
  const types = o.cases?.map((c) => c.type) ?? [o.effectiveCase?.type ?? o.caseType]
  const target = o.targetId ? player(after, o.targetId) : undefined
  const actor = player(after, o.actorId)
  for (const type of types) {
    if (type === 'miroir' || type === 'melange') return null
    if (type === 'protection' && target?.protected) return null
    if (type === 'malediction' && (target?.cursed ?? 0) > 0) return null
    if (type === 'ancre' && target?.anchored) return null
    if (type === 'miroir-inverse' && actor.mirrorDrinkTargetId === o.targetId) return null
    if (type === 'defi-chaine' && actor.linkedTo === o.targetId) return null
    if (type === 'passe-tour') {
      if (target?.skipNextTurn) return null
      const n = after.players.length
      if (after.currentPlayer !== (before.currentPlayer + 1) % n) return null
    }
  }
  return `${types.join('+')} sans effet visible`
}

function randomChoice(state: EngineState, r: () => number): InteractionChoice {
  const p = state.pending!
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]
  if (p.stage === 'side') return { side: pick(['pile', 'face'] as const) }
  if (p.stage === 'verdict') return { succeeded: r() < 0.5 }
  if (p.stage === 'duel') return { targetId: pick([...(p.opponents ?? []), undefined]) }
  const actor = state.players[state.currentPlayer].id
  const noSelf = p.caseType === 'echange' || p.caseType === 'defi-chaine'
  const targets = state.players.filter((x) => !(noSelf && x.id === actor)).map((x) => x.id)
  return {
    targetId: pick(targets),
    option: pick(['leader', 'last']),
    chanceChoice: pick(['reroll', 'plus2'] as const),
  }
}

/** Dé de parole qui ne tombe jamais : des bots muets. */
const SILENT = () => 1

/**
 * Une partie aléatoire (graine `game`), départs et retours compris. Avec
 * `sayRand`, après chaque coup, la parole qu'il inspire à un bot est écrite
 * comme le fait l'adaptateur (withPetitBuveurSay) ; sans, le moteur seul
 * (bots muets). Rend l'état final, la signature de chaque coup et le nombre
 * de coups suivis d'une parole.
 */
function playRandomGame(
  game: number,
  violations: string[],
  sayRand?: () => number
): { final: EngineState; steps: string[]; spoken: number } {
  const talk = (before: EngineState, after: EngineState) =>
    sayRand ? withPetitBuveurSay(before, after, sayRand) : after
  const r = mulberry(game * 7919 + 1)
  const n = 2 + (game % 7)
  let s = createInitialState(
    Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    { difficulty: (['facile', 'normal', 'difficile', 'extreme'] as const)[game % 4], defiDrinks: SETTINGS.defiDrinks },
    `prop-${game}`
  )
  s.players.forEach((p, i) => {
    if (i % 2 === 1) p.isBot = true
  })
  const trace: string[] = []
  let spoken = 0
  let steps = 0
  while (s.phase !== 'finished' && steps < 3000) {
    // Départs et retours en cours de partie : la main ne reste jamais à un absent.
    const humans = s.players.filter((p) => !p.isBot)
    const roll = r()
    if (roll < 0.004) {
      const present = humans.filter((p) => !p.leftAt)
      if (present.length > 0 && s.players.filter((p) => !p.leftAt).length > 2) {
        s = markPlayerLeft(s, present[Math.floor(r() * present.length)].id, steps) ?? s
      }
    } else if (roll < 0.02) {
      const gone = humans.find((p) => p.leftAt)
      if (gone) s = rejoinPlayer(s, gone.id) ?? s
    }
    if (s.phase === 'finished') break
    const before = s
    const deciderId = currentDeciderId(s)!
    const decider = player(s, deciderId)
    // Un absent ne garde la main que pour une décision en attente, que le tick de service joue.
    if (decider.leftAt && !s.pending) violations.push(`partie ${game} : la main est à ${deciderId}, parti`)
    if (decider.leftAt) {
      const ticked = applyBotAction(s, steps, sayRand ?? SILENT)
      if (!ticked.ok) violations.push(`partie ${game} : tick refusé pour ${deciderId} (${ticked.error})`)
      else s = ticked.state
    } else if (decider.isBot || !s.pending) {
      const auto = autoAction(s)
      s = talk(before, reduce(auto.state, auto.action))
    } else {
      s = talk(before, resolve(s, deciderId, randomChoice(s, r)))
    }
    steps += 1
    if ((s.speech ?? []).length > 0 && s.speech !== before.speech) spoken += 1
    trace.push(`${s.version}:${s.rngState}:${s.currentPlayer}:${s.turnCount}:${s.phase}`)
    for (const p of s.players) {
      if (p.position < 0 || p.position > BOARD_SIZE - 1) violations.push(`partie ${game} : ${p.id}@${p.position}`)
    }
    const onLast = s.players.filter((p) => p.position === BOARD_SIZE - 1)
    if (s.phase === 'finished') {
      if (!s.winner || player(s, s.winner).position !== BOARD_SIZE - 1) violations.push(`partie ${game} : gagnant hors arrivée`)
    } else if (onLast.length > 0) {
      violations.push(`partie ${game} : ${onLast.map((p) => p.id)} sur l'arrivée sans victoire`)
    }
    if (s.phase !== 'finished') {
      const muted = observable(before, s)
      if (muted) violations.push(`partie ${game} : ${muted}`)
    }
  }
  if (s.phase !== 'finished') violations.push(`partie ${game} : pas finie en ${steps} coups`)
  return { final: s, steps: trace, spoken }
}

function withoutSpeech(s: EngineState): EngineState {
  const { speech: _speech, ...rest } = s
  void _speech
  return rest
}

describe('propriétés : 2 000 parties aléatoires, 2 à 8 joueurs, bots inclus', () => {
  it('positions bornées, un seul gagnant sur la dernière case, parties finies, aucune case muette', () => {
    const violations: string[] = []
    for (let game = 0; game < 2000; game += 1) {
      playRandomGame(game, violations)
      if (violations.length > 20) break
    }
    expect(violations).toEqual([])
  })

  it('les paroles ne pèsent pas sur le jeu : les mêmes 2 000 parties, coup pour coup, quand les bots parlent', () => {
    const violations: string[] = []
    let spoken = 0
    for (let game = 0; game < 2000; game += 1) {
      const silent = playRandomGame(game, violations)
      const talking = playRandomGame(game, violations, mulberry(game * 104729 + 7))
      expect(talking.steps, `partie ${game}`).toEqual(silent.steps)
      expect(withoutSpeech(talking.final), `partie ${game}`).toEqual(silent.final)
      expect(silent.spoken, `partie ${game}`).toBe(0)
      spoken += talking.spoken
    }
    expect(violations).toEqual([])
    // Des parties où l'on parle vraiment : sans paroles, le test ne prouverait rien.
    expect(spoken).toBeGreaterThan(2000)
  }, 120_000)

  it('le RNG du moteur seul décide pour les bots (rejouable, sans Math.random)', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random interdit')
    })
    try {
      const s = withPending(base([3, 20, 10], 'det'), { type: 'echange', effect: 0 })
      expect(autoAction(s)).toEqual(autoAction(s))
      expect(autoAction(s).state.rngState).not.toBe(s.rngState)
    } finally {
      spy.mockRestore()
    }
  })
})
