import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseLocalGameSave } from '@/lib/game-session'
import {
  PILE_POIL_DEFAULT_SETTINGS,
  PILE_POIL_FIXED_TARGET_MS,
  PILE_POIL_REVEAL_MS,
  PILE_POIL_SAVE_VERSION,
  PILE_POIL_VARIABLE_TARGETS_MS,
  cancelRun,
  completedRounds,
  createGame,
  currentPlayerId,
  digitsVisible,
  finalRanking,
  isBullseye,
  isResumablePilePoilSave,
  nextPlayer,
  nextRound,
  recordResult,
  restorePilePoilSave,
  ringProgress,
  roundRanking,
  sipsForDelta,
  softPoints,
  standings,
  startRun,
  targetFor,
  toPilePoilSave,
  upcomingPlayerId,
  type PilePoilResult,
  type PilePoilSettings,
  type PilePoilState,
} from './engine'
import { createRng } from '@/lib/petit-buveur/rng'
import { MIN_RUN_MS, isPlausibleStop, measuredMs, pressStamp } from './timing'

const TABLE = ['alice', 'bob', 'chloe']
const VARIABLE: PilePoilSettings = { level: 'normal', targetMode: 'variable', rounds: 8 }

/** Partie posée à la main : cible 10 s, alice ouvre le tour. */
function game(overrides: Partial<PilePoilState> = {}): PilePoilState {
  return {
    ...createGame(TABLE, PILE_POIL_DEFAULT_SETTINGS, 'soirée'),
    order: [...TABLE],
    ...overrides,
  }
}

/** Un essai complet du joueur au tour : Démarrer, Stop après `elapsedMs`, « Au suivant ». */
function play(state: PilePoilState, elapsedMs: number): PilePoilState {
  return nextPlayer(recordResult(startRun(state), elapsedMs))
}

/** Tout le tour, dans l'ordre de passage. */
function playRound(state: PilePoilState, times: number[]): PilePoilState {
  return times.reduce(play, state)
}

const result = (player: string, deltaMs: number, target = PILE_POIL_FIXED_TARGET_MS): PilePoilResult => ({
  player,
  elapsedMs: target + deltaMs,
  deltaMs,
})

describe('barème', () => {
  it('le plus loin boit une gorgée par demi-seconde d’écart, au moins 1, au plus 5', () => {
    expect(sipsForDelta(240)).toBe(1)
    expect(sipsForDelta(1_620)).toBe(3)
    expect(sipsForDelta(3_000)).toBe(5)
    expect(sipsForDelta(-1_620)).toBe(3)
    expect(sipsForDelta(10)).toBe(1)
    expect(sipsForDelta(60_000)).toBe(5)
  })

  it('pile poil : moins de 0,05 s d’écart, dans un sens comme dans l’autre', () => {
    expect(isBullseye(40)).toBe(true)
    expect(isBullseye(-40)).toBe(true)
    expect(isBullseye(0)).toBe(true)
    expect(isBullseye(50)).toBe(false)
    expect(isBullseye(-50)).toBe(false)
  })

  it('l’écart est gardé au centième : 0,04 s fait un pile poil, 49,6 ms affiché « 0,05 » n’en fait pas', () => {
    const near = recordResult(startRun(game()), 10_044)
    expect(near.results[0]).toEqual({ player: 'alice', elapsedMs: 10_040, deltaMs: 40 })
    expect(isBullseye(near.results[0].deltaMs)).toBe(true)
    const far = recordResult(startRun(game()), 10_049.6)
    expect(far.results[0].deltaMs).toBe(50)
    expect(isBullseye(far.results[0].deltaMs)).toBe(false)
  })

  it('sans alcool : +5 par pile poil, moins les points perdus en étant le plus loin', () => {
    expect(softPoints({ bullseyes: 2, penalties: 3 })).toBe(7)
    expect(softPoints({ bullseyes: 0, penalties: 4 })).toBe(-4)
  })
})

describe('affichage du chrono', () => {
  it('Normal : chiffres visibles jusqu’à 3 s ; Pro : jamais', () => {
    expect(digitsVisible('normal', 0)).toBe(true)
    expect(digitsVisible('normal', PILE_POIL_REVEAL_MS - 1)).toBe(true)
    expect(digitsVisible('normal', PILE_POIL_REVEAL_MS)).toBe(false)
    expect(digitsVisible('pro', 0)).toBe(false)
  })

  it('l’anneau avance vers la cible jusqu’à 3 s, puis se fige', () => {
    expect(ringProgress(0, 10_000)).toBe(0)
    expect(ringProgress(1_500, 10_000)).toBeCloseTo(0.15)
    expect(ringProgress(3_000, 10_000)).toBeCloseTo(0.3)
    expect(ringProgress(9_000, 10_000)).toBeCloseTo(0.3)
    expect(ringProgress(9_000, 5_000)).toBeCloseTo(0.6)
    expect(ringProgress(-20, 10_000)).toBe(0)
    expect(ringProgress(1_000, 0)).toBe(0)
  })
})

describe('début de partie', () => {
  it('même graine → même partie ; ordre = la table, décalée au premier joueur tiré', () => {
    const a = createGame(TABLE, PILE_POIL_DEFAULT_SETTINGS, 'soirée')
    const b = createGame(TABLE, PILE_POIL_DEFAULT_SETTINGS, 'soirée')
    expect(a).toEqual(b)
    const first = a.order[0]
    const shift = TABLE.indexOf(first)
    expect(a.order).toEqual([...TABLE.slice(shift), ...TABLE.slice(0, shift)])
    expect(a.phase).toBe('waiting')
    expect(a.target).toBe(PILE_POIL_FIXED_TARGET_MS)
    expect(currentPlayerId(a)).toBe(first)
  })

  it('le premier joueur dépend de la graine', () => {
    const firsts = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => createGame(TABLE, PILE_POIL_DEFAULT_SETTINGS, seed).order[0]))
    expect(firsts.size).toBeGreaterThan(1)
  })

  it('les réglages sont copiés, pas partagés', () => {
    const settings: PilePoilSettings = { ...PILE_POIL_DEFAULT_SETTINGS }
    const state = createGame(TABLE, settings, 1)
    settings.rounds = 8
    expect(state.settings.rounds).toBe(5)
  })
})

describe('cible', () => {
  it('10 s : toujours 10 s, sans consommer de tirage', () => {
    const rng = createRng('fixe')
    const before = rng.getState()
    expect(targetFor(PILE_POIL_DEFAULT_SETTINGS, rng)).toBe(PILE_POIL_FIXED_TARGET_MS)
    expect(rng.getState()).toBe(before)
  })

  it('Variable : cibles déterministes pour une graine, prises dans la liste, jamais deux fois de suite la même', () => {
    const targetsOf = (seed: string) => {
      let state = createGame(TABLE, VARIABLE, seed)
      const targets = [state.target]
      while (state.phase !== 'finished') {
        state = nextRound(playRound(state, [10_000, 10_000, 10_000]))
        if (state.phase !== 'finished') targets.push(state.target)
      }
      return targets
    }
    const first = targetsOf('apéro')
    expect(targetsOf('apéro')).toEqual(first)
    expect(first).toHaveLength(8)
    for (const target of first) expect(PILE_POIL_VARIABLE_TARGETS_MS).toContain(target)
    for (let i = 1; i < first.length; i += 1) expect(first[i]).not.toBe(first[i - 1])
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(new Set(seeds.map((seed) => targetsOf(seed).join(','))).size).toBeGreaterThan(1)
  })
})

describe('déroulé d’un tour', () => {
  it('Démarrer, Stop, Au suivant : chacun son tour, puis le classement du tour', () => {
    let state = game()
    expect(currentPlayerId(state)).toBe('alice')
    expect(upcomingPlayerId(state)).toBe('bob')
    state = startRun(state)
    expect(state.phase).toBe('running')
    state = recordResult(state, 9_410)
    expect(state.phase).toBe('between')
    expect(state.results).toEqual([{ player: 'alice', elapsedMs: 9_410, deltaMs: -590 }])
    // Le résultat s'affiche : le joueur montré reste celui qui vient de jouer.
    expect(currentPlayerId(state)).toBe('alice')
    state = nextPlayer(state)
    expect(currentPlayerId(state)).toBe('bob')
    state = play(state, 10_030)
    expect(upcomingPlayerId(state)).toBeNull()
    state = play(state, 11_620)
    expect(state.phase).toBe('roundEnd')
    expect(currentPlayerId(state)).toBeNull()
    expect(state.results.map((r) => r.player)).toEqual(TABLE)
  })

  it('un seul Stop compte : hors chrono, l’état ne bouge pas', () => {
    const running = startRun(game())
    const stopped = recordResult(running, 10_000)
    expect(recordResult(stopped, 12_000)).toBe(stopped)
    expect(recordResult(game(), 10_000).results).toEqual([])
    expect(startRun(stopped)).toBe(stopped)
    expect(nextPlayer(running)).toBe(running)
  })

  it('durée illisible (négative, infinie) : refusée', () => {
    const running = startRun(game())
    expect(recordResult(running, -5)).toBe(running)
    expect(recordResult(running, Number.NaN)).toBe(running)
    expect(recordResult(running, Number.POSITIVE_INFINITY)).toBe(running)
  })

  it('essai interrompu : le même joueur recommence', () => {
    const cancelled = cancelRun(startRun(game()))
    expect(cancelled.phase).toBe('waiting')
    expect(cancelled.results).toEqual([])
    expect(currentPlayerId(cancelled)).toBe('alice')
    expect(cancelRun(game())).toEqual(game())
  })

  it('le tour suivant commence au joueur suivant', () => {
    const end = playRound(game(), [10_000, 10_000, 10_000])
    const second = nextRound(end)
    expect(second.roundIndex).toBe(1)
    expect(second.order).toEqual(['bob', 'chloe', 'alice'])
    expect(currentPlayerId(second)).toBe('bob')
    expect(second.results).toEqual([])
    expect(second.history).toEqual([{ target: PILE_POIL_FIXED_TARGET_MS, results: end.results }])
    const third = nextRound(playRound(second, [10_000, 10_000, 10_000]))
    expect(third.order).toEqual(['chloe', 'alice', 'bob'])
  })
})

describe('classement du tour', () => {
  it('du plus près au plus loin ; le plus loin boit, le pile poil distribue', () => {
    const ranking = roundRanking([result('max', -590), result('lea', 30), result('sam', 1_620)])
    expect(ranking.map((r) => r.player)).toEqual(['lea', 'max', 'sam'])
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 3])
    expect(ranking[0]).toMatchObject({ bullseye: true, furthest: false, penalty: 0 })
    expect(ranking[1]).toMatchObject({ bullseye: false, furthest: false, penalty: 0 })
    expect(ranking[2]).toMatchObject({ bullseye: false, furthest: true, penalty: 3 })
  })

  it('ex æquo au plus loin : tous concernés, au même rang', () => {
    const ranking = roundRanking([result('a', 100), result('b', -1_200), result('c', 1_200)])
    expect(ranking.filter((r) => r.furthest).map((r) => r.player)).toEqual(['b', 'c'])
    expect(ranking.filter((r) => r.furthest).map((r) => r.penalty)).toEqual([2, 2])
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 2])
  })

  it('que des pile poil : personne n’est puni', () => {
    const ranking = roundRanking([result('a', 0), result('b', -40), result('c', 30)])
    expect(ranking.every((r) => r.bullseye && !r.furthest && r.penalty === 0)).toBe(true)
  })

  it('égalité d’écart : l’ordre de passage départage l’affichage', () => {
    const ranking = roundRanking([result('a', 300), result('b', -300), result('c', 900)])
    expect(ranking.map((r) => r.player)).toEqual(['a', 'b', 'c'])
    expect(ranking.map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('aucun résultat : classement vide', () => {
    expect(roundRanking([])).toEqual([])
  })
})

describe('fin de partie', () => {
  it('après N tours, le plus petit écart cumulé gagne', () => {
    let state = createGame(TABLE, { ...PILE_POIL_DEFAULT_SETTINGS, rounds: 3 }, 7)
    state = { ...state, order: [...TABLE] }
    // Tour 1 : alice 10,03 (pile poil), bob 9,41, chloe 11,62 (le plus loin : 3).
    state = nextRound(playRound(state, [10_030, 9_410, 11_620]))
    // Tour 2 (bob, chloe, alice) : bob 10,50, chloe 10,00 (pile poil), alice 7,00 (le plus loin : 5).
    state = nextRound(playRound(state, [10_500, 10_000, 7_000]))
    expect(state.phase).toBe('waiting')
    // Tour 3 (chloe, alice, bob).
    state = playRound(state, [10_200, 9_900, 12_000])
    expect(state.phase).toBe('roundEnd')
    expect(completedRounds(state)).toHaveLength(3)
    // Le classement « au général » compte déjà le tour qui vient de finir.
    const before = finalRanking(state)
    state = nextRound(state)
    expect(state.phase).toBe('finished')
    expect(state.history).toHaveLength(3)
    expect(nextRound(state)).toBe(state)
    expect(currentPlayerId(state)).toBeNull()

    const ranking = finalRanking(state)
    expect(ranking).toEqual(before)
    expect(ranking.map((r) => [r.player, r.totalGapMs])).toEqual([
      ['chloe', 1_620 + 0 + 200],
      ['bob', 590 + 500 + 2_000],
      ['alice', 30 + 3_000 + 100],
    ])
    expect(ranking.map((r) => r.won)).toEqual([true, false, false])
    expect(ranking.find((r) => r.player === 'alice')).toMatchObject({ bullseyes: 1, penalties: 5 })
    expect(ranking.find((r) => r.player === 'chloe')).toMatchObject({ bullseyes: 1, penalties: 3 })
    expect(ranking.find((r) => r.player === 'bob')).toMatchObject({ bullseyes: 0, penalties: 4 })
  })

  it('égalité en tête : deux gagnants au rang 1', () => {
    const ranking = standings(
      [{ target: 10_000, results: [result('a', 200), result('b', -200), result('c', 900)] }],
      ['a', 'b', 'c']
    )
    expect(ranking.map((r) => [r.player, r.rank, r.won])).toEqual([
      ['a', 1, true],
      ['b', 1, true],
      ['c', 3, false],
    ])
  })

  it('partie complète à 2 joueurs, 8 tours en Variable : bornée et reproductible', () => {
    const run = (seed: string) => {
      let state = createGame(['p1', 'p2'], VARIABLE, seed)
      let steps = 0
      while (state.phase !== 'finished' && steps < 500) {
        steps += 1
        if (state.phase === 'waiting') state = startRun(state)
        else if (state.phase === 'running') state = recordResult(state, state.target + steps * 37)
        else if (state.phase === 'between') state = nextPlayer(state)
        else state = nextRound(state)
      }
      return state
    }
    const done = run('fin')
    expect(done.phase).toBe('finished')
    expect(done.history).toHaveLength(8)
    expect(done.history.every((round) => round.results.length === 2)).toBe(true)
    expect(run('fin')).toEqual(done)
  })
})

describe('reprise (useResumableLocalGame)', () => {
  const NOW = 1_790_000_000_000

  /** Tour 2 entamé : le premier tour est fini, bob a joué, chloe est au chrono. */
  function midGame(): PilePoilState {
    const second = nextRound(playRound(game(), [10_030, 9_410, 11_620]))
    return play(second, 10_200)
  }

  it('sauvegarde → stockage → reprise à l’identique', () => {
    const state = midGame()
    const raw = JSON.stringify({ version: PILE_POIL_SAVE_VERSION, savedAt: NOW - 60_000, state: toPilePoilSave(state) })
    const save = parseLocalGameSave<unknown>(raw, PILE_POIL_SAVE_VERSION, NOW)
    expect(restorePilePoilSave(save, TABLE)).toEqual(state)
    expect(isResumablePilePoilSave(save, TABLE)).toBe(true)
  })

  it('l’ordre de la table peut changer : mêmes joueurs, partie reprise', () => {
    const restored = restorePilePoilSave(toPilePoilSave(midGame()), ['chloe', 'bob', 'alice'])
    expect(restored?.playerIds).toEqual(['chloe', 'bob', 'alice'])
    expect(restored && currentPlayerId(restored)).toBe('chloe')
  })

  it('un chrono en cours ne se reprend pas : l’essai est rejoué', () => {
    const save = toPilePoilSave(startRun(midGame()))
    expect(save?.phase).toBe('waiting')
    expect(restorePilePoilSave(save, TABLE)?.phase).toBe('waiting')
  })

  it('résultat affiché ou classement du tour : repris tel quel', () => {
    const between = recordResult(startRun(midGame()), 10_000)
    expect(between.phase).toBe('between')
    expect(restorePilePoilSave(toPilePoilSave(between), TABLE)).toEqual(between)
    const roundEnd = play(nextPlayer(between), 9_000)
    expect(roundEnd.phase).toBe('roundEnd')
    expect(restorePilePoilSave(toPilePoilSave(roundEnd), TABLE)).toEqual(roundEnd)
  })

  it('partie finie : rien à sauvegarder', () => {
    let state = createGame(TABLE, { ...PILE_POIL_DEFAULT_SETTINGS, rounds: 3 }, 3)
    for (let round = 0; round < 3; round += 1) state = nextRound(playRound(state, [10_000, 10_100, 9_000]))
    expect(state.phase).toBe('finished')
    expect(toPilePoilSave(state)).toBeNull()
  })

  it('autre table : refusée', () => {
    const save = toPilePoilSave(midGame())
    expect(restorePilePoilSave(save, ['alice', 'bob'])).toBeNull()
    expect(restorePilePoilSave(save, ['alice', 'bob', 'denis'])).toBeNull()
    expect(isResumablePilePoilSave(save, ['alice', 'bob'])).toBe(false)
  })

  it('la partie garde ses réglages : un pré-lobby revenu aux réglages par défaut ne l’efface pas', () => {
    // Pro, Variable, 8 tours, au tour 2 : l'onglet est rechargé, le pré-lobby repart sur Normal / 10 s / 5 tours.
    const settings: PilePoilSettings = { ...VARIABLE, level: 'pro' }
    const first = createGame(TABLE, settings, 'rechargement')
    const state = play(nextRound(playRound({ ...first, order: [...TABLE] }, [10_030, 9_410, 11_620])), 10_200)
    const save = toPilePoilSave(state)
    expect(isResumablePilePoilSave(save, TABLE)).toBe(true)
    const restored = restorePilePoilSave(save, TABLE)
    expect(restored?.settings).toEqual(settings)
    expect(restored).toEqual(state)
  })

  it('sauvegarde illisible → null (partie neuve plutôt qu’un plantage)', () => {
    const save = toPilePoilSave(midGame())!
    expect(restorePilePoilSave(null, TABLE)).toBeNull()
    expect(restorePilePoilSave('texte', TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, settings: { ...save.settings, rounds: 4 } }, TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, target: 9_000 }, TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, phase: 'running' }, TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, currentIndex: 7 }, TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, order: ['alice', 'alice', 'bob'] }, TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, results: [] }, TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, results: [{ player: 'bob', elapsedMs: '10' }] }, TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, history: [] }, TABLE)).toBeNull()
    expect(restorePilePoilSave({ ...save, rngState: -1 }, TABLE)).toBeNull()
    expect(isResumablePilePoilSave(undefined, TABLE)).toBe(false)
  })

  it('l’écart est recalculé à la reprise, jamais cru sur parole', () => {
    const save = toPilePoilSave(midGame())!
    const forged = { ...save, results: [{ ...save.results[0], deltaMs: 0 }] }
    const restored = restorePilePoilSave(forged, TABLE)
    expect(restored?.results[0].deltaMs).toBe(save.results[0].deltaMs)
  })
})

describe('horodatage des appuis', () => {
  it('garde l’horodatage du toucher quand il est sur l’horloge de performance.now()', () => {
    expect(pressStamp(1_234.5, 1_250)).toBe(1_234.5)
  })

  it('vieux navigateur (ms depuis 1970, ou 0) : l’instant présent', () => {
    expect(pressStamp(1_790_000_000_000, 1_250)).toBe(1_250)
    expect(pressStamp(0, 1_250)).toBe(1_250)
    expect(pressStamp(Number.NaN, 1_250)).toBe(1_250)
  })

  it('durée mesurée entre deux appuis, jamais négative', () => {
    expect(measuredMs(1_000, 11_030)).toBe(10_030)
    expect(measuredMs(2_000, 1_990)).toBe(0)
  })

  it('double toucher sur « Démarrer » : le second, tombé sur le STOP, ne compte pas', () => {
    expect(isPlausibleStop(pressStamp(1_000, 1_001), pressStamp(1_180, 1_181))).toBe(false)
    expect(isPlausibleStop(1_000, 1_000 + MIN_RUN_MS - 1)).toBe(false)
    expect(isPlausibleStop(2_000, 1_990)).toBe(false)
    expect(isPlausibleStop(1_000, 1_000 + MIN_RUN_MS)).toBe(true)
    expect(isPlausibleStop(1_000, 5_000)).toBe(true)
  })

  it('le seuil reste loin sous la plus petite cible : aucun vrai essai n’est refusé', () => {
    const shortest = Math.min(PILE_POIL_FIXED_TARGET_MS, ...PILE_POIL_VARIABLE_TARGETS_MS)
    expect(MIN_RUN_MS * 5).toBeLessThanOrEqual(shortest)
  })
})

describe('pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now dans le moteur', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    let state = createGame(TABLE, VARIABLE, 'pure')
    state = nextRound(playRound(state, [10_000, 11_000, 9_000]))
    finalRanking(state)
    restorePilePoilSave(toPilePoilSave(state), TABLE)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})
