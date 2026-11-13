import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseLocalGameSave } from '@/lib/game-session'
import { createRng, type SeededRng } from '@/lib/petit-buveur/rng'
import {
  DEGAINE_ARM_GRACE_MS,
  DEGAINE_DECOY_GAP_MS,
  DEGAINE_DECOY_IDS,
  DEGAINE_DECOY_LEAD_MS,
  DEGAINE_DECOY_MS,
  DEGAINE_DEFAULT_SETTINGS,
  DEGAINE_DOUBLE_FALSE_START_MS,
  DEGAINE_LOSER_WINDOW_MS,
  DEGAINE_MAX_DELAY_MS,
  DEGAINE_MIN_DELAY_MS,
  DEGAINE_NO_SHOT_MS,
  DEGAINE_SAVE_VERSION,
  advanceBracket,
  applySignal,
  armDuel,
  bracketSize,
  champion,
  chooseDuellists,
  closeDuel,
  createDegaineGame,
  createDuel,
  createTournament,
  currentRoundRecord,
  currentScore,
  degaineDrinks,
  degaineSoftPointsLost,
  degaineTally,
  duelDeadline,
  duelRecord,
  duelSignalAt,
  findMatch,
  finishFreePlay,
  freeRanking,
  interruptDuel,
  isResumableDegaineSave,
  markReady,
  matchPosition,
  nextBracketMatch,
  nextRound,
  nextStageKind,
  openDuel,
  otherSide,
  penaltyFor,
  penaltySoftPoints,
  planDuel,
  reactionMs,
  rematch,
  resolveTap,
  resolveTimeout,
  restoreDegaineSave,
  roundKind,
  showSignal,
  stampFrom,
  tapDuel,
  timeoutDuel,
  toDegaineSave,
  tournamentRanking,
  type DegaineDuel,
  type DegaineMatch,
  type DegaineSettings,
  type DegaineState,
  type DuelPlan,
  type DuelSide,
} from './engine'

/** Horloge FIXE (celle de performance.now()) : les verdicts ne dépendent que des instants passés. */
const T0 = 100_000
const TABLE = ['alice', 'bob', 'chloe', 'dan', 'eve']
const TOURNAMENT: DegaineSettings = { ...DEGAINE_DEFAULT_SETTINGS }
const FREE: DegaineSettings = { format: 'free', decoys: true, roundsPerDuel: 1 }
/** Attente de 3 s, un leurre de 1 000 à 1 700 ms. */
const PLAN: DuelPlan = { delayMs: 3_000, decoys: [{ offsetMs: 1_000, word: 'decoy1' }] }

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

function match(overrides: Partial<DegaineMatch> = {}): DegaineMatch {
  return { id: 'm', round: 0, a: 'alice', b: 'bob', wins: { a: 0, b: 0 }, winner: null, bye: false, ...overrides }
}

/** Manche lancée à T0 : signal à T0 + 3 000, leurre de T0 + 1 000 à T0 + 1 700. */
function armed(): DegaineDuel {
  return armDuel(createDuel(match())!, PLAN, T0)
}

/** « FEU ! » peint à T0 + 3 000. */
function fired(): DegaineDuel {
  const duel = armed()
  return applySignal(duel, { kind: 'fire' }, duel.fireAt!)
}

/** Générateur à réponses dictées : int() rend la valeur suivante, shuffle() garde l'ordre. */
function scriptedRng(values: number[]): SeededRng {
  let i = 0
  const int = (min: number, max: number) => Math.min(max, Math.max(min, values[i++] ?? min))
  return {
    next: () => 0,
    int,
    chance: () => false,
    pick: <T,>(arr: readonly T[]) => arr[0],
    pickIndex: () => 0,
    weightedPick: <T extends { weight: number },>(entries: readonly T[]) => entries[0],
    shuffle: <T,>(arr: readonly T[]) => [...arr],
    getState: () => 0,
  }
}

/**
 * Joue une manche entière à partir de `at` : les deux « Prêt », puis `winner` tire 200 ms après
 * « FEU ! » et l'autre 300 ms après ; ou, en faux départ, le perdant touche 1 s après le lancement.
 */
function playRound(state: DegaineState, winner: DuelSide, mode: 'reflex' | 'false-start' = 'reflex', at = T0): DegaineState {
  let s = state.duel ? state : openDuel(state)
  s = markReady(markReady(s, 'a', at), 'b', at)
  const fireAt = s.duel!.fireAt!
  if (mode === 'false-start') {
    s = tapDuel(s, otherSide(winner), at + 1_000)
    return timeoutDuel(s, at + 1_000 + DEGAINE_LOSER_WINDOW_MS)
  }
  s = showSignal(s, { kind: 'fire' }, fireAt)
  s = tapDuel(s, winner, fireAt + 200)
  return tapDuel(s, otherSide(winner), fireAt + 300)
}

/** Tournoi joué jusqu'au bout : le côté a gagne toujours, la finale peut se perdre sur faux départ. */
function playTournament(state: DegaineState, finalMode: 'reflex' | 'false-start' = 'reflex'): DegaineState {
  let s = state
  for (let guard = 0; !s.finished && guard < 100; guard += 1) {
    const current = findMatch(s, s.currentMatch!)!
    const final = current.round === s.bracket.length - 1
    s = playRound(s, 'a', final ? finalMode : 'reflex', T0 + guard * 20_000)
    s = closeDuel(s)
  }
  return s
}

describe('tableau du tournoi', () => {
  it('2 joueurs : une seule manche, la finale, sans exempt', () => {
    const bracket = createTournament(['alice', 'bob'], createRng('duo'))
    expect(bracket).toHaveLength(1)
    expect(bracket[0]).toHaveLength(1)
    expect(bracket[0][0].bye).toBe(false)
    expect(new Set([bracket[0][0].a, bracket[0][0].b])).toEqual(new Set(['alice', 'bob']))
    expect(nextBracketMatch(bracket)?.id).toBe(bracket[0][0].id)
    expect(roundKind(bracket.length, 0)).toBe('final')
  })

  it('3 joueurs : un exempt tiré au sort attend en finale', () => {
    const bracket = createTournament(['alice', 'bob', 'chloe'], createRng('trio'))
    expect(bracketSize(3)).toBe(4)
    expect(bracket.map(round => round.length)).toEqual([2, 1])
    const byes = bracket[0].filter(m => m.bye)
    expect(byes).toHaveLength(1)
    expect(byes[0].winner).toBe(byes[0].a)
    const final = bracket[1][0]
    expect([final.a, final.b]).toContain(byes[0].a)
    expect(nextBracketMatch(bracket)?.bye).toBe(false)
    expect(nextBracketMatch(bracket)?.round).toBe(0)
  })

  it('l’exempt change avec la graine', () => {
    const exempts = new Set<string>()
    for (let seed = 0; seed < 30; seed += 1) {
      const bracket = createTournament(['alice', 'bob', 'chloe'], createRng(seed))
      exempts.add(bracket[0].find(m => m.bye)!.a!)
    }
    expect(exempts.size).toBe(3)
  })

  it('5 joueurs : 3 exempts, un seul vrai duel au premier tour, tout le monde une fois', () => {
    const bracket = createTournament(TABLE, createRng('cinq'))
    expect(bracket.map(round => round.length)).toEqual([4, 2, 1])
    expect(bracket[0].filter(m => m.bye)).toHaveLength(3)
    const seated = bracket[0].flatMap(m => [m.a, m.b]).filter((id): id is string => id !== null)
    expect([...seated].sort()).toEqual([...TABLE].sort())
    // Les exempts sont déjà montés en demi-finale ; personne n'y affronte une case vide pour toujours.
    const semis = bracket[1]
    expect(semis.flatMap(m => [m.a, m.b]).filter(Boolean)).toHaveLength(3)
    expect(matchPosition(bracket, nextBracketMatch(bracket)!.id)).toEqual({ round: 0, number: 1, total: 1 })
    expect(roundKind(bracket.length, 1)).toBe('semi')
  })

  it('8 joueurs : quarts, demies, finale, aucun exempt', () => {
    const bracket = createTournament(players(8), createRng('huit'))
    expect(bracket.map(round => round.length)).toEqual([4, 2, 1])
    expect(bracket[0].every(m => !m.bye && m.a && m.b)).toBe(true)
    expect(roundKind(bracket.length, 0)).toBe('quarter')
    expect(matchPosition(bracket, bracket[0][2].id)).toEqual({ round: 0, number: 3, total: 4 })
  })

  it('même graine → même tableau', () => {
    expect(createTournament(TABLE, createRng('soirée'))).toEqual(createTournament(TABLE, createRng('soirée')))
  })

  it('le vainqueur monte dans la bonne case du tour suivant', () => {
    const bracket = createTournament(players(8), createRng('montée'))
    const third = bracket[0][2]
    const next = advanceBracket(bracket, third.id, third.b!)
    expect(next[0][2].winner).toBe(third.b)
    expect(next[1][1].a).toBe(third.b)
    expect(bracket[0][2].winner).toBeNull()
    expect(advanceBracket(bracket, third.id, 'intrus')).toBe(bracket)
  })
})

describe('attente et leurres', () => {
  it('attente de 2 à 8 s, aucun leurre si désactivés', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const plan = planDuel(createRng(seed), false)
      expect(plan.delayMs).toBeGreaterThanOrEqual(DEGAINE_MIN_DELAY_MS)
      expect(plan.delayMs).toBeLessThanOrEqual(DEGAINE_MAX_DELAY_MS)
      expect(plan.decoys).toEqual([])
    }
  })

  it('0 à 2 leurres, jamais trop tôt, sans chevauchement, finis 500 ms avant « FEU ! »', () => {
    const counts = new Set<number>()
    for (let seed = 0; seed < 500; seed += 1) {
      const plan = planDuel(createRng(seed), true)
      counts.add(plan.decoys.length)
      expect(plan.decoys.length).toBeLessThanOrEqual(2)
      expect(new Set(plan.decoys.map(d => d.word)).size).toBe(plan.decoys.length)
      plan.decoys.forEach((decoy, i) => {
        expect(DEGAINE_DECOY_IDS).toContain(decoy.word)
        expect(decoy.offsetMs).toBeGreaterThanOrEqual(DEGAINE_DECOY_LEAD_MS)
        const nextStart = plan.decoys[i + 1]?.offsetMs ?? plan.delayMs
        expect(nextStart - (decoy.offsetMs + DEGAINE_DECOY_MS)).toBeGreaterThanOrEqual(DEGAINE_DECOY_GAP_MS)
      })
    }
    expect(counts).toEqual(new Set([0, 1, 2]))
  })

  it('une attente de 2 s ne loge qu’un leurre, même si deux sont tirés', () => {
    const plan = planDuel(scriptedRng([2_000, 2, 0, 0]), true)
    expect(plan.decoys).toEqual([{ offsetMs: DEGAINE_DECOY_LEAD_MS, word: 'decoy1' }])
  })

  it('même graine → même manche', () => {
    expect(planDuel(createRng('duel'), true)).toEqual(planDuel(createRng('duel'), true))
  })

  it('l’écran suit le plan : attente, leurre 700 ms, attente, « FEU ! »', () => {
    const duel = armed()
    expect(duelSignalAt(duel, T0 + 999)).toEqual({ kind: 'waiting' })
    expect(duelSignalAt(duel, T0 + 1_000)).toEqual({ kind: 'decoy', index: 0 })
    expect(duelSignalAt(duel, T0 + 1_700)).toEqual({ kind: 'waiting' })
    expect(duelSignalAt(duel, T0 + 3_000)).toEqual({ kind: 'fire' })
    const decoy = applySignal(duel, { kind: 'decoy', index: 0 }, T0 + 1_000)
    expect(decoy.phase).toBe('decoy')
    expect(applySignal(decoy, { kind: 'decoy', index: 0 }, T0 + 1_100)).toBe(decoy)
    expect(applySignal(decoy, { kind: 'waiting' }, T0 + 1_700).phase).toBe('waiting')
    const fire = applySignal(decoy, { kind: 'fire' }, T0 + 3_016)
    expect(fire.phase).toBe('fire')
    expect(fire.shownAt).toBe(T0 + 3_016)
  })
})

describe('touchers', () => {
  it('toucher pendant l’attente : faux départ, l’autre gagne sur-le-champ', () => {
    const duel = resolveTap(armed(), 'a', T0 + 800)
    expect(duel.phase).toBe('result')
    expect(duel.outcome).toBe('win')
    expect(duel.winner).toBe('b')
    expect(duel.falseStart).toBe('a')
  })

  it('le rebond du doigt sur « Prêt » ne compte pas', () => {
    const duel = armed()
    expect(resolveTap(duel, 'a', T0 + DEGAINE_ARM_GRACE_MS - 1)).toBe(duel)
  })

  it('toucher sur un leurre : faux départ de nature « leurre »', () => {
    const duel = resolveTap(armed(), 'b', T0 + 1_200)
    expect(duel.winner).toBe('a')
    const record = duelRecord(duel, false, true)!
    expect(record.kinds).toEqual({ a: null, b: 'decoy' })
    expect(penaltyFor(record, 'b')).toBe('falseStart')
    expect(penaltyFor(record, 'a')).toBe('none')
  })

  it('toucher moins de 100 ms après « FEU ! » : anticipation, donc faux départ', () => {
    const duel = fired()
    const tapped = resolveTap(duel, 'a', duel.shownAt! + 60)
    expect(tapped.falseStart).toBe('a')
    expect(tapped.winner).toBe('b')
  })

  it('le plus rapide gagne d’après les instants, pas d’après l’ordre de traitement', () => {
    const duel = fired()
    const firstSeen = resolveTap(duel, 'b', duel.shownAt! + 250)
    expect(firstSeen.winner).toBe('b')
    expect(firstSeen.settled).toBe(false)
    const both = resolveTap(firstSeen, 'a', duel.shownAt! + 230)
    expect(both.winner).toBe('a')
    expect(both.settled).toBe(true)
  })

  it('même temps affiché en ms : égalité, la manche se rejoue', () => {
    const duel = fired()
    const tied = resolveTap(resolveTap(duel, 'a', duel.shownAt! + 240.2), 'b', duel.shownAt! + 240.4)
    expect(tied.outcome).toBe('tie')
    expect(tied.winner).toBeNull()
  })

  it('deux faux départs au même instant : double faux départ, les deux paient', () => {
    const duel = armed()
    const both = resolveTap(resolveTap(duel, 'a', T0 + 900), 'b', T0 + 900)
    expect(both.outcome).toBe('double-false-start')
    expect(penaltyFor({ outcome: 'double-false-start', winner: null, final: false, decided: false, kinds: { a: 'early', b: 'early' } }, 'a')).toBe('falseStart')
  })

  it('les deux tombent dans le même leurre à 40 ms d’écart : double faux départ, chacun paie', () => {
    const decoy = applySignal(armed(), { kind: 'decoy', index: 0 }, T0 + 1_000)
    const both = resolveTap(resolveTap(decoy, 'a', T0 + 1_180), 'b', T0 + 1_220)
    expect(both).toMatchObject({ outcome: 'double-false-start', winner: null, falseStart: null, settled: true })
    const record = duelRecord(both, false, true)!
    expect(record.kinds).toEqual({ a: 'decoy', b: 'decoy' })
    expect(record.decided).toBe(false)
    expect(penaltyFor(record, 'a')).toBe('falseStart')
    expect(penaltyFor(record, 'b')).toBe('falseStart')
    // Même verdict quand le toucher le plus ancien est traité en second.
    expect(resolveTap(resolveTap(decoy, 'b', T0 + 1_220), 'a', T0 + 1_180)).toMatchObject({ outcome: 'double-false-start', settled: true })
  })

  it('deux anticipations à moins de 100 ms du « FEU ! » : double faux départ, personne ne gagne', () => {
    const duel = fired()
    const both = resolveTap(resolveTap(duel, 'a', duel.shownAt! + 40), 'b', duel.shownAt! + 70)
    expect(both).toMatchObject({ outcome: 'double-false-start', winner: null, falseStart: null })
  })

  it('après le faux départ adverse, un toucher qui peut répondre au verdict affiché ne compte pas', () => {
    const early = resolveTap(armed(), 'a', T0 + 900)
    expect(resolveTap(early, 'b', T0 + 900 + DEGAINE_DOUBLE_FALSE_START_MS - 1).outcome).toBe('double-false-start')
    const late = resolveTap(early, 'b', T0 + 900 + DEGAINE_DOUBLE_FALSE_START_MS)
    expect(late).toMatchObject({ outcome: 'win', winner: 'b', falseStart: 'a', taps: { a: T0 + 900, b: null }, settled: true })
    const record = duelRecord(late, false, true)!
    expect(record.kinds).toEqual({ a: 'early', b: null })
    expect(penaltyFor(record, 'b')).toBe('none')
    // Le vainqueur qui touche 1,2 s plus tard (réaction au verdict) non plus.
    expect(resolveTap(early, 'b', T0 + 2_100).taps).toEqual({ a: T0 + 900, b: null })
  })

  it('après une anticipation adverse, le toucher valide du vainqueur garde son temps', () => {
    const duel = fired()
    const won = resolveTap(resolveTap(duel, 'a', duel.shownAt! + 40), 'b', duel.shownAt! + 230)
    expect(won).toMatchObject({ outcome: 'win', winner: 'b', falseStart: 'a', settled: true })
    expect(reactionMs(won, 'b')).toBe(230)
  })

  it('un second toucher du même côté, ou après le verdict, est ignoré', () => {
    const duel = fired()
    const once = resolveTap(duel, 'a', duel.shownAt! + 200)
    expect(resolveTap(once, 'a', duel.shownAt! + 210)).toBe(once)
    const settled = resolveTap(once, 'b', duel.shownAt! + 400)
    expect(resolveTap(settled, 'b', duel.shownAt! + 500)).toBe(settled)
    expect(resolveTap(createDuel(match())!, 'a', T0)).toEqual(createDuel(match()))
  })
})

describe('échéances', () => {
  it('personne ne tire 5 s après « FEU ! » : manche à rejouer', () => {
    const duel = fired()
    expect(duelDeadline(duel)).toBe(duel.shownAt! + DEGAINE_NO_SHOT_MS)
    expect(resolveTimeout(duel, duel.shownAt! + DEGAINE_NO_SHOT_MS - 1)).toBe(duel)
    const timedOut = resolveTimeout(duel, duel.shownAt! + DEGAINE_NO_SHOT_MS)
    expect(timedOut.outcome).toBe('no-shot')
    expect(timedOut.settled).toBe(true)
  })

  it('le perdant a 1,5 s pour que son temps s’affiche, puis le verdict est figé', () => {
    const duel = fired()
    const won = resolveTap(duel, 'a', duel.shownAt! + 200)
    const first = duel.shownAt! + 200
    expect(duelDeadline(won)).toBe(first + DEGAINE_LOSER_WINDOW_MS)
    expect(resolveTimeout(won, first + DEGAINE_LOSER_WINDOW_MS - 1)).toBe(won)
    const closed = resolveTimeout(won, first + DEGAINE_LOSER_WINDOW_MS)
    expect(closed.settled).toBe(true)
    expect(duelDeadline(closed)).toBeNull()
    expect(resolveTap(closed, 'b', first + DEGAINE_LOSER_WINDOW_MS + 10)).toBe(closed)
  })

  it('un toucher hors de la fenêtre du perdant, traité avant son minuteur, fige la manche sans compter', () => {
    const duel = fired()
    const first = duel.shownAt! + 200
    const won = resolveTap(duel, 'a', first)
    const inTime = resolveTap(won, 'b', first + DEGAINE_LOSER_WINDOW_MS - 1)
    expect(inTime).toMatchObject({ settled: true, taps: { a: first, b: first + DEGAINE_LOSER_WINDOW_MS - 1 } })
    const late = resolveTap(won, 'b', first + DEGAINE_LOSER_WINDOW_MS)
    expect(late).toMatchObject({ outcome: 'win', winner: 'a', settled: true, taps: { a: first, b: null } })

    let s = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'hors délai' }))
    s = markReady(markReady(s, 'a', T0), 'b', T0)
    s = showSignal(s, { kind: 'fire' }, s.duel!.fireAt!)
    const shot = s.duel!.shownAt! + 200
    s = tapDuel(tapDuel(s, 'a', shot), 'b', shot + DEGAINE_LOSER_WINDOW_MS + 15)
    expect(s.log).toHaveLength(1)
    expect(s.log[0].reactionMs).toEqual({ a: 200, b: null })
  })

  it('horodatage : un timeStamp absurde retombe sur l’instant présent', () => {
    expect(stampFrom(1234.5, 2000)).toBe(1234.5)
    expect(stampFrom(0, 2000)).toBe(2000)
    expect(stampFrom(1_700_000_000_000, 2000)).toBe(2000)
    expect(stampFrom(Number.NaN, 2000)).toBe(2000)
  })
})

describe('partie en tournoi', () => {
  it('le second « Prêt » tire l’attente avec le générateur de la partie', () => {
    const game = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'prêts' }))
    const one = markReady(game, 'a', T0)
    expect(one.duel!.phase).toBe('ready')
    expect(one.rngState).toBe(game.rngState)
    const both = markReady(one, 'b', T0 + 50)
    expect(both.duel!.phase).toBe('waiting')
    expect(both.duel!.armedAt).toBe(T0 + 50)
    expect(both.rngState).not.toBe(game.rngState)
  })

  it('5 joueurs jusqu’au champion : classement par ordre d’élimination', () => {
    const end = playTournament(createDegaineGame({ playerIds: TABLE, settings: TOURNAMENT, seed: 'tournoi' }))
    expect(end.finished).toBe(true)
    expect(end.currentMatch).toBeNull()
    const winnerId = champion(end.bracket)!
    const ranking = tournamentRanking(end)
    expect(ranking.map(row => row.rank)).toEqual([1, 2, 3, 3, 5])
    expect(ranking[0]).toEqual({ playerId: winnerId, rank: 1, lostRound: null })
    expect(ranking[1].lostRound).toBe(2)
    expect(end.log).toHaveLength(4)
  })

  it('gorgées : 2 par duel perdu, 3 en finale, rien au champion', () => {
    const end = playTournament(createDegaineGame({ playerIds: TABLE, settings: TOURNAMENT, seed: 'gorgées' }))
    const tally = degaineTally(end)
    const ranking = tournamentRanking(end)
    expect(degaineDrinks(tally[ranking[0].playerId])).toBe(0)
    expect(degaineDrinks(tally[ranking[1].playerId])).toBe(3)
    expect(ranking.slice(2).map(row => degaineDrinks(tally[row.playerId]))).toEqual([2, 2, 2])
    // Sans alcool, un duel perdu élimine sans coûter de points.
    expect(ranking.map(row => degaineSoftPointsLost(tally[row.playerId], 'tournament'))).toEqual([0, 0, 0, 0, 0])
  })

  it('finale perdue sur faux départ : 3 gorgées de faux départ, −3 points sans alcool', () => {
    const end = playTournament(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'faux' }), 'false-start')
    const final = end.bracket[0][0]
    const loser = final.winner === final.a ? final.b! : final.a!
    const tally = degaineTally(end)[loser]
    expect(tally.falseStarts).toBe(1)
    expect(tally.finalsLost).toBe(0)
    expect(degaineDrinks(tally)).toBe(3)
    expect(degaineSoftPointsLost(tally, 'tournament')).toBe(3)
  })

  it('au meilleur des 3 : deux manches gagnées pour passer, égalité et absence de tir ne comptent pas', () => {
    let s = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: { ...TOURNAMENT, roundsPerDuel: 3 }, seed: 'bo3' }))
    const id = s.currentMatch!
    s = playRound(s, 'a')
    expect(findMatch(s, id)!.wins).toEqual({ a: 1, b: 0 })
    expect(findMatch(s, id)!.winner).toBeNull()
    expect(s.finished).toBe(false)

    s = nextRound(s)
    s = markReady(markReady(s, 'a', T0 + 20_000), 'b', T0 + 20_000)
    s = showSignal(s, { kind: 'fire' }, s.duel!.fireAt!)
    s = timeoutDuel(s, s.duel!.shownAt! + DEGAINE_NO_SHOT_MS)
    expect(s.duel!.outcome).toBe('no-shot')
    expect(findMatch(s, id)!.wins).toEqual({ a: 1, b: 0 })

    s = playRound(nextRound(s), 'b', 'reflex', T0 + 40_000)
    expect(findMatch(s, id)!.wins).toEqual({ a: 1, b: 1 })
    s = playRound(nextRound(s), 'a', 'reflex', T0 + 60_000)
    expect(findMatch(s, id)!.winner).toBe(findMatch(s, id)!.a)
    expect(s.finished).toBe(true)
    expect(s.log.map(r => r.outcome)).toEqual(['win', 'no-shot', 'win', 'win'])
  })

  it('au meilleur des 3, perdre 0–2 « trop lent » : un seul duel perdu, 2 gorgées ; le vainqueur ne boit rien', () => {
    let s = createDegaineGame({ playerIds: TABLE, settings: { ...TOURNAMENT, roundsPerDuel: 3 }, seed: 'barème' })
    const match = findMatch(s, s.currentMatch!)!
    s = playRound(s, 'a')
    // Manche perdue sans décider du duel : elle ne coûte rien (encore).
    expect(penaltyFor(s.log[0], 'b')).toBe('none')
    s = playRound(nextRound(s), 'a', 'reflex', T0 + 20_000)
    expect(s.log[1].decided).toBe(true)
    const tally = degaineTally(s)
    expect(degaineDrinks(tally[match.b!])).toBe(2)
    expect(degaineDrinks(tally[match.a!])).toBe(0)
    expect(tally[match.b!].duelsLost).toBe(1)
  })

  it('au meilleur des 3 : un faux départ en route coûte 3, puis la finale perdue 3 ; le faux départ qui donne le duel, 3 seulement', () => {
    const settings: DegaineSettings = { ...TOURNAMENT, roundsPerDuel: 3 }
    let s = createDegaineGame({ playerIds: ['alice', 'bob'], settings, seed: 'route' })
    const match = findMatch(s, s.currentMatch!)!
    s = playRound(s, 'b', 'false-start')
    s = playRound(nextRound(s), 'a', 'reflex', T0 + 20_000)
    s = playRound(nextRound(s), 'b', 'reflex', T0 + 40_000)
    let tally = degaineTally(s)[match.a!]
    expect(tally.falseStarts).toBe(1)
    expect(tally.finalsLost).toBe(1)
    expect(degaineDrinks(tally)).toBe(6)

    s = createDegaineGame({ playerIds: ['alice', 'bob'], settings, seed: 'route' })
    s = playRound(s, 'b')
    s = playRound(nextRound(s), 'b', 'false-start', T0 + 20_000)
    tally = degaineTally(s)[match.a!]
    expect(s.finished).toBe(true)
    expect(tally.falseStarts).toBe(1)
    expect(tally.finalsLost).toBe(0)
    expect(degaineDrinks(tally)).toBe(3)
  })

  it('sans alcool : faux départ −3, duel libre perdu −2, rien d’autre', () => {
    expect(penaltySoftPoints('falseStart', 'tournament')).toBe(3)
    expect(penaltySoftPoints('lost', 'tournament')).toBe(0)
    expect(penaltySoftPoints('finalLost', 'tournament')).toBe(0)
    expect(penaltySoftPoints('lost', 'free')).toBe(2)
    expect(penaltySoftPoints('none', 'free')).toBe(0)
  })

  it('écran quitté pendant l’attente : la manche repart des deux « Prêt »', () => {
    let s = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'appel' }))
    s = markReady(markReady(s, 'a', T0), 'b', T0)
    const interrupted = interruptDuel(s)
    expect(interrupted.duel!.phase).toBe('ready')
    expect(interrupted.duel!.interrupted).toBe(true)
    expect(interrupted.duel!.ready).toEqual({ a: false, b: false })
    expect(interrupted.log).toHaveLength(0)
  })

  it('écran quitté pendant le résultat : la manche est inscrite telle quelle', () => {
    let s = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'verrou' }))
    s = markReady(markReady(s, 'a', T0), 'b', T0)
    s = showSignal(s, { kind: 'fire' }, s.duel!.fireAt!)
    s = tapDuel(s, 'b', s.duel!.shownAt! + 210)
    expect(s.log).toHaveLength(0)
    const stopped = interruptDuel(s)
    expect(stopped.duel!.settled).toBe(true)
    expect(stopped.log).toHaveLength(1)
    expect(stopped.finished).toBe(true)
  })

  it('fermer l’arène pendant la fenêtre du perdant garde le verdict (interruption puis fermeture)', () => {
    let s = openDuel(createDegaineGame({ playerIds: TABLE, settings: TOURNAMENT, seed: 'sortie' }))
    s = markReady(markReady(s, 'a', T0), 'b', T0)
    s = showSignal(s, { kind: 'fire' }, s.duel!.fireAt!)
    s = tapDuel(s, 'a', s.duel!.shownAt! + 190)
    const closed = closeDuel(interruptDuel(s))
    expect(closed.duel).toBeNull()
    expect(closed.log).toHaveLength(1)
    expect(closed.log[0]).toMatchObject({ outcome: 'win', winner: 'a', decided: true })
  })

  it('fermer l’arène avant le verdict annule la manche', () => {
    let s = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'fuite' }))
    s = markReady(markReady(s, 'a', T0), 'b', T0)
    const closed = closeDuel(s)
    expect(closed.duel).toBeNull()
    expect(closed.log).toHaveLength(0)
    expect(openDuel(closed).duel!.phase).toBe('ready')
  })
})

describe('verdict à l’écran', () => {
  it('le résultat se lit dès le premier tir : duel décidé et score à jour avant la fenêtre du perdant', () => {
    let s = openDuel(createDegaineGame({ playerIds: TABLE, settings: TOURNAMENT, seed: 'écran' }))
    const match = findMatch(s, s.currentMatch!)!
    s = markReady(markReady(s, 'a', T0), 'b', T0)
    s = showSignal(s, { kind: 'fire' }, s.duel!.fireAt!)
    s = tapDuel(s, 'b', s.duel!.shownAt! + 230)
    expect(s.duel!.settled).toBe(false)
    expect(s.log).toHaveLength(0)
    const preview = currentRoundRecord(s)!
    expect(preview).toMatchObject({ outcome: 'win', winner: 'b', decided: true, final: false })
    expect(preview.reactionMs).toEqual({ a: null, b: 230 })
    expect(penaltyFor(preview, 'a')).toBe('lost')
    expect(currentScore(s)).toEqual({ a: 0, b: 1 })
    expect(findMatch(s, match.id)!.wins).toEqual({ a: 0, b: 0 })

    s = timeoutDuel(s, s.duel!.shownAt! + 230 + DEGAINE_LOSER_WINDOW_MS)
    expect(currentRoundRecord(s)).toEqual(s.log[0])
    expect(currentScore(s)).toEqual({ a: 0, b: 1 })
  })

  it('le vainqueur file au tour suivant ; la finale et le duel libre n’ont pas de suite', () => {
    const s = createDegaineGame({ playerIds: TABLE, settings: TOURNAMENT, seed: 'suite' })
    expect(nextStageKind(s, s.bracket[0][0])).toBe('semi')
    expect(nextStageKind(s, s.bracket[1][0])).toBe('final')
    expect(nextStageKind(s, s.bracket[2][0])).toBeNull()
    const free = chooseDuellists(createDegaineGame({ playerIds: TABLE, settings: FREE, seed: 'suite' }), 'alice', 'bob')
    expect(nextStageKind(free, findMatch(free, free.currentMatch!)!)).toBeNull()
  })

  it('égalité ou personne ne tire : rien n’est décidé, le score ne bouge pas', () => {
    let s = openDuel(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'nul' }))
    s = markReady(markReady(s, 'a', T0), 'b', T0)
    s = showSignal(s, { kind: 'fire' }, s.duel!.fireAt!)
    s = tapDuel(tapDuel(s, 'a', s.duel!.shownAt! + 250.1), 'b', s.duel!.shownAt! + 250.3)
    expect(currentRoundRecord(s)).toMatchObject({ outcome: 'tie', decided: false, winner: null })
    expect(currentScore(s)).toEqual({ a: 0, b: 0 })
    expect(s.finished).toBe(false)
  })
})

describe('duel libre', () => {
  it('la table choisit le duo ; le même duo garde son duel en cours', () => {
    let s = createDegaineGame({ playerIds: TABLE, settings: { ...FREE, roundsPerDuel: 3 }, seed: 'libre' })
    expect(s.bracket).toEqual([])
    expect(chooseDuellists(s, 'alice', 'alice')).toBe(s)
    expect(chooseDuellists(s, 'alice', 'intrus')).toBe(s)
    s = chooseDuellists(s, 'alice', 'bob')
    const id = s.currentMatch!
    s = closeDuel(playRound(s, 'a'))
    expect(chooseDuellists(s, 'bob', 'alice').currentMatch).toBe(id)
    expect(chooseDuellists(s, 'chloe', 'dan').currentMatch).not.toBe(id)
  })

  it('revanche à volonté, bilan : duels gagnés, spectateurs exclus, points sans alcool', () => {
    let s = createDegaineGame({ playerIds: TABLE, settings: FREE, seed: 'revanches' })
    s = playRound(chooseDuellists(s, 'alice', 'bob'), 'a')
    s = playRound(rematch(s), 'a', 'reflex', T0 + 20_000)
    s = playRound(rematch(s), 'b', 'false-start', T0 + 40_000)
    s = closeDuel(s)
    s = playRound(chooseDuellists(s, 'chloe', 'dan'), 'b', 'reflex', T0 + 60_000)
    s = finishFreePlay(s)
    expect(s.finished).toBe(true)
    expect(s.duel).toBeNull()

    const ranking = freeRanking(s)
    expect(ranking).toEqual([
      { playerId: 'alice', rank: 1 },
      { playerId: 'bob', rank: 2 },
      { playerId: 'dan', rank: 2 },
      { playerId: 'chloe', rank: 4 },
    ])
    const tally = degaineTally(s)
    expect(tally.alice.matchesWon).toBe(2)
    expect(tally.alice.falseStarts).toBe(1)
    expect(degaineDrinks(tally.alice)).toBe(3)
    expect(degaineDrinks(tally.bob)).toBe(4)
    expect(degaineSoftPointsLost(tally.bob, 'free')).toBe(4)
    expect(degaineSoftPointsLost(tally.alice, 'free')).toBe(3)
    expect(tally.eve.roundsPlayed).toBe(0)
  })
})

describe('reprise', () => {
  function midTournament(): DegaineState {
    let s = createDegaineGame({ playerIds: TABLE, settings: { ...TOURNAMENT, roundsPerDuel: 3 }, seed: 'reprise' })
    s = closeDuel(playRound(s, 'a'))
    return s
  }

  it('sauvegarde → reprise à l’identique, sans la manche en cours', () => {
    const state = midTournament()
    const raw = JSON.stringify({ version: DEGAINE_SAVE_VERSION, savedAt: 1_000, state: toDegaineSave(openDuel(state)) })
    const save = parseLocalGameSave<unknown>(raw, DEGAINE_SAVE_VERSION, 2_000)
    expect(restoreDegaineSave(save, TABLE)).toEqual({ ...state, duelSeq: 0 })
    expect(isResumableDegaineSave(save, [...TABLE].reverse())).toBe(true)
  })

  it('reprenable quels que soient les réglages de la pré-partie : la partie garde les siens', () => {
    const save = toDegaineSave(midTournament())!
    expect(isResumableDegaineSave(save, TABLE)).toBe(true)
    expect(restoreDegaineSave(save, TABLE)?.settings.roundsPerDuel).toBe(3)
  })

  it('autre table ou sauvegarde illisible : refusée', () => {
    const save = toDegaineSave(midTournament())!
    expect(isResumableDegaineSave(save, ['alice', 'bob'])).toBe(false)
    expect(isResumableDegaineSave({ ...save, settings: { format: 'chaos' } }, TABLE)).toBe(false)
    expect(restoreDegaineSave(save, ['alice', 'bob'])).toBeNull()
    expect(restoreDegaineSave({ ...save, settings: { format: 'chaos' } }, TABLE)).toBeNull()
    expect(restoreDegaineSave({ ...save, bracket: [[{ id: 'x' }]] }, TABLE)).toBeNull()
    expect(restoreDegaineSave({ ...save, currentMatch: 'nulle-part' }, TABLE)).toBeNull()
    expect(restoreDegaineSave({ ...save, log: [{ matchId: 'r0m0', a: 'alice' }] }, TABLE)).toBeNull()
    expect(restoreDegaineSave(null, TABLE)).toBeNull()
  })

  it('une partie finie ne laisse rien', () => {
    const end = playTournament(createDegaineGame({ playerIds: ['alice', 'bob'], settings: TOURNAMENT, seed: 'fin' }))
    expect(toDegaineSave(end)).toBeNull()
  })
})

describe('pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    const end = playTournament(createDegaineGame({ playerIds: players(7), settings: TOURNAMENT, seed: 'pur' }))
    let free = createDegaineGame({ playerIds: TABLE, settings: FREE, seed: 'pur' })
    free = finishFreePlay(playRound(chooseDuellists(free, 'alice', 'eve'), 'b'))
    expect(end.finished).toBe(true)
    expect(free.finished).toBe(true)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})
