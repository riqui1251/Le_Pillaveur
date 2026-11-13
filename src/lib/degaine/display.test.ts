import { describe, expect, it } from 'vitest'
import {
  DEGAINE_DEFAULT_SETTINGS,
  DEGAINE_LOSER_WINDOW_MS,
  chooseDuellists,
  closeDuel,
  createDegaineGame,
  currentRoundRecord,
  findMatch,
  markReady,
  nextRound,
  openDuel,
  otherSide,
  rematch,
  showSignal,
  tapDuel,
  timeoutDuel,
  type DegaineSettings,
  type DegaineState,
  type DuelSide,
} from './engine'
import { decoyAt, matchLabel, roundNumber, sideOutcome, sideTime, stageRef } from './display'

const T0 = 100_000
const TABLE = ['alice', 'bob', 'chloe', 'dan', 'eve']
const TOURNAMENT: DegaineSettings = { ...DEGAINE_DEFAULT_SETTINGS }
const FREE: DegaineSettings = { format: 'free', decoys: true, roundsPerDuel: 1 }

/** Les deux « Prêt » à `at`, « FEU ! » peint à l'heure prévue. */
function fire(state: DegaineState, at = T0): DegaineState {
  const s = markReady(markReady(state.duel ? state : openDuel(state), 'a', at), 'b', at)
  return showSignal(s, { kind: 'fire' }, s.duel!.fireAt!)
}

/** Manche gagnée par `winner` 200 ms après « FEU ! », l'autre 300 ms après, figée. */
function win(state: DegaineState, winner: DuelSide, at = T0): DegaineState {
  let s = fire(state, at)
  const shown = s.duel!.shownAt!
  s = tapDuel(s, winner, shown + 200)
  return tapDuel(s, otherSide(winner), shown + 300)
}

/** Faux départ de `loser` une seconde après le lancement, fenêtre écoulée. */
function falseStart(state: DegaineState, loser: DuelSide, at = T0): DegaineState {
  const s = markReady(markReady(state.duel ? state : openDuel(state), 'a', at), 'b', at)
  return timeoutDuel(tapDuel(s, loser, at + 1_000), at + 1_000 + DEGAINE_LOSER_WINDOW_MS)
}

const keys = (view: ReturnType<typeof sideOutcome>) => [view.title.key, ...view.costs.map(c => c.key)]

describe('verdict de chaque moitié', () => {
  it('premier tour d’un tournoi : le vainqueur file en demi-finale, le perdant boit 2', () => {
    const s = win(createDegaineGame({ playerIds: TABLE, settings: TOURNAMENT, seed: 'verdict' }), 'a')
    const record = currentRoundRecord(s)!
    expect(sideOutcome(s, record, 'a', 'alcool')).toEqual({ tone: 'win', title: { key: 'arena.verdict.advance.semi' }, costs: [] })
    expect(sideOutcome(s, record, 'b', 'alcool')).toEqual({
      tone: 'lose',
      title: { key: 'arena.verdict.tooSlow' },
      costs: [{ key: 'arena.cost.drink', values: { count: 2 } }],
    })
    // Sans alcool, perdre un duel de tournoi élimine sans coûter de point.
    expect(sideOutcome(s, record, 'b', 'soft').costs).toEqual([{ key: 'arena.cost.eliminated' }])
  })

  it('finale : le champion distribue 5 (ou choisit le jeu suivant), le finaliste boit 3', () => {
    const s = win(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'finale' }), 'b')
    const record = currentRoundRecord(s)!
    expect(sideOutcome(s, record, 'b', 'alcool')).toEqual({
      tone: 'win',
      title: { key: 'arena.verdict.champion' },
      costs: [{ key: 'arena.cost.give', values: { count: 5 } }],
    })
    expect(sideOutcome(s, record, 'b', 'soft').costs).toEqual([{ key: 'arena.cost.chooseGame' }])
    expect(sideOutcome(s, record, 'a', 'alcool').costs).toEqual([{ key: 'arena.cost.drink', values: { count: 3 } }])
    expect(keys(sideOutcome(s, record, 'a', 'soft'))).toEqual(['arena.verdict.tooSlow', 'arena.cost.runnerUp'])
  })

  it('faux départ : 3 gorgées, ou −3 points sans alcool', () => {
    const s = falseStart(chooseDuellists(createDegaineGame({ playerIds: TABLE, settings: FREE, seed: 'faux' }), 'alice', 'bob'), 'a')
    const record = currentRoundRecord(s)!
    expect(sideOutcome(s, record, 'a', 'alcool')).toEqual({
      tone: 'lose',
      title: { key: 'arena.verdict.falseStart' },
      costs: [{ key: 'arena.cost.drink', values: { count: 3 } }],
    })
    expect(sideOutcome(s, record, 'a', 'soft').costs).toEqual([{ key: 'arena.cost.points', values: { count: 3 } }])
    expect(sideOutcome(s, record, 'b', 'alcool').title.key).toBe('arena.verdict.won')
  })

  it('duel libre perdu « trop lent » : −2 points sans alcool', () => {
    const start = chooseDuellists(createDegaineGame({ playerIds: TABLE, settings: FREE, seed: 'libre' }), 'chloe', 'dan')
    const s = win(start, 'a')
    const record = currentRoundRecord(s)!
    expect(sideOutcome(s, record, 'b', 'soft').costs).toEqual([{ key: 'arena.cost.points', values: { count: 2 } }])
  })

  it('au meilleur des 3, une manche perdue en route ne coûte rien', () => {
    const s = win(createDegaineGame({ playerIds: TABLE, settings: { ...TOURNAMENT, roundsPerDuel: 3 }, seed: 'bo3' }), 'a')
    const record = currentRoundRecord(s)!
    expect(sideOutcome(s, record, 'a', 'alcool')).toEqual({ tone: 'win', title: { key: 'arena.verdict.roundWon' }, costs: [] })
    expect(sideOutcome(s, record, 'b', 'alcool')).toEqual({ tone: 'lose', title: { key: 'arena.verdict.roundLost' }, costs: [] })
  })

  it('double faux départ : chaque moitié paie son faux départ, et la manche se rejoue', () => {
    const calm = createDegaineGame({ playerIds: ['alice', 'bob'], settings: { ...TOURNAMENT, decoys: false }, seed: 'double' })
    let s = markReady(markReady(openDuel(calm), 'a', T0), 'b', T0)
    s = tapDuel(tapDuel(s, 'a', T0 + 900), 'b', T0 + 960)
    const record = currentRoundRecord(s)!
    expect(record.outcome).toBe('double-false-start')
    for (const side of ['a', 'b'] as const) {
      expect(sideOutcome(s, record, side, 'alcool')).toEqual({
        tone: 'lose',
        title: { key: 'arena.verdict.falseStart' },
        costs: [{ key: 'arena.cost.drink', values: { count: 3 } }, { key: 'arena.cost.replay' }],
      })
      expect(sideTime(s.duel!, side)).toEqual({ kind: 'early' })
    }
  })

  it('égalité et absence de tir : on rejoue, sans perdant', () => {
    let s = fire(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'égal' }))
    s = tapDuel(tapDuel(s, 'a', s.duel!.shownAt! + 300.2), 'b', s.duel!.shownAt! + 300.4)
    const tie = sideOutcome(s, currentRoundRecord(s)!, 'a', 'alcool')
    expect(tie).toEqual({ tone: 'neutral', title: { key: 'arena.verdict.tie' }, costs: [{ key: 'arena.cost.replay' }] })

    let quiet = fire(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'silence' }))
    quiet = timeoutDuel(quiet, quiet.duel!.shownAt! + 5_000)
    expect(keys(sideOutcome(quiet, currentRoundRecord(quiet)!, 'b', 'soft'))).toEqual(['arena.verdict.noShot', 'arena.cost.replay'])
  })
})

describe('temps affiché', () => {
  it('temps en ms, « trop tôt », mot du leurre frappé, ou rien', () => {
    let s = fire(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'temps' }))
    s = tapDuel(s, 'b', s.duel!.shownAt! + 187.4)
    expect(sideTime(s.duel!, 'b')).toEqual({ kind: 'ms', ms: 187 })
    expect(sideTime(s.duel!, 'a')).toEqual({ kind: 'none' })

    // Sans leurres : un toucher pendant l'attente n'est qu'un départ anticipé.
    const calm = createDegaineGame({ playerIds: ['alice', 'bob'], settings: { ...TOURNAMENT, decoys: false }, seed: 'tôt' })
    const armed = markReady(markReady(openDuel(calm), 'a', T0), 'b', T0)
    expect(armed.duel!.decoys).toEqual([])
    const early = tapDuel(armed, 'a', T0 + 600)
    expect(sideTime(early.duel!, 'a')).toEqual({ kind: 'early' })
  })

  it('le vainqueur qui touche après le faux départ adverse n’affiche pas « Trop tôt »', () => {
    const calm = createDegaineGame({ playerIds: TABLE, settings: { ...TOURNAMENT, decoys: false }, seed: 'réplique' })
    let s = markReady(markReady(openDuel(calm), 'a', T0), 'b', T0)
    s = tapDuel(s, 'a', T0 + 900)
    s = tapDuel(s, 'b', T0 + 2_100)
    expect(sideTime(s.duel!, 'a')).toEqual({ kind: 'early' })
    expect(sideTime(s.duel!, 'b')).toEqual({ kind: 'none' })
    const record = currentRoundRecord(s)!
    expect(sideOutcome(s, record, 'b', 'alcool')).toEqual({ tone: 'win', title: { key: 'arena.verdict.advance.semi' }, costs: [] })
    expect(keys(sideOutcome(s, record, 'a', 'alcool'))).toEqual(['arena.verdict.falseStart', 'arena.cost.drink'])
  })

  it('un toucher pendant un leurre rapporte le mot affiché', () => {
    const base = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'leurre' }))
    const duel = { ...base.duel!, decoys: [{ at: T0 + 1_000, word: 'decoy3' as const }] }
    expect(decoyAt(duel, T0 + 1_200)).toBe('decoy3')
    expect(decoyAt(duel, T0 + 1_700)).toBeNull()
    const armed: DegaineState = { ...base, duel: { ...duel, phase: 'decoy', ready: { a: true, b: true }, armedAt: T0, fireAt: T0 + 3_000, decoyIndex: 0 } }
    const hit = tapDuel(armed, 'b', T0 + 1_200)
    expect(sideTime(hit.duel!, 'b')).toEqual({ kind: 'decoy', word: 'decoy3' })
  })
})

describe('libellés', () => {
  it('tour et rang du duel ; en duel libre, « Duel libre »', () => {
    const s = createDegaineGame({ playerIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], settings: TOURNAMENT, seed: 'tours' })
    expect(matchLabel(s, s.bracket[0][1].id)).toEqual([
      { key: 'board.stage.quarter' },
      { key: 'board.duelOf', values: { number: 2, total: 4 } },
    ])
    expect(matchLabel(s, s.bracket[2][0].id)).toEqual([{ key: 'board.stage.final' }])
    const free = chooseDuellists(createDegaineGame({ playerIds: TABLE, settings: FREE, seed: 'libre' }), 'alice', 'bob')
    expect(matchLabel(free, free.currentMatch!)).toEqual([{ key: 'board.freeDuel' }])
    expect(stageRef('other', 0, true)).toEqual({ key: 'board.stages.other', values: { round: 1 } })
  })

  it('numéro de manche : les manches rejouées ne comptent pas', () => {
    let s = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: { ...TOURNAMENT, roundsPerDuel: 3 }, seed: 'manches' }))
    expect(roundNumber(s)).toBe(1)
    s = win(s, 'a')
    expect(roundNumber(s)).toBe(1)
    s = nextRound(s)
    expect(roundNumber(s)).toBe(2)
    s = fire(s, T0 + 20_000)
    s = timeoutDuel(s, s.duel!.shownAt! + 5_000)
    s = nextRound(s)
    expect(roundNumber(s)).toBe(2)
    expect(findMatch(s, s.currentMatch!)!.wins).toEqual({ a: 1, b: 0 })
  })

  it('revanche en duel libre : nouveau duel, manche 1', () => {
    let s = chooseDuellists(createDegaineGame({ playerIds: TABLE, settings: FREE, seed: 'revanche' }), 'alice', 'bob')
    s = win(s, 'b')
    s = rematch(s)
    expect(s.duel!.phase).toBe('ready')
    expect(roundNumber(s)).toBe(1)
    expect(closeDuel(s).duel).toBeNull()
  })
})
