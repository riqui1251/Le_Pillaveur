import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  COUNTDOWN_MS,
  MAX_FINGERS,
  SELECTION_HOLD_MS,
  SELECTION_MIN_STEPS,
  SELECTION_MS,
  STABLE_MS,
  SURVIVAL_NEXT_MS,
  assignOrder,
  clockwiseOrder,
  countdownSecondsLeft,
  createDoigtState,
  eliminateOne,
  eliminatedAtVerdict,
  fingerAdmission,
  fingerRole,
  isDoigtMode,
  liftedToAnnounce,
  nextDoigtDeadline,
  pickVictim,
  reduceDoigt,
  seedDoigt,
  selectionSchedule,
  selectionSequence,
  selectionStepIndex,
  splitTeams,
  type DoigtEvent,
  type DoigtMode,
  type DoigtState,
} from './engine'

const FINGERS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10']
/** Horloge FIXE : toutes les échéances se calculent depuis T0. */
const T0 = 10_000

function play(state: DoigtState, events: DoigtEvent[]): DoigtState {
  return events.reduce(reduceDoigt, state)
}

function fresh(mode: DoigtMode = 'victim', seed: string | number = 'destin'): DoigtState {
  return createDoigtState({ mode, seed, now: 0 })
}

/** Doigts posés à T0, puis tick à la fin du décompte : le tirage est fait, l'animation commence. */
function drawn(mode: DoigtMode, ids: string[], seed: string | number = 'destin'): DoigtState {
  const placed = play(
    fresh(mode, seed),
    ids.map((id) => ({ type: 'down' as const, id, now: T0 }))
  )
  const counting = reduceDoigt(placed, { type: 'tick', now: T0 + STABLE_MS })
  return reduceDoigt(counting, { type: 'tick', now: T0 + STABLE_MS + COUNTDOWN_MS })
}

const DRAW_AT = T0 + STABLE_MS + COUNTDOWN_MS

describe('tirages', () => {
  it('la victime est l’un des doigts, et chacun peut tomber', () => {
    const rng = createRng('victimes')
    const seen = new Set<string>()
    for (let i = 0; i < 400; i += 1) {
      const victim = pickVictim(FINGERS.slice(0, 5), rng)
      expect(FINGERS.slice(0, 5)).toContain(victim)
      seen.add(victim)
    }
    expect(seen.size).toBe(5)
  })

  it('deux camps de tailles égales à un près, sans doigt oublié ni compté deux fois', () => {
    for (let count = 2; count <= MAX_FINGERS; count += 1) {
      const ids = FINGERS.slice(0, count)
      for (let seed = 0; seed < 30; seed += 1) {
        const { gold, blue } = splitTeams(ids, createRng(seed))
        expect(Math.abs(gold.length - blue.length)).toBeLessThanOrEqual(1)
        expect([...gold, ...blue].sort()).toEqual([...ids].sort())
        expect(gold.some((id) => blue.includes(id))).toBe(false)
      }
    }
  })

  it('à nombre impair, le doigt de trop va tantôt à l’or, tantôt au bleu', () => {
    const sizes = new Set<number>()
    for (let seed = 0; seed < 40; seed += 1) sizes.add(splitTeams(FINGERS.slice(0, 5), createRng(seed)).gold.length)
    expect([...sizes].sort()).toEqual([2, 3])
  })

  it('l’ordre est une permutation des doigts', () => {
    const ids = FINGERS.slice(0, 7)
    const order = assignOrder(ids, createRng('ordre'))
    expect(order).toHaveLength(ids.length)
    expect(new Set(order).size).toBe(ids.length)
    expect([...order].sort()).toEqual([...ids].sort())
  })

  it('élimination un par un jusqu’au dernier', () => {
    const rng = createRng('survie')
    let alive = FINGERS.slice(0, 6)
    const out: string[] = []
    while (alive.length > 1) {
      const { eliminated, remaining } = eliminateOne(alive, rng)
      expect(alive).toContain(eliminated)
      expect(remaining).toEqual(alive.filter((id) => id !== eliminated))
      out.push(eliminated)
      alive = remaining
    }
    expect(out).toHaveLength(5)
    expect(new Set([...out, ...alive]).size).toBe(6)
  })

  it('même graine → mêmes tirages', () => {
    const ids = FINGERS.slice(0, 6)
    const run = () => {
      const rng = createRng('soirée')
      return [pickVictim(ids, rng), splitTeams(ids, rng), assignOrder(ids, rng), eliminateOne(ids, rng)]
    }
    expect(run()).toEqual(run())
  })
})

describe('animation de sélection', () => {
  it('la séquence finit sur le doigt désigné et fait le tour dans l’ordre donné', () => {
    const ids = FINGERS.slice(0, 5)
    for (let seed = 0; seed < 50; seed += 1) {
      for (const winner of ids) {
        const sequence = selectionSequence(ids, winner, createRng(seed))
        expect(sequence[sequence.length - 1]).toBe(winner)
        expect(sequence.length).toBeGreaterThanOrEqual(SELECTION_MIN_STEPS)
        expect(sequence.length).toBeLessThan(SELECTION_MIN_STEPS + ids.length)
        for (let i = 1; i < sequence.length; i += 1) {
          expect(ids.indexOf(sequence[i])).toBe((ids.indexOf(sequence[i - 1]) + 1) % ids.length)
        }
      }
    }
  })

  it('séquence déterministe ; un seul doigt : rien à faire tourner ; doigt inconnu : erreur', () => {
    const ids = FINGERS.slice(0, 4)
    expect(selectionSequence(ids, 'f3', createRng('x'))).toEqual(selectionSequence(ids, 'f3', createRng('x')))
    expect(selectionSequence(['f1'], 'f1', createRng('x'))).toEqual(['f1'])
    expect(() => selectionSequence(ids, 'f9', createRng('x'))).toThrow()
  })

  it('les allumages ralentissent et s’arrêtent avant la fin de l’animation', () => {
    for (const steps of [2, 12, 21]) {
      const schedule = selectionSchedule(steps)
      expect(schedule).toHaveLength(steps)
      expect(schedule[0]).toBe(0)
      expect(schedule[steps - 1]).toBeCloseTo(SELECTION_MS - SELECTION_HOLD_MS, 6)
      for (let i = 2; i < steps; i += 1) {
        expect(schedule[i] - schedule[i - 1]).toBeGreaterThan(schedule[i - 1] - schedule[i - 2])
      }
    }
    expect(selectionSchedule(1)).toEqual([0])
    expect(selectionSchedule(0)).toEqual([])
  })

  it('pas allumé à un instant donné', () => {
    const schedule = [0, 100, 250, 450]
    expect(selectionStepIndex(schedule, 0)).toBe(0)
    expect(selectionStepIndex(schedule, 99)).toBe(0)
    expect(selectionStepIndex(schedule, 100)).toBe(1)
    expect(selectionStepIndex(schedule, 449)).toBe(2)
    expect(selectionStepIndex(schedule, 5_000)).toBe(3)
  })

  it('ordre des aiguilles d’une montre à l’écran (y vers le bas)', () => {
    const points = [
      { id: 'ouest', x: 0, y: 50 },
      { id: 'nord', x: 50, y: 0 },
      { id: 'sud', x: 50, y: 100 },
      { id: 'est', x: 100, y: 50 },
    ]
    expect(clockwiseOrder(points)).toEqual(['nord', 'est', 'sud', 'ouest'])
    expect(clockwiseOrder([])).toEqual([])
  })
})

describe('arène : doigts et décompte', () => {
  it('un seul doigt : jamais de décompte', () => {
    const state = reduceDoigt(fresh(), { type: 'down', id: 'f1', now: T0 })
    expect(nextDoigtDeadline(state, T0)).toBeNull()
    expect(reduceDoigt(state, { type: 'tick', now: T0 + 60_000 }).phase).toBe('gathering')
  })

  it('deux doigts immobiles 1,2 s : décompte de 3 s, chiffres 3, 2, 1', () => {
    const placed = play(fresh(), [
      { type: 'down', id: 'f1', now: T0 - 400 },
      { type: 'down', id: 'f2', now: T0 },
    ])
    expect(nextDoigtDeadline(placed, T0)).toBe(T0 + STABLE_MS)
    expect(reduceDoigt(placed, { type: 'tick', now: T0 + STABLE_MS - 1 })).toBe(placed)

    const counting = reduceDoigt(placed, { type: 'tick', now: T0 + STABLE_MS })
    expect(counting.phase).toBe('countdown')
    expect(counting.drawAt).toBe(DRAW_AT)
    expect(countdownSecondsLeft(counting, T0 + STABLE_MS)).toBe(3)
    expect(countdownSecondsLeft(counting, DRAW_AT - 2_000)).toBe(2)
    expect(countdownSecondsLeft(counting, DRAW_AT - 1)).toBe(1)
    expect(nextDoigtDeadline(counting, T0 + STABLE_MS)).toBe(T0 + STABLE_MS + 1_000)
    expect(nextDoigtDeadline(counting, DRAW_AT - 300)).toBe(DRAW_AT)
  })

  it('tout ajout ou retrait pendant le décompte le relance', () => {
    const counting = reduceDoigt(
      play(fresh(), [
        { type: 'down', id: 'f1', now: T0 },
        { type: 'down', id: 'f2', now: T0 },
      ]),
      { type: 'tick', now: T0 + STABLE_MS }
    )
    const added = reduceDoigt(counting, { type: 'down', id: 'f3', now: T0 + 2_000 })
    expect(added.phase).toBe('gathering')
    expect(added.drawAt).toBeNull()
    expect(added.changedAt).toBe(T0 + 2_000)
    const restarted = reduceDoigt(added, { type: 'tick', now: DRAW_AT })
    expect(restarted.phase).toBe('countdown')
    expect(restarted.drawAt).toBe(T0 + 2_000 + STABLE_MS + COUNTDOWN_MS)

    const removed = reduceDoigt(counting, { type: 'up', id: 'f2', now: T0 + 2_500 })
    expect(removed.phase).toBe('gathering')
    expect(removed.fingers.map((f) => f.id)).toEqual(['f1'])
    expect(removed.down).toEqual(['f1'])
  })

  it('10 doigts au plus : le onzième est ignoré', () => {
    const full = play(
      fresh(),
      FINGERS.map((id) => ({ type: 'down' as const, id, now: T0 }))
    )
    expect(full.fingers).toHaveLength(MAX_FINGERS)
    expect(fingerAdmission(full)).toBe('full')
    expect(reduceDoigt(full, { type: 'down', id: 'f11', now: T0 + 10 })).toBe(full)
  })

  it('couleurs : le plus petit indice libre, réutilisé quand un doigt part', () => {
    const state = play(fresh(), [
      { type: 'down', id: 'a', now: T0 },
      { type: 'down', id: 'b', now: T0 },
      { type: 'down', id: 'c', now: T0 },
      { type: 'up', id: 'b', now: T0 + 5 },
      { type: 'down', id: 'd', now: T0 + 10 },
    ])
    expect(state.fingers).toEqual([
      { id: 'a', color: 0 },
      { id: 'c', color: 2 },
      { id: 'd', color: 1 },
    ])
  })

  it('un doigt déjà suivi ou un départ inconnu ne change rien', () => {
    const state = reduceDoigt(fresh(), { type: 'down', id: 'f1', now: T0 })
    expect(reduceDoigt(state, { type: 'down', id: 'f1', now: T0 + 5 })).toBe(state)
    expect(reduceDoigt(state, { type: 'up', id: 'f9', now: T0 + 5 })).toBe(state)
  })
})

describe('arène : tirage et verdict', () => {
  it('victime : tirage parmi les doigts posés, animation de 1,5 s, puis verdict', () => {
    const selecting = drawn('victim', ['f1', 'f2', 'f3'])
    expect(selecting.phase).toBe('selecting')
    const round = selecting.round!
    expect([...round.participants].sort()).toEqual(['f1', 'f2', 'f3'])
    expect(round.startedAt).toBe(DRAW_AT)
    expect(round.revealAt).toBe(DRAW_AT + SELECTION_MS)
    expect(round.outcome.mode).toBe('victim')
    const victim = round.outcome.mode === 'victim' ? round.outcome.victim : ''
    expect(round.sequence[round.sequence.length - 1]).toBe(victim)
    expect(nextDoigtDeadline(selecting, DRAW_AT)).toBe(DRAW_AT + SELECTION_MS)

    expect(reduceDoigt(selecting, { type: 'tick', now: DRAW_AT + SELECTION_MS - 1 }).phase).toBe('selecting')
    const result = reduceDoigt(selecting, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(result.phase).toBe('result')
    expect(nextDoigtDeadline(result, DRAW_AT + SELECTION_MS)).toBeNull()
  })

  it('l’ordre d’allumage suit l’ordre fourni par le composant', () => {
    const placed = play(fresh('victim'), [
      { type: 'down', id: 'f1', now: T0 },
      { type: 'down', id: 'f2', now: T0 },
      { type: 'down', id: 'f3', now: T0 },
    ])
    const counting = reduceDoigt(placed, { type: 'tick', now: T0 + STABLE_MS })
    const selecting = reduceDoigt(counting, { type: 'tick', now: DRAW_AT, order: ['f3', 'f9', 'f1'] })
    expect(selecting.round!.participants).toEqual(['f3', 'f1', 'f2'])
  })

  it('mouvement réduit : verdict direct, sans animation', () => {
    const placed = play(fresh('victim'), [
      { type: 'down', id: 'f1', now: T0 },
      { type: 'down', id: 'f2', now: T0 },
    ])
    const counting = reduceDoigt(placed, { type: 'tick', now: T0 + STABLE_MS, animate: false })
    const result = reduceDoigt(counting, { type: 'tick', now: DRAW_AT, animate: false })
    expect(result.phase).toBe('result')
    expect(result.round!.sequence).toHaveLength(1)
    expect(result.round!.revealAt).toBe(DRAW_AT)
  })

  it('onglet gelé : un tick tardif enchaîne attente et décompte, l’animation part à son retour', () => {
    const placed = play(fresh('order'), [
      { type: 'down', id: 'f1', now: T0 },
      { type: 'down', id: 'f2', now: T0 },
    ])
    const late = reduceDoigt(placed, { type: 'tick', now: T0 + 60_000 })
    expect(late.phase).toBe('selecting')
    expect(late.round!.startedAt).toBe(T0 + 60_000)
    expect(reduceDoigt(late, { type: 'tick', now: T0 + 60_000 + SELECTION_MS }).phase).toBe('result')
  })

  it('doigt levé pendant l’animation : signalé, son cercle reste, le tirage ne change pas', () => {
    const selecting = drawn('victim', ['f1', 'f2', 'f3'])
    const lifted = reduceDoigt(selecting, { type: 'up', id: 'f2', now: DRAW_AT + 500 })
    expect(lifted.lifted).toEqual(['f2'])
    expect(lifted.down).not.toContain('f2')
    expect(lifted.fingers.map((f) => f.id)).toContain('f2')
    expect(lifted.round).toBe(selecting.round)
    const result = reduceDoigt(lifted, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(result.lifted).toEqual(['f2'])
  })

  it('après le verdict, lever un doigt est sans pénalité', () => {
    const result = reduceDoigt(drawn('victim', ['f1', 'f2']), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const after = reduceDoigt(result, { type: 'up', id: 'f1', now: DRAW_AT + SELECTION_MS + 100 })
    expect(after.lifted).toEqual([])
    expect(after.fingers).toHaveLength(2)
  })

  it('pas de nouveau doigt pendant l’animation, ni au verdict tant qu’un doigt reste posé', () => {
    const selecting = drawn('victim', ['f1', 'f2'])
    expect(fingerAdmission(selecting)).toBe('closed')
    expect(reduceDoigt(selecting, { type: 'down', id: 'f3', now: DRAW_AT + 10 })).toBe(selecting)

    const result = reduceDoigt(selecting, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const oneUp = reduceDoigt(result, { type: 'up', id: 'f1', now: DRAW_AT + 2_000 })
    expect(reduceDoigt(oneUp, { type: 'down', id: 'f3', now: DRAW_AT + 2_100 })).toBe(oneUp)
  })

  it('tous les doigts levés : un nouveau doigt lance une nouvelle partie', () => {
    const result = reduceDoigt(drawn('victim', ['f1', 'f2']), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const empty = play(result, [
      { type: 'up', id: 'f1', now: DRAW_AT + 2_000 },
      { type: 'up', id: 'f2', now: DRAW_AT + 2_000 },
    ])
    expect(fingerAdmission(empty)).toBe('open')
    const next = reduceDoigt(empty, { type: 'down', id: 'f3', now: DRAW_AT + 3_000 })
    expect(next.phase).toBe('gathering')
    expect(next.fingers).toEqual([{ id: 'f3', color: 0 }])
    expect(next.down).toEqual(['f3'])
    expect(next.round).toBeNull()
    expect(next.changedAt).toBe(DRAW_AT + 3_000)
  })

  it('« Rejouer » garde les doigts encore posés et relance l’attente', () => {
    const result = reduceDoigt(drawn('victim', ['f1', 'f2', 'f3']), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const oneUp = reduceDoigt(result, { type: 'up', id: 'f3', now: DRAW_AT + 2_000 })
    const again = reduceDoigt(oneUp, { type: 'replay', now: DRAW_AT + 2_500 })
    expect(again.phase).toBe('gathering')
    expect(again.fingers.map((f) => f.id)).toEqual(['f1', 'f2'])
    expect(again.round).toBeNull()
    expect(nextDoigtDeadline(again, DRAW_AT + 2_500)).toBe(DRAW_AT + 2_500 + STABLE_MS)
    expect(reduceDoigt(drawn('victim', ['f1', 'f2']), { type: 'replay', now: DRAW_AT })).toEqual(
      drawn('victim', ['f1', 'f2'])
    )
  })

  it('deux camps : équilibrés, tous les doigts tirés', () => {
    const state = drawn('teams', FINGERS.slice(0, 7))
    const outcome = state.round!.outcome
    expect(outcome.mode).toBe('teams')
    if (outcome.mode !== 'teams') return
    expect(Math.abs(outcome.gold.length - outcome.blue.length)).toBe(1)
    expect([...outcome.gold, ...outcome.blue].sort()).toEqual(FINGERS.slice(0, 7).sort())
  })

  it('ordre : une permutation, l’animation finit sur le premier', () => {
    const state = drawn('order', FINGERS.slice(0, 4))
    const outcome = state.round!.outcome
    expect(outcome.mode).toBe('order')
    if (outcome.mode !== 'order') return
    expect([...outcome.order].sort()).toEqual(FINGERS.slice(0, 4).sort())
    expect(state.round!.sequence[state.round!.sequence.length - 1]).toBe(outcome.order[0])
  })

  it('même graine et mêmes gestes → même partie', () => {
    expect(drawn('teams', FINGERS.slice(0, 6), 42)).toEqual(drawn('teams', FINGERS.slice(0, 6), 42))
    expect(drawn('victim', FINGERS.slice(0, 6), 1).rngState).not.toBe(fresh('victim', 1).rngState)
  })

  it('graine posée après coup : les doigts déjà posés restent, seul le hasard change', () => {
    const placed = play(fresh('victim', 0), [
      { type: 'down', id: 'f1', now: T0 },
      { type: 'down', id: 'f2', now: T0 },
    ])
    const seeded = seedDoigt(placed, 'tirée au montage')
    expect({ ...seeded, rngState: placed.rngState }).toEqual(placed)
    expect(seeded.rngState).toBe(fresh('victim', 'tirée au montage').rngState)
  })
})

describe('arène : changement de mode', () => {
  it('pendant l’attente : le décompte repart de zéro', () => {
    const counting = reduceDoigt(
      play(fresh('victim'), [
        { type: 'down', id: 'f1', now: T0 },
        { type: 'down', id: 'f2', now: T0 },
      ]),
      { type: 'tick', now: T0 + STABLE_MS }
    )
    const changed = reduceDoigt(counting, { type: 'mode', mode: 'order', now: T0 + 2_000 })
    expect(changed.mode).toBe('order')
    expect(changed.phase).toBe('gathering')
    expect(changed.changedAt).toBe(T0 + 2_000)
    expect(reduceDoigt(changed, { type: 'mode', mode: 'order', now: T0 + 3_000 })).toBe(changed)
  })

  it('pendant l’animation : refusé ; au verdict : nouvelle partie dans le nouveau mode', () => {
    const selecting = drawn('victim', ['f1', 'f2'])
    expect(reduceDoigt(selecting, { type: 'mode', mode: 'teams', now: DRAW_AT + 10 })).toBe(selecting)
    const result = reduceDoigt(selecting, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const changed = reduceDoigt(result, { type: 'mode', mode: 'teams', now: DRAW_AT + 2_000 })
    expect(changed.mode).toBe('teams')
    expect(changed.phase).toBe('gathering')
    expect(changed.round).toBeNull()
    expect(changed.fingers.map((f) => f.id)).toEqual(['f1', 'f2'])
  })
})

describe('arène : survie', () => {
  /** Rejoue une survie complète : chaque éliminé se lève dès son verdict. */
  function runSurvival(ids: string[], seed: string | number) {
    let state = drawn('survival', ids, seed)
    let now = DRAW_AT
    const eliminated: string[] = []
    for (let guard = 0; guard < 50 && state.phase !== 'result'; guard += 1) {
      if (state.phase === 'selecting') {
        now = state.round!.revealAt
        state = reduceDoigt(state, { type: 'tick', now })
        const outcome = state.round!.outcome
        if (outcome.mode === 'survival') eliminated.push(outcome.eliminated)
      } else if (state.phase === 'between') {
        const awaiting = state.survival!.awaiting
        expect(awaiting).not.toBeNull()
        expect(nextDoigtDeadline(state, now)).toBeNull()
        now += 700
        state = reduceDoigt(state, { type: 'up', id: awaiting!, now })
        expect(state.survival!.nextDrawAt).toBe(now + SURVIVAL_NEXT_MS)
        expect(reduceDoigt(state, { type: 'tick', now: now + SURVIVAL_NEXT_MS - 1 }).phase).toBe('between')
        now += SURVIVAL_NEXT_MS
        state = reduceDoigt(state, { type: 'tick', now })
      }
    }
    return { state, eliminated }
  }

  it('un doigt éliminé par tirage, jusqu’au dernier', () => {
    const ids = FINGERS.slice(0, 5)
    const { state, eliminated } = runSurvival(ids, 'survie')
    expect(state.phase).toBe('result')
    expect(eliminated).toHaveLength(4)
    expect(new Set(eliminated).size).toBe(4)
    const winner = state.survival!.winner
    expect(winner).not.toBeNull()
    expect([...eliminated, winner].sort()).toEqual([...ids].sort())
    expect(state.survival!.eliminated).toEqual(eliminated)
    expect(state.survival!.finishedByDraw).toBe(true)
    expect(eliminatedAtVerdict(state)).toBe(eliminated[eliminated.length - 1])
    expect(state.lifted).toEqual([])
  })

  it('dernier tirage sans survivant (l’autre doigt levé pendant l’animation) : son éliminé reste à annoncer', () => {
    let state = drawn('survival', ['f1', 'f2'], 1)
    const out = state.round!.outcome.mode === 'survival' ? state.round!.outcome.eliminated : ''
    const other = out === 'f1' ? 'f2' : 'f1'
    state = reduceDoigt(state, { type: 'up', id: other, now: DRAW_AT + 300 })
    expect(eliminatedAtVerdict(state)).toBeNull()
    state = reduceDoigt(state, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(state.phase).toBe('result')
    expect(state.survival).toMatchObject({ winner: null, finishedByDraw: true, eliminated: [out] })
    expect(state.lifted).toEqual([other])
    expect(eliminatedAtVerdict(state)).toBe(out)
    expect(liftedToAnnounce(state)).toEqual([other])
  })

  it('entre deux éliminations, seuls les doigts levés depuis le tirage précédent sont annoncés ; au verdict, tous', () => {
    const ids = FINGERS.slice(0, 6)
    let state = drawn('survival', ids, 'x5')
    const firstOut = state.round!.outcome.mode === 'survival' ? state.round!.outcome.eliminated : ''
    const quitter = ids.find((id) => id !== firstOut)!
    state = reduceDoigt(state, { type: 'up', id: quitter, now: DRAW_AT + 400 })
    state = reduceDoigt(state, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(state.phase).toBe('between')
    expect(liftedToAnnounce(state)).toEqual([quitter])

    // Levé pendant l'attente : annoncé sur ce même écran.
    const impatient = state.survival!.alive[0]
    state = reduceDoigt(state, { type: 'up', id: impatient, now: DRAW_AT + 1_800 })
    expect(state.phase).toBe('between')
    expect(liftedToAnnounce(state)).toEqual([quitter, impatient])

    let now = DRAW_AT + 2_000
    state = reduceDoigt(state, { type: 'up', id: state.survival!.awaiting!, now })
    now += SURVIVAL_NEXT_MS
    state = reduceDoigt(state, { type: 'tick', now })
    expect(state.phase).toBe('selecting')
    state = reduceDoigt(state, { type: 'tick', now: state.round!.revealAt })
    expect(state.phase).toBe('between')
    expect(state.lifted).toEqual([quitter, impatient])
    expect(liftedToAnnounce(state)).toEqual([])
    expect(eliminatedAtVerdict(state)).toBeNull()

    now = state.round!.revealAt + 500
    state = reduceDoigt(state, { type: 'up', id: state.survival!.awaiting!, now })
    state = reduceDoigt(state, { type: 'tick', now: now + SURVIVAL_NEXT_MS })
    state = reduceDoigt(state, { type: 'tick', now: state.round!.revealAt })
    expect(state.phase).toBe('result')
    expect(state.survival!.winner).not.toBeNull()
    expect(liftedToAnnounce(state)).toEqual([quitter, impatient])
  })

  it('chaque nouveau tirage ne porte que sur les doigts encore en lice', () => {
    let state = drawn('survival', FINGERS.slice(0, 4), 7)
    state = reduceDoigt(state, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(state.phase).toBe('between')
    const first = state.survival!.awaiting!
    state = reduceDoigt(state, { type: 'up', id: first, now: DRAW_AT + 2_000 })
    state = reduceDoigt(state, { type: 'tick', now: DRAW_AT + 2_000 + SURVIVAL_NEXT_MS })
    expect(state.phase).toBe('selecting')
    expect(state.round!.participants).not.toContain(first)
    expect(state.round!.participants).toHaveLength(3)
  })

  it('à deux doigts, la première élimination désigne le dernier en lice', () => {
    const state = reduceDoigt(drawn('survival', ['f1', 'f2']), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const outcome = state.round!.outcome
    const out = outcome.mode === 'survival' ? outcome.eliminated : ''
    expect(state.phase).toBe('result')
    expect(state.survival!.winner).toBe(out === 'f1' ? 'f2' : 'f1')
  })

  it('un doigt en lice qui se lève entre deux tirages est éliminé d’office et signalé', () => {
    let state = reduceDoigt(drawn('survival', ['f1', 'f2', 'f3', 'f4'], 3), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const awaiting = state.survival!.awaiting!
    const quitter = state.survival!.alive[0]
    state = reduceDoigt(state, { type: 'up', id: quitter, now: DRAW_AT + 1_800 })
    expect(state.lifted).toEqual([quitter])
    expect(state.survival!.alive).not.toContain(quitter)
    expect(state.survival!.alive).toHaveLength(2)
    expect(state.survival!.awaiting).toBe(awaiting)

    const second = state.survival!.alive[0]
    state = reduceDoigt(state, { type: 'up', id: second, now: DRAW_AT + 1_900 })
    expect(state.phase).toBe('result')
    expect(state.survival!.winner).toBe(state.survival!.alive[0])
    expect(state.survival!.finishedByDraw).toBe(false)
    expect(eliminatedAtVerdict(state)).toBeNull()
    expect(state.lifted).toEqual([quitter, second])
  })

  it('tous les doigts en lice levés : personne ne gagne', () => {
    let state = drawn('survival', ['f1', 'f2', 'f3'], 4)
    const out = state.round!.outcome.mode === 'survival' ? state.round!.outcome.eliminated : ''
    for (const id of ['f1', 'f2', 'f3'].filter((f) => f !== out)) {
      state = reduceDoigt(state, { type: 'up', id, now: DRAW_AT + 400 })
    }
    state = reduceDoigt(state, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(state.phase).toBe('result')
    expect(state.survival!.winner).toBeNull()
    expect(state.lifted).toHaveLength(2)
  })

  it('l’éliminé déjà levé pendant l’animation : tirage suivant 1,5 s après le verdict', () => {
    let state = drawn('survival', ['f1', 'f2', 'f3'], 11)
    const out = state.round!.outcome.mode === 'survival' ? state.round!.outcome.eliminated : ''
    state = reduceDoigt(state, { type: 'up', id: out, now: DRAW_AT + 600 })
    expect(state.lifted).toEqual([out])
    const revealAt = DRAW_AT + SELECTION_MS
    state = reduceDoigt(state, { type: 'tick', now: revealAt })
    expect(state.phase).toBe('between')
    expect(state.survival!.awaiting).toBeNull()
    expect(state.survival!.nextDrawAt).toBe(revealAt + SURVIVAL_NEXT_MS)
  })

  it('pendant la survie, les nouveaux doigts et les changements de mode sont refusés', () => {
    const between = reduceDoigt(drawn('survival', ['f1', 'f2', 'f3']), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(between.phase).toBe('between')
    expect(fingerAdmission(between)).toBe('closed')
    expect(reduceDoigt(between, { type: 'down', id: 'f9', now: DRAW_AT + 2_000 })).toBe(between)
    expect(reduceDoigt(between, { type: 'mode', mode: 'victim', now: DRAW_AT + 2_000 })).toBe(between)
    expect(reduceDoigt(between, { type: 'replay', now: DRAW_AT + 2_000 })).toBe(between)
  })

  it('même graine → même survie', () => {
    expect(runSurvival(FINGERS.slice(0, 6), 'x')).toEqual(runSurvival(FINGERS.slice(0, 6), 'x'))
  })
})

describe('arène : doigt perdu sans avoir été levé', () => {
  /** Ce que fait le composant quand l'onglet se cache : chaque doigt suivi est perdu, dans l'ordre d'arrivée. */
  function loseAll(state: DoigtState, ids: string[], now: number): DoigtState {
    return play(
      state,
      ids.map((id) => ({ type: 'cancel' as const, id, now }))
    )
  }

  it('survie entre deux tirages : la partie est annulée, ni survivant ni pénalité', () => {
    const between = reduceDoigt(drawn('survival', ['f1', 'f2', 'f3', 'f4'], 3), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(between.phase).toBe('between')
    const lost = loseAll(between, ['f1', 'f2', 'f3', 'f4'], DRAW_AT + 3_000)
    expect(lost.phase).toBe('gathering')
    expect(lost.survival).toBeNull()
    expect(lost.round).toBeNull()
    expect(lost.lifted).toEqual([])
    expect(lost.fingers).toEqual([])
    expect(lost.down).toEqual([])
    expect(fingerAdmission(lost)).toBe('open')
  })

  it('victime pendant l’animation : ni verdict ni doigt levé', () => {
    const selecting = drawn('victim', ['f1', 'f2', 'f3'], 5)
    const lost = loseAll(selecting, ['f1', 'f2', 'f3'], DRAW_AT + 300)
    expect(lost.phase).toBe('gathering')
    expect(lost.round).toBeNull()
    expect(lost.lifted).toEqual([])
    expect(nextDoigtDeadline(lost, DRAW_AT + 300)).toBeNull()
    expect(reduceDoigt(lost, { type: 'tick', now: DRAW_AT + SELECTION_MS })).toBe(lost)
  })

  it('un seul doigt perdu pendant l’animation : tirage annulé, les autres relancent l’attente', () => {
    const lost = reduceDoigt(drawn('order', ['f1', 'f2', 'f3']), { type: 'cancel', id: 'f2', now: DRAW_AT + 400 })
    expect(lost.phase).toBe('gathering')
    expect(lost.round).toBeNull()
    expect(lost.lifted).toEqual([])
    expect(lost.down).toEqual(['f1', 'f3'])
    expect(lost.fingers).toEqual([
      { id: 'f1', color: 0 },
      { id: 'f3', color: 2 },
    ])
    expect(nextDoigtDeadline(lost, DRAW_AT + 400)).toBe(DRAW_AT + 400 + STABLE_MS)
    expect(reduceDoigt(lost, { type: 'tick', now: DRAW_AT + 400 + STABLE_MS }).phase).toBe('countdown')
  })

  it('tirage annulé : la pénalité d’un doigt levé avant l’interruption tombe avec lui', () => {
    const selecting = reduceDoigt(drawn('victim', ['f1', 'f2', 'f3']), { type: 'up', id: 'f3', now: DRAW_AT + 200 })
    expect(selecting.lifted).toEqual(['f3'])
    const lost = reduceDoigt(selecting, { type: 'cancel', id: 'f2', now: DRAW_AT + 400 })
    expect(lost.phase).toBe('gathering')
    expect(lost.lifted).toEqual([])
    expect(lost.fingers.map((f) => f.id)).toEqual(['f1'])
    expect(lost.down).toEqual(['f1'])
  })

  it('survie : un doigt en lice perdu entre deux tirages annule la partie au lieu de l’éliminer', () => {
    const between = reduceDoigt(drawn('survival', ['f1', 'f2', 'f3', 'f4'], 3), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const alive = between.survival!.alive[0]
    const lost = reduceDoigt(between, { type: 'cancel', id: alive, now: DRAW_AT + 2_000 })
    expect(lost.phase).toBe('gathering')
    expect(lost.survival).toBeNull()
    expect(lost.lifted).toEqual([])
    expect(lost.down).toEqual(between.down.filter((id) => id !== alive))
    expect(lost.fingers.map((f) => f.id)).toEqual(lost.down)
  })

  it('survie : l’éliminé perdu au lieu d’être levé vaut le retrait attendu', () => {
    const between = reduceDoigt(drawn('survival', ['f1', 'f2', 'f3'], 9), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const awaiting = between.survival!.awaiting!
    const next = reduceDoigt(between, { type: 'cancel', id: awaiting, now: DRAW_AT + 2_000 })
    expect(next).toEqual(reduceDoigt(between, { type: 'up', id: awaiting, now: DRAW_AT + 2_000 }))
    expect(next.phase).toBe('between')
    expect(next.lifted).toEqual([])
    expect(next.survival!.nextDrawAt).toBe(DRAW_AT + 2_000 + SURVIVAL_NEXT_MS)
  })

  it('hors tirage, un doigt perdu part comme un doigt levé ; un doigt inconnu ne change rien', () => {
    const counting = reduceDoigt(
      play(fresh(), [
        { type: 'down', id: 'f1', now: T0 },
        { type: 'down', id: 'f2', now: T0 },
      ]),
      { type: 'tick', now: T0 + STABLE_MS }
    )
    expect(reduceDoigt(counting, { type: 'cancel', id: 'f2', now: T0 + 2_500 })).toEqual(
      reduceDoigt(counting, { type: 'up', id: 'f2', now: T0 + 2_500 })
    )

    const result = reduceDoigt(drawn('victim', ['f1', 'f2']), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const after = reduceDoigt(result, { type: 'cancel', id: 'f1', now: DRAW_AT + 2_000 })
    expect(after).toEqual(reduceDoigt(result, { type: 'up', id: 'f1', now: DRAW_AT + 2_000 }))
    expect(after.phase).toBe('result')
    expect(after.round).toBe(result.round)
    expect(reduceDoigt(result, { type: 'cancel', id: 'f9', now: DRAW_AT + 2_000 })).toBe(result)
  })
})

describe('cercles : ce que montre chaque doigt', () => {
  it('attente, décompte, puis allumage pendant le tirage', () => {
    const placed = play(fresh('victim'), [
      { type: 'down', id: 'f1', now: T0 },
      { type: 'down', id: 'f2', now: T0 },
    ])
    expect(fingerRole(placed, 'f1', null).role).toEqual({ kind: 'idle' })
    const counting = reduceDoigt(placed, { type: 'tick', now: T0 + STABLE_MS })
    expect(fingerRole(counting, 'f1', null).role).toEqual({ kind: 'counting' })
    const selecting = reduceDoigt(counting, { type: 'tick', now: DRAW_AT })
    expect(fingerRole(selecting, 'f1', 'f1').role).toEqual({ kind: 'lit' })
    expect(fingerRole(selecting, 'f2', 'f1').role).toEqual({ kind: 'waiting' })
  })

  it('doigt levé pendant l’animation : rouge pendant le tirage, signalé au verdict', () => {
    const selecting = drawn('victim', ['f1', 'f2', 'f3'], 5)
    const victim = selecting.round!.outcome.mode === 'victim' ? selecting.round!.outcome.victim : ''
    const quitter = ['f1', 'f2', 'f3'].find((id) => id !== victim)!
    const lifted = reduceDoigt(selecting, { type: 'up', id: quitter, now: DRAW_AT + 300 })
    expect(fingerRole(lifted, quitter, quitter)).toEqual({ role: { kind: 'lifted' }, lifted: true })
    const result = reduceDoigt(lifted, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    expect(fingerRole(result, victim, null)).toEqual({ role: { kind: 'victim' }, lifted: false })
    expect(fingerRole(result, quitter, null)).toEqual({ role: { kind: 'lifted' }, lifted: true })
    const spared = ['f1', 'f2', 'f3'].find((id) => id !== victim && id !== quitter)!
    expect(fingerRole(result, spared, null).role).toEqual({ kind: 'spared' })
  })

  it('camps et ordre : chaque doigt a son camp ou son numéro', () => {
    const teams = reduceDoigt(drawn('teams', FINGERS.slice(0, 4)), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const kinds = FINGERS.slice(0, 4).map((id) => fingerRole(teams, id, null).role)
    expect(kinds.filter((r) => r.kind === 'team' && r.team === 'gold')).toHaveLength(2)
    expect(kinds.filter((r) => r.kind === 'team' && r.team === 'blue')).toHaveLength(2)

    const order = reduceDoigt(drawn('order', FINGERS.slice(0, 3)), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const ranks = FINGERS.slice(0, 3).map((id) => {
      const role = fingerRole(order, id, null).role
      return role.kind === 'rank' ? role.rank : 0
    })
    expect(ranks.sort()).toEqual([1, 2, 3])
  })

  it('survie : l’éliminé du moment, les anciens éliminés pendant le tirage suivant, puis le dernier', () => {
    let state = reduceDoigt(drawn('survival', ['f1', 'f2', 'f3'], 9), { type: 'tick', now: DRAW_AT + SELECTION_MS })
    const first = state.survival!.awaiting!
    expect(fingerRole(state, first, null).role).toEqual({ kind: 'eliminated', latest: true })
    const other = state.survival!.alive[0]
    expect(fingerRole(state, other, null).role).toEqual({ kind: 'alive' })

    state = reduceDoigt(state, { type: 'up', id: first, now: DRAW_AT + 2_000 })
    state = reduceDoigt(state, { type: 'tick', now: DRAW_AT + 2_000 + SURVIVAL_NEXT_MS })
    expect(state.phase).toBe('selecting')
    expect(fingerRole(state, first, null).role).toEqual({ kind: 'eliminated', latest: false })

    state = reduceDoigt(state, { type: 'tick', now: state.round!.revealAt })
    expect(state.phase).toBe('result')
    expect(fingerRole(state, state.survival!.winner!, null).role).toEqual({ kind: 'survivor' })
    expect(fingerRole(state, first, null).role).toEqual({ kind: 'eliminated', latest: false })
    const last = state.round!.outcome.mode === 'survival' ? state.round!.outcome.eliminated : ''
    expect(fingerRole(state, last, null).role).toEqual({ kind: 'eliminated', latest: true })
  })
})

describe('modes', () => {
  it('reconnaît les quatre modes et rien d’autre', () => {
    expect(['victim', 'teams', 'order', 'survival'].every(isDoigtMode)).toBe(true)
    expect(isDoigtMode('roulette')).toBe(false)
    expect(isDoigtMode(null)).toBe(false)
  })
})

describe('pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    const state = drawn('survival', FINGERS.slice(0, 4))
    reduceDoigt(state, { type: 'tick', now: DRAW_AT + SELECTION_MS })
    drawn('teams', FINGERS.slice(0, 5))
    clockwiseOrder([{ id: 'a', x: 1, y: 2 }])
    selectionSchedule(14)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})
