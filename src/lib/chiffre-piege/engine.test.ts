import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSameLocalTable, parseLocalGameSave } from '@/lib/game-session'
import { createRng, rngFromState } from '@/lib/petit-buveur/rng'
import {
  CHIFFRE_PIEGE_BOOM_READ_MS,
  CHIFFRE_PIEGE_JOKER_PENALTY,
  CHIFFRE_PIEGE_PENALTY_CAP,
  CHIFFRE_PIEGE_RANGES,
  CHIFFRE_PIEGE_SAVE_VERSION,
  chiffrePiegeAttempts,
  chiffrePiegeNextRoundAt,
  chiffrePiegeNextStarterId,
  chiffrePiegeOdds,
  chiffrePiegeRanking,
  chiffrePiegeReadingLeftMs,
  chiffrePiegeStake,
  createChiffrePiegeGame,
  currentChiffrePiegePlayerId,
  guessChiffrePiege,
  hasChiffrePiegeJoker,
  isChiffrePiegeFinished,
  isChiffrePiegeForced,
  isChiffrePiegeReadingOver,
  nextChiffrePiegeRound,
  passChiffrePiege,
  restoreChiffrePiegeSave,
  setChiffrePiegeAway,
  toChiffrePiegePublicView,
  toChiffrePiegeSave,
  type ChiffrePiegeRange,
  type ChiffrePiegeResult,
  type ChiffrePiegeRoundCount,
  type ChiffrePiegeSettings,
  type ChiffrePiegeState,
} from './engine'

const TABLE = ['alice', 'bob', 'chloe']
/** Horloge FIXE : le plancher de lecture du BOUM doit rester déterministe. */
const T0 = 1_790_000_000_000
const SETTINGS: ChiffrePiegeSettings = { max: 100, rounds: 3 }

/** État d'une action acceptée ; un refus fait échouer le test avec son code. */
function accepted(result: ChiffrePiegeResult): ChiffrePiegeState {
  if (!result.ok) throw new Error(`refus inattendu : ${result.error}`)
  return result.state
}

function refusal(result: ChiffrePiegeResult): string | null {
  return result.ok ? null : result.error
}

/** Partie posée à la main : alice au tour, piège en 42, plage 1-100, 3 manches. */
function game(overrides: Partial<ChiffrePiegeState> = {}): ChiffrePiegeState {
  return {
    ...accepted(createChiffrePiegeGame({ playerIds: TABLE, settings: SETTINGS, seed: 'soirée' })),
    turnIndex: 0,
    trap: 42,
    ...overrides,
  }
}

/** Le joueur au tour propose `value`. */
function guess(state: ChiffrePiegeState, value: number, now = T0): ChiffrePiegeResult {
  const playerId = currentChiffrePiegePlayerId(state)
  if (!playerId) throw new Error('personne n’a la main')
  return guessChiffrePiege(state, { playerId, value, now })
}

/** Enchaîne des essais acceptés. */
function guesses(state: ChiffrePiegeState, values: number[]): ChiffrePiegeState {
  return values.reduce((current, value) => accepted(guess(current, value)), state)
}

describe('début de partie', () => {
  it('même graine → même partie', () => {
    const a = createChiffrePiegeGame({ playerIds: TABLE, settings: SETTINGS, seed: 'graine' })
    const b = createChiffrePiegeGame({ playerIds: TABLE, settings: SETTINGS, seed: 'graine' })
    expect(a).toEqual(b)
  })

  it('tire le premier joueur, puis le piège, avec la graine de la partie', () => {
    const state = accepted(createChiffrePiegeGame({ playerIds: TABLE, settings: { max: 200, rounds: 5 }, seed: 42 }))
    const rng = createRng(42)
    expect(state.turnIndex).toBe(rng.pickIndex(TABLE.length))
    expect(state.trap).toBe(rng.int(1, 200))
    expect(state.rngState).toBe(rng.getState())
  })

  it('ouvre l’intervalle complet [1, max], sans essai, joker ni pénalité', () => {
    const state = accepted(createChiffrePiegeGame({ playerIds: TABLE, settings: { max: 50, rounds: 10 }, seed: 'x' }))
    expect(state).toMatchObject({ low: 1, high: 50, max: 50, roundsTotal: 10, roundIndex: 0, phase: 'playing' })
    expect(state.history).toEqual([])
    expect(state.lastBoom).toBeNull()
    expect(state.jokersUsed).toEqual({ alice: false, bob: false, chloe: false })
    expect(state.penalties).toEqual({ alice: 0, bob: 0, chloe: 0 })
    expect(chiffrePiegeStake(state)).toBe(1)
    expect(chiffrePiegeOdds(state)).toBe(50)
  })

  it('le piège tombe toujours dans la plage choisie', () => {
    for (const max of CHIFFRE_PIEGE_RANGES) {
      for (let seed = 0; seed < 200; seed += 1) {
        const { trap } = accepted(createChiffrePiegeGame({ playerIds: TABLE, settings: { max, rounds: 3 }, seed }))
        expect(Number.isInteger(trap)).toBe(true)
        expect(trap).toBeGreaterThanOrEqual(1)
        expect(trap).toBeLessThanOrEqual(max)
      }
    }
  })

  it('refuse une table trop petite, des doublons ou des réglages hors liste', () => {
    const create = (playerIds: string[], settings: ChiffrePiegeSettings = SETTINGS) =>
      refusal(createChiffrePiegeGame({ playerIds, settings, seed: 1 }))
    expect(create(['alice'])).toBe('NOT_ENOUGH_PLAYERS')
    expect(create(['alice', 'alice'])).toBe('INVALID_PLAYERS')
    expect(create(['alice', ''])).toBe('INVALID_PLAYERS')
    expect(create(TABLE, { max: 150 as ChiffrePiegeRange, rounds: 3 })).toBe('INVALID_SETTINGS')
    expect(create(TABLE, { max: 100, rounds: 4 as ChiffrePiegeRoundCount })).toBe('INVALID_SETTINGS')
  })
})

describe('un essai raté', () => {
  it('sous le piège : le bas remonte juste au-dessus et la main passe', () => {
    const state = accepted(guess(game(), 30))
    expect(state.low).toBe(31)
    expect(state.high).toBe(100)
    expect(state.history).toEqual([{ kind: 'guess', playerId: 'alice', value: 30, dir: 'higher' }])
    expect(currentChiffrePiegePlayerId(state)).toBe('bob')
    expect(state.penalties).toEqual({ alice: 0, bob: 0, chloe: 0 })
  })

  it('au-dessus du piège : le haut redescend juste en dessous', () => {
    const state = accepted(guess(game(), 60))
    expect(state.low).toBe(1)
    expect(state.high).toBe(59)
    expect(state.history[0]).toEqual({ kind: 'guess', playerId: 'alice', value: 60, dir: 'lower' })
  })

  it('l’intervalle se resserre essai après essai, dans l’ordre de la table', () => {
    const state = guesses(game(), [30, 60, 40, 45])
    expect(state.low).toBe(41)
    expect(state.high).toBe(44)
    expect(state.history.map((move) => move.playerId)).toEqual(['alice', 'bob', 'chloe', 'alice'])
    expect(currentChiffrePiegePlayerId(state)).toBe('bob')
    expect(chiffrePiegeAttempts(state)).toBe(4)
    expect(chiffrePiegeOdds(state)).toBe(4)
    expect(chiffrePiegeStake(state)).toBe(5)
  })

  it('la main fait le tour et revient au premier', () => {
    const state = guesses(game({ turnIndex: 2 }), [10, 90])
    expect(state.history.map((move) => move.playerId)).toEqual(['chloe', 'alice'])
    expect(currentChiffrePiegePlayerId(state)).toBe('bob')
  })

  it('refuse hors de l’intervalle ou un nombre non entier, sans pénalité ni changement de main', () => {
    const state = accepted(guess(game(), 30))
    expect(refusal(guess(state, 30))).toBe('OUT_OF_RANGE')
    expect(refusal(guess(state, 0))).toBe('OUT_OF_RANGE')
    expect(refusal(guess(state, 101))).toBe('OUT_OF_RANGE')
    expect(refusal(guess(state, 41.5))).toBe('NOT_AN_INTEGER')
    expect(refusal(guess(state, Number.NaN))).toBe('NOT_AN_INTEGER')
    expect(currentChiffrePiegePlayerId(state)).toBe('bob')
    expect(state.penalties.bob).toBe(0)
  })

  it('refuse le joueur qui n’a pas la main, ou un inconnu', () => {
    const state = game()
    expect(refusal(guessChiffrePiege(state, { playerId: 'bob', value: 50, now: T0 }))).toBe('NOT_YOUR_TURN')
    expect(refusal(guessChiffrePiege(state, { playerId: 'zoé', value: 50, now: T0 }))).toBe('UNKNOWN_PLAYER')
  })
})

describe('BOUM', () => {
  it('pile sur le piège : une pénalité par essai de la manche, celui-ci compris', () => {
    const state = accepted(guess(guesses(game(), [30, 60]), 42, T0 + 5))
    expect(state.phase).toBe('boom')
    expect(state.lastBoom).toEqual({ playerId: 'chloe', trap: 42, attempts: 3, penalty: 3, roundIndex: 0, at: T0 + 5 })
    expect(state.penalties).toEqual({ alice: 0, bob: 0, chloe: 3 })
    expect(state.booms).toEqual({ alice: 0, bob: 0, chloe: 1 })
    expect(currentChiffrePiegePlayerId(state)).toBeNull()
  })

  it('tomber dessus au premier essai ne coûte que 1', () => {
    const state = accepted(guess(game(), 42))
    expect(state.lastBoom?.penalty).toBe(1)
    expect(state.penalties.alice).toBe(1)
  })

  it('le BOUM est plafonné à 5, même après dix essais', () => {
    const state = accepted(guess(guesses(game({ trap: 100 }), [1, 2, 3, 4, 5, 6, 7, 8, 9]), 100))
    expect(state.lastBoom?.attempts).toBe(10)
    expect(state.lastBoom?.penalty).toBe(CHIFFRE_PIEGE_PENALTY_CAP)
  })

  it('l’enjeu affiché annonce ce que prendra le prochain qui tombe dessus', () => {
    const stakes = [0, 1, 2, 3, 4, 5, 6].map((n) =>
      chiffrePiegeStake(guesses(game({ trap: 100 }), [1, 2, 3, 4, 5, 6].slice(0, n)))
    )
    expect(stakes).toEqual([1, 2, 3, 4, 5, 5, 5])
  })

  it('les jokers ne comptent pas comme des essais', () => {
    let state = accepted(guess(game(), 10))
    state = accepted(passChiffrePiege(state, { playerId: 'bob' }))
    expect(chiffrePiegeAttempts(state)).toBe(1)
    expect(chiffrePiegeStake(state)).toBe(2)
    expect(accepted(guess(state, 42)).lastBoom).toMatchObject({ playerId: 'chloe', attempts: 2, penalty: 2 })
  })

  it('plus aucun coup pendant le BOUM', () => {
    const state = accepted(guess(game(), 42))
    expect(refusal(guessChiffrePiege(state, { playerId: 'bob', value: 50, now: T0 }))).toBe('WRONG_PHASE')
    expect(refusal(passChiffrePiege(state, { playerId: 'bob' }))).toBe('WRONG_PHASE')
  })
})

describe('dernier nombre', () => {
  it('quand il ne reste qu’un nombre, c’est le piège : le jouer fait BOUM', () => {
    const state = guesses(game(), [41, 43])
    expect(state.low).toBe(42)
    expect(state.high).toBe(42)
    expect(isChiffrePiegeForced(state)).toBe(true)
    expect(chiffrePiegeOdds(state)).toBe(1)
    expect(refusal(guess(state, 41))).toBe('OUT_OF_RANGE')
    const boom = accepted(guess(state, 42))
    expect(boom.lastBoom).toMatchObject({ playerId: 'chloe', trap: 42, attempts: 3, penalty: 3 })
    expect(isChiffrePiegeForced(boom)).toBe(false)
  })

  it('le joker esquive le dernier nombre ; sans joker, il faut le jouer', () => {
    let state = guesses(game(), [41, 43])
    state = accepted(passChiffrePiege(state, { playerId: 'chloe' }))
    state = accepted(passChiffrePiege(state, { playerId: 'alice' }))
    state = accepted(passChiffrePiege(state, { playerId: 'bob' }))
    expect(isChiffrePiegeForced(state)).toBe(true)
    expect(currentChiffrePiegePlayerId(state)).toBe('chloe')
    expect(refusal(passChiffrePiege(state, { playerId: 'chloe' }))).toBe('JOKER_USED')
    const boom = accepted(guess(state, 42))
    expect(boom.lastBoom).toMatchObject({ playerId: 'chloe', attempts: 3, penalty: 3 })
    expect(boom.penalties).toEqual({ alice: 1, bob: 1, chloe: 4 })
  })
})

describe('joker « Je passe »', () => {
  it('saute le tour contre 1, sans toucher à l’intervalle', () => {
    const state = accepted(passChiffrePiege(game(), { playerId: 'alice' }))
    expect(state.penalties.alice).toBe(CHIFFRE_PIEGE_JOKER_PENALTY)
    expect(state.jokersUsed.alice).toBe(true)
    expect(state.history).toEqual([{ kind: 'pass', playerId: 'alice' }])
    expect(state.low).toBe(1)
    expect(state.high).toBe(100)
    expect(currentChiffrePiegePlayerId(state)).toBe('bob')
    expect(hasChiffrePiegeJoker(state, 'alice')).toBe(false)
    expect(hasChiffrePiegeJoker(state, 'bob')).toBe(true)
  })

  it('un seul par joueur et par partie, même d’une manche à l’autre', () => {
    let state = accepted(passChiffrePiege(game(), { playerId: 'alice' }))
    state = guesses(state, [10, 90])
    expect(currentChiffrePiegePlayerId(state)).toBe('alice')
    expect(refusal(passChiffrePiege(state, { playerId: 'alice' }))).toBe('JOKER_USED')
    state = accepted(nextChiffrePiegeRound(accepted(guess(state, 42)), { now: T0 + CHIFFRE_PIEGE_BOOM_READ_MS }))
    expect(state.jokersUsed.alice).toBe(true)
    expect(hasChiffrePiegeJoker(state, 'alice')).toBe(false)
  })

  it('refusé à qui n’a pas la main, ou à un inconnu', () => {
    expect(refusal(passChiffrePiege(game(), { playerId: 'bob' }))).toBe('NOT_YOUR_TURN')
    expect(refusal(passChiffrePiege(game(), { playerId: 'zoé' }))).toBe('UNKNOWN_PLAYER')
    expect(hasChiffrePiegeJoker(game(), 'zoé')).toBe(false)
  })
})

describe('manche suivante', () => {
  /** chloe (3e de la table) tombe sur le piège au 3e essai, à T0. */
  const boomOfChloe = () => accepted(guess(guesses(game(), [30, 60]), 42))

  it('repart du voisin du perdant, avec un nouveau piège et l’intervalle complet', () => {
    const boom = boomOfChloe()
    expect(chiffrePiegeNextStarterId(boom)).toBe('alice')
    const next = accepted(nextChiffrePiegeRound(boom, { now: T0 + CHIFFRE_PIEGE_BOOM_READ_MS }))
    expect(next).toMatchObject({ phase: 'playing', roundIndex: 1, low: 1, high: 100 })
    expect(next.history).toEqual([])
    expect(currentChiffrePiegePlayerId(next)).toBe('alice')
    const rng = rngFromState(boom.rngState)
    expect(next.trap).toBe(rng.int(1, 100))
    expect(next.rngState).toBe(rng.getState())
    // Le BOUM précédent et les pénalités restent au tableau.
    expect(next.penalties).toEqual(boom.penalties)
    expect(next.lastBoom).toEqual(boom.lastBoom)
  })

  it('le voisin du perdant, pas celui qui avait ouvert la manche', () => {
    const boom = accepted(guess(game({ turnIndex: 1 }), 42))
    expect(boom.lastBoom?.playerId).toBe('bob')
    const next = accepted(nextChiffrePiegeRound(boom, { now: T0 + CHIFFRE_PIEGE_BOOM_READ_MS }))
    expect(currentChiffrePiegePlayerId(next)).toBe('chloe')
  })

  it('attend le temps de lecture du BOUM, sauf pour la machine', () => {
    const boom = boomOfChloe()
    expect(chiffrePiegeNextRoundAt(boom)).toBe(T0 + CHIFFRE_PIEGE_BOOM_READ_MS)
    expect(refusal(nextChiffrePiegeRound(boom, { now: T0 + CHIFFRE_PIEGE_BOOM_READ_MS - 1 }))).toBe('READING_TIME')
    expect(nextChiffrePiegeRound(boom, { now: T0, skipReadingTime: true }).ok).toBe(true)
  })

  it('une horloge revenue avant le BOUM vaut lecture faite : rien ne reste bloqué pendant le recul', () => {
    const boom = boomOfChloe()
    expect(isChiffrePiegeReadingOver(boom, T0 - 1)).toBe(true)
    expect(nextChiffrePiegeRound(boom, { now: T0 - 3_600_000 }).ok).toBe(true)
    // Après le BOUM, seul ce qui reste à lire attend.
    expect(isChiffrePiegeReadingOver(boom, T0 + 500)).toBe(false)
    expect(refusal(nextChiffrePiegeRound(boom, { now: T0 + 500 }))).toBe('READING_TIME')
    expect(isChiffrePiegeReadingOver(game(), T0)).toBe(false)
  })

  it('reste à lire : jamais plus que le temps de lecture, 0 une fois fini ou l’horloge revenue avant le BOUM', () => {
    const boom = boomOfChloe()
    expect(chiffrePiegeReadingLeftMs(boom, T0)).toBe(CHIFFRE_PIEGE_BOOM_READ_MS)
    expect(chiffrePiegeReadingLeftMs(boom, T0 + 1_000)).toBe(CHIFFRE_PIEGE_BOOM_READ_MS - 1_000)
    expect(chiffrePiegeReadingLeftMs(boom, T0 + CHIFFRE_PIEGE_BOOM_READ_MS)).toBe(0)
    expect(chiffrePiegeReadingLeftMs(boom, T0 - 3_600_000)).toBe(0)
    expect(chiffrePiegeReadingLeftMs(game(), T0)).toBeNull()
  })

  it('refusée tant que personne n’est tombé sur le piège', () => {
    expect(refusal(nextChiffrePiegeRound(game(), { now: T0 }))).toBe('WRONG_PHASE')
    expect(chiffrePiegeNextRoundAt(game())).toBeNull()
    expect(chiffrePiegeNextStarterId(game())).toBeNull()
  })
})

describe('fin de partie', () => {
  it('se termine après la dernière manche, sans nouveau tirage', () => {
    const boom = accepted(guess(game({ roundIndex: 2 }), 42))
    expect(chiffrePiegeNextStarterId(boom)).toBeNull()
    const end = accepted(nextChiffrePiegeRound(boom, { now: T0 + CHIFFRE_PIEGE_BOOM_READ_MS }))
    expect(end.phase).toBe('finished')
    expect(isChiffrePiegeFinished(end)).toBe(true)
    expect(end.rngState).toBe(boom.rngState)
    expect(end.roundIndex).toBe(2)
    expect(currentChiffrePiegePlayerId(end)).toBeNull()
    expect(refusal(guessChiffrePiege(end, { playerId: 'alice', value: 1, now: T0 }))).toBe('WRONG_PHASE')
    expect(refusal(nextChiffrePiegeRound(end, { now: T0 + 60_000 }))).toBe('WRONG_PHASE')
  })

  it('classement du moins au plus pénalisé, ex æquo à la même place', () => {
    const state = game({
      penalties: { alice: 3, bob: 1, chloe: 3 },
      booms: { alice: 1, bob: 0, chloe: 2 },
      jokersUsed: { alice: false, bob: true, chloe: false },
    })
    expect(chiffrePiegeRanking(state)).toEqual([
      { playerId: 'bob', penalty: 1, booms: 0, jokerUsed: true, rank: 1 },
      { playerId: 'alice', penalty: 3, booms: 1, jokerUsed: false, rank: 2 },
      { playerId: 'chloe', penalty: 3, booms: 2, jokerUsed: false, rank: 2 },
    ])
  })

  it('tout le monde à égalité : tous premiers', () => {
    expect(chiffrePiegeRanking(game()).map((row) => row.rank)).toEqual([1, 1, 1])
  })
})

describe('partie complète simulée', () => {
  /** Chacun tire au hasard dans l’intervalle et grille son joker sur le dernier nombre. */
  function playWholeGame(seed: string, settings: ChiffrePiegeSettings) {
    const pick = createRng(`${seed}#coups`)
    let state = accepted(createChiffrePiegeGame({ playerIds: TABLE, settings, seed }))
    let now = T0
    let steps = 0
    while (!isChiffrePiegeFinished(state) && steps < 10_000) {
      steps += 1
      now += CHIFFRE_PIEGE_BOOM_READ_MS
      if (state.phase === 'boom') {
        state = accepted(nextChiffrePiegeRound(state, { now }))
        continue
      }
      if (state.trap < state.low || state.trap > state.high) throw new Error('piège hors de l’intervalle')
      const playerId = currentChiffrePiegePlayerId(state)
      if (!playerId) throw new Error('personne n’a la main')
      state =
        isChiffrePiegeForced(state) && hasChiffrePiegeJoker(state, playerId)
          ? accepted(passChiffrePiege(state, { playerId }))
          : accepted(guessChiffrePiege(state, { playerId, value: pick.int(state.low, state.high), now }))
    }
    return { state, steps }
  }

  it('va au bout des manches, un BOUM par manche, reproductible à graine égale', () => {
    const a = playWholeGame('soirée-complète', { max: 200, rounds: 10 })
    const b = playWholeGame('soirée-complète', { max: 200, rounds: 10 })
    expect(a.state.phase).toBe('finished')
    expect(a).toEqual(b)
    const booms = TABLE.reduce((sum, id) => sum + a.state.booms[id], 0)
    expect(booms).toBe(10)
    const jokers = TABLE.filter((id) => a.state.jokersUsed[id]).length
    const total = TABLE.reduce((sum, id) => sum + a.state.penalties[id], 0)
    expect(total).toBeGreaterThanOrEqual(booms + jokers)
    expect(total).toBeLessThanOrEqual(booms * CHIFFRE_PIEGE_PENALTY_CAP + jokers)
  })
})

describe('vue publique', () => {
  it('ne transmet ni le piège en cours ni la graine', () => {
    const state = guesses(game({ trap: 77 }), [30])
    const view = toChiffrePiegePublicView(state)
    expect(view).not.toHaveProperty('trap')
    expect(view).not.toHaveProperty('rngState')
    expect(JSON.stringify(view)).not.toContain('77')
  })

  it('suffit à dessiner l’écran', () => {
    const state = guesses(game(), [30, 60])
    const view = toChiffrePiegePublicView(state)
    expect(currentChiffrePiegePlayerId(view)).toBe(currentChiffrePiegePlayerId(state))
    expect(chiffrePiegeStake(view)).toBe(3)
    expect(chiffrePiegeOdds(view)).toBe(29)
    expect(isChiffrePiegeForced(view)).toBe(false)
    expect(chiffrePiegeRanking(view)).toEqual(chiffrePiegeRanking(state))
  })

  it('le piège ne devient public qu’une fois tombé, dans le BOUM', () => {
    const view = toChiffrePiegePublicView(accepted(guess(game(), 42)))
    expect(view.lastBoom?.trap).toBe(42)
  })
})

describe('pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now : le hasard vient de la graine, l’heure du paramètre', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    let state = accepted(createChiffrePiegeGame({ playerIds: TABLE, settings: SETTINGS, seed: 'pur' }))
    state = accepted(passChiffrePiege(state, { playerId: currentChiffrePiegePlayerId(state) ?? '' }))
    state = accepted(guessChiffrePiege(state, { playerId: currentChiffrePiegePlayerId(state) ?? '', value: state.trap, now: T0 }))
    state = accepted(nextChiffrePiegeRound(state, { now: T0 + CHIFFRE_PIEGE_BOOM_READ_MS }))
    chiffrePiegeRanking(state)
    restoreChiffrePiegeSave(toChiffrePiegeSave(state), TABLE)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})

describe('absences', () => {
  it('le partant qui avait la main la passe, et la main le saute ensuite', () => {
    let state = accepted(setChiffrePiegeAway(game(), { playerId: 'alice', away: true }))
    expect(currentChiffrePiegePlayerId(state)).toBe('bob')
    expect(state.penalties.alice).toBe(0)
    expect(state.jokersUsed.alice).toBe(false)
    state = guesses(state, [10, 90])
    expect(currentChiffrePiegePlayerId(state)).toBe('bob')
  })

  it('un BOUM ouvre la manche suivante au prochain présent', () => {
    let state = accepted(setChiffrePiegeAway(game({ turnIndex: 2 }), { playerId: 'alice', away: true }))
    state = accepted(guess(state, 42))
    expect(state.lastBoom?.playerId).toBe('chloe')
    expect(chiffrePiegeNextStarterId(state)).toBe('bob')
  })

  it('le retour remet le joueur dans la rotation ; refus lisibles sinon', () => {
    const away = accepted(setChiffrePiegeAway(game({ turnIndex: 2 }), { playerId: 'alice', away: true }))
    expect(refusal(setChiffrePiegeAway(away, { playerId: 'alice', away: true }))).toBe('ALREADY_AWAY')
    expect(refusal(setChiffrePiegeAway(game(), { playerId: 'alice', away: false }))).toBe('NOT_AWAY')
    expect(refusal(setChiffrePiegeAway(game(), { playerId: 'zoé', away: true }))).toBe('UNKNOWN_PLAYER')
    const back = accepted(setChiffrePiegeAway(away, { playerId: 'alice', away: false }))
    expect(currentChiffrePiegePlayerId(accepted(guess(back, 10)))).toBe('alice')
  })
})

describe('reprise (useResumableLocalGame)', () => {
  const NOW = T0 + 60_000

  /** Enveloppe telle que l’écrit writeLocalGameSave, relue par parseLocalGameSave. */
  function roundTrip(state: ChiffrePiegeState): unknown {
    const raw = JSON.stringify({ version: CHIFFRE_PIEGE_SAVE_VERSION, savedAt: NOW - 1_000, state: toChiffrePiegeSave(state) })
    return parseLocalGameSave<unknown>(raw, CHIFFRE_PIEGE_SAVE_VERSION, NOW)
  }

  it('reprend la partie à l’identique', () => {
    const state = accepted(passChiffrePiege(guesses(game(), [30, 60]), { playerId: 'chloe' }))
    expect(restoreChiffrePiegeSave(roundTrip(state), TABLE)).toEqual(state)
  })

  it('reprend un BOUM resté à l’écran : la manche suivante passe aussitôt', () => {
    const boom = accepted(guess(game(), 42))
    const restored = restoreChiffrePiegeSave(roundTrip(boom), TABLE)
    expect(restored?.phase).toBe('boom')
    expect(nextChiffrePiegeRound(restored as ChiffrePiegeState, { now: NOW }).ok).toBe(true)
  })

  it('reprend un BOUM daté du futur (horloge reculée depuis) sans le laisser bloqué', () => {
    const boom = accepted(guess(game(), 42, NOW + 3_600_000))
    const restored = restoreChiffrePiegeSave(roundTrip(boom), TABLE) as ChiffrePiegeState
    expect(restored.phase).toBe('boom')
    expect(chiffrePiegeReadingLeftMs(restored, NOW)).toBe(0)
    expect(nextChiffrePiegeRound(restored, { now: NOW }).ok).toBe(true)
  })

  it('retrouve le joueur au tour par identifiant quand l’ordre de la table change', () => {
    const state = guesses(game(), [30])
    const restored = restoreChiffrePiegeSave(roundTrip(state), ['chloe', 'alice', 'bob'])
    expect(restored?.playerIds).toEqual(['chloe', 'alice', 'bob'])
    expect(currentChiffrePiegePlayerId(restored as ChiffrePiegeState)).toBe('bob')
  })

  it('refuse une autre table, une partie finie ou une sauvegarde illisible', () => {
    const save = toChiffrePiegeSave(guesses(game(), [30]))
    expect(isSameLocalTable(save.playerIds, [{ id: 'alice' }, { id: 'bob' }])).toBe(false)
    expect(restoreChiffrePiegeSave(save, ['alice', 'bob'])).toBeNull()
    expect(restoreChiffrePiegeSave(save, ['alice', 'bob', 'zoé'])).toBeNull()
    expect(restoreChiffrePiegeSave(null, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave('texte', TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, phase: 'finished' }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, max: 150 }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, trap: 20 }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, low: '31' }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, roundIndex: 3 }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, turnIndex: 3 }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, rngState: -1 }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, penalties: { alice: 'deux' } }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, jokersUsed: { alice: 1 } }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, history: [{ kind: 'guess', playerId: 'zoé', value: 3, dir: 'higher' }] }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, history: [{ kind: 'guess', playerId: 'bob', value: 3, dir: 'up' }] }, TABLE)).toBeNull()
    expect(restoreChiffrePiegeSave({ ...save, phase: 'boom', lastBoom: null }, TABLE)).toBeNull()
  })

  it('complète des compteurs absents et ignore un absent qui n’est plus à la table', () => {
    const save = toChiffrePiegeSave(game())
    const restored = restoreChiffrePiegeSave(
      { ...save, penalties: { alice: 2 }, booms: {}, jokersUsed: {}, awayIds: ['zoé'] },
      TABLE
    )
    expect(restored?.penalties).toEqual({ alice: 2, bob: 0, chloe: 0 })
    expect(restored?.booms).toEqual({ alice: 0, bob: 0, chloe: 0 })
    expect(restored?.awayIds).toEqual([])
  })
})
