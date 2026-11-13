import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseLocalGameSave, isSameLocalTable } from '@/lib/game-session'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  FC_COUNTDOWN_MS,
  FC_DEFAULT_SETTINGS,
  FC_SAVE_VERSION,
  createGame,
  currentGuesserId,
  drawMode,
  endTurn,
  extendPhase,
  extraGuessers,
  flagSaid,
  guesserOrder,
  isPhaseOver,
  markFound,
  markPassed,
  nextTurn,
  nextWord,
  playerResults,
  ranking,
  readFcSettings,
  restoreFcSave,
  startCountdown,
  startPlaying,
  teamOfPlayer,
  teamsOf,
  toFcSave,
  turnSummary,
  turnsPerTeam,
  unflagSaid,
  upcomingGuesserId,
  cancelTurn,
  type FcSettings,
  type FcState,
  type FcWord,
} from './engine'

const TABLE = ['alice', 'bob', 'chloe']
/** Horloge FIXE : les échéances doivent rester déterministes. */
const T0 = 1_700_000_000_000

const WORDS: FcWord[] = [
  { id: 'fr-cinema-01', theme: 'cinema', word: 'Titanic', modes: ['describe', 'mime'] },
  { id: 'fr-cinema-02', theme: 'cinema', word: 'Le Roi lion', modes: ['describe', 'mime', 'hum'] },
  { id: 'fr-animaux-01', theme: 'animaux', word: 'Girafe', modes: ['describe', 'mime'] },
  { id: 'fr-animaux-02', theme: 'animaux', word: 'Pingouin', modes: ['describe', 'mime'] },
  { id: 'fr-musique-01', theme: 'musique', word: 'Joyeux anniversaire', modes: ['describe', 'hum'] },
  { id: 'fr-lieux-01', theme: 'lieux', word: 'La tour Eiffel', modes: ['describe'] },
]

function settings(overrides: Partial<FcSettings> = {}): FcSettings {
  return { ...FC_DEFAULT_SETTINGS, ...overrides }
}

function game(overrides: Partial<FcSettings> = {}, seed: string | number = 'soirée'): FcState {
  return createGame({ settings: settings(overrides), playerIds: TABLE, seed })
}

/** Tour lancé : décompte passé, chrono parti à T0, premier mot affiché. */
function playing(state: FcState, words: readonly FcWord[] = WORDS): FcState {
  return startPlaying(startCountdown(state, T0 - FC_COUNTDOWN_MS), words, T0)
}

describe('rotation des devineurs', () => {
  it('chacun pour soi : l’ordre de la table, autant de fois qu’il y a de tours', () => {
    expect(guesserOrder(TABLE, 'solo', 1)).toEqual(['alice', 'bob', 'chloe'])
    expect(guesserOrder(TABLE, 'solo', 2)).toEqual(['alice', 'bob', 'chloe', 'alice', 'bob', 'chloe'])
  })

  it('le premier devineur est le premier de la table, et la partie démarre sur « Prêt »', () => {
    const state = game()
    expect(state.roundPhase).toBe('ready')
    expect(currentGuesserId(state)).toBe('alice')
    expect(upcomingGuesserId(state)).toBe('bob')
  })

  it('chaque joueur est devineur le nombre de tours voulu, puis la partie se termine', () => {
    let state = game({ rounds: 2 })
    const seen: string[] = []
    for (let turn = 0; turn < 6; turn += 1) {
      seen.push(currentGuesserId(state) ?? '?')
      state = nextTurn(endTurn(playing(state)))
    }
    expect(seen).toEqual(['alice', 'bob', 'chloe', 'alice', 'bob', 'chloe'])
    expect(state.roundPhase).toBe('finished')
    expect(currentGuesserId(state)).toBeNull()
  })

  it('une table vide ne démarre rien', () => {
    expect(createGame({ settings: settings(), playerIds: [], seed: 1 }).roundPhase).toBe('finished')
  })
})

describe('équipes', () => {
  it('répartit les joueurs en alternance dans l’ordre de la table : A, B, A, B…', () => {
    expect(teamsOf(['p1', 'p2', 'p3', 'p4', 'p5'])).toEqual({ A: ['p1', 'p3', 'p5'], B: ['p2', 'p4'] })
    expect(teamOfPlayer(['p1', 'p2', 'p3'], 'p2')).toBe('B')
    expect(teamOfPlayer(['p1', 'p2', 'p3'], 'zoé')).toBeNull()
  })

  it('les devineurs alternent A/B et les deux équipes ont autant de tours', () => {
    const order = guesserOrder(['p1', 'p2', 'p3', 'p4', 'p5'], 'teams', 1)
    expect(order).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p2'])
    const teams = order.map((id) => teamOfPlayer(['p1', 'p2', 'p3', 'p4', 'p5'], id))
    expect(teams).toEqual(['A', 'B', 'A', 'B', 'A', 'B'])
  })

  it('deux tours : chacun passe au moins deux fois', () => {
    const table = ['p1', 'p2', 'p3', 'p4', 'p5']
    const order = guesserOrder(table, 'teams', 2)
    for (const id of table) expect(order.filter((guesser) => guesser === id).length).toBeGreaterThanOrEqual(2)
    expect(order.filter((id) => teamOfPlayer(table, id) === 'A')).toHaveLength(order.length / 2)
  })

  it('équipes inégales : autant de tours par équipe, et la pré-partie sait qui repasse', () => {
    const table = ['lea', 'max', 'jb']
    expect(guesserOrder(table, 'teams', 1)).toEqual(['lea', 'max', 'jb', 'max'])
    expect(turnsPerTeam(table, 1)).toBe(2)
    expect(turnsPerTeam(table, 2)).toBe(4)
    expect(extraGuessers(table, 'teams', 1)).toEqual([{ playerId: 'max', count: 2 }])
    expect(extraGuessers(table, 'teams', 2)).toEqual([{ playerId: 'max', count: 4 }])
    const five = ['p1', 'p2', 'p3', 'p4', 'p5']
    expect(extraGuessers(five, 'teams', 1)).toEqual([{ playerId: 'p2', count: 2 }])
    expect(extraGuessers(five, 'teams', 2)).toEqual([
      { playerId: 'p2', count: 3 },
      { playerId: 'p4', count: 3 },
    ])
    for (const rounds of [1, 2]) {
      const counted = extraGuessers(five, 'teams', rounds)
      const order = guesserOrder(five, 'teams', rounds)
      for (const id of five) {
        const expected = counted.find((extra) => extra.playerId === id)?.count ?? rounds
        expect(order.filter((guesser) => guesser === id)).toHaveLength(expected)
      }
    }
  })

  it('équipes égales ou chacun pour soi : personne ne repasse', () => {
    expect(extraGuessers(['p1', 'p2', 'p3', 'p4'], 'teams', 2)).toEqual([])
    expect(extraGuessers(['p1', 'p2', 'p3'], 'solo', 1)).toEqual([])
    expect(extraGuessers([], 'teams', 1)).toEqual([])
  })

  it('le score d’équipe est la somme de ses joueurs', () => {
    let state = createGame({ settings: settings({ teamMode: 'teams' }), playerIds: ['p1', 'p2', 'p3', 'p4'], seed: 3 })
    state = { ...state, scores: { ...state.scores, p1: { found: 3, passed: 1, said: 0, turns: 1 }, p3: { found: 2, passed: 0, said: 1, turns: 1 }, p2: { found: 4, passed: 2, said: 0, turns: 1 } } }
    const alcool = ranking(state, 'alcool')
    expect(alcool.map((entry) => [entry.id, entry.score])).toEqual([['A', 5], ['B', 4]])
    expect(alcool[0].playerIds).toEqual(['p1', 'p3'])
    const soft = ranking(state, 'soft')
    // A : 5 trouvés − 1 passé − 2 (un mot prononcé) = 2 ; B : 4 − 2 = 2 → égalité, personne n'a de bonus.
    expect(soft.map((entry) => [entry.id, entry.total, entry.best])).toEqual([['A', 2, false], ['B', 2, false]])
  })
})

describe('consignes', () => {
  it('« Décris seulement » force la consigne, sans tirage', () => {
    const rng = createRng('x')
    const before = rng.getState()
    expect(drawMode(WORDS[1], 'describe', rng)).toBe('describe')
    expect(rng.getState()).toBe(before)
  })

  it('Mélange : seulement les consignes que le mot autorise', () => {
    const rng = createRng('consignes')
    for (let i = 0; i < 300; i += 1) {
      expect(['describe', 'mime']).toContain(drawMode(WORDS[0], 'mix', rng))
      expect(['describe', 'hum']).toContain(drawMode(WORDS[4], 'mix', rng))
      expect(drawMode(WORDS[5], 'mix', rng)).toBe('describe')
    }
  })

  it('Mélange : pondération 50 / 35 / 15 quand les trois sont permises', () => {
    const rng = createRng('poids')
    const counts = { describe: 0, mime: 0, hum: 0 }
    for (let i = 0; i < 4000; i += 1) counts[drawMode(WORDS[1], 'mix', rng)] += 1
    expect(counts.describe / 4000).toBeGreaterThan(0.45)
    expect(counts.describe / 4000).toBeLessThan(0.55)
    expect(counts.mime / 4000).toBeGreaterThan(0.3)
    expect(counts.mime / 4000).toBeLessThan(0.4)
    expect(counts.hum / 4000).toBeGreaterThan(0.11)
    expect(counts.hum / 4000).toBeLessThan(0.19)
  })

  it('un mot sans consigne connue se décrit', () => {
    const odd: FcWord = { id: 'x', theme: 'objets', word: 'Chaise', modes: [] }
    expect(drawMode(odd, 'mix', createRng(1))).toBe('describe')
  })
})

describe('pioche sans remise', () => {
  it('ne tire que dans les thèmes choisis', () => {
    let state = playing(game({ themes: ['animaux'] }))
    const seen = new Set<string>()
    for (let i = 0; i < 6; i += 1) {
      seen.add(state.current?.wordId ?? '')
      state = markFound(state, WORDS, T0 + i)
    }
    expect([...seen].sort()).toEqual(['fr-animaux-01', 'fr-animaux-02'])
  })

  it('aucun mot ne revient avant que toute la pioche soit passée', () => {
    let state = playing(game())
    const drawn: string[] = [state.current?.wordId ?? '']
    for (let i = 0; i < WORDS.length - 1; i += 1) {
      state = markPassed(state, WORDS, T0 + i)
      drawn.push(state.current?.wordId ?? '')
    }
    expect(new Set(drawn).size).toBe(WORDS.length)
  })

  it('pioche épuisée : elle se reforme, sans redonner le mot qu’on vient de voir', () => {
    let state = playing(game({ themes: ['cinema'] }))
    for (let i = 0; i < 20; i += 1) {
      const previous = state.current?.wordId
      state = markFound(state, WORDS, T0 + i)
      expect(state.current?.wordId).not.toBe(previous)
    }
  })

  it('la pioche est gardée d’un tour à l’autre et transmise à « Rejouer »', () => {
    let state = playing(game({ themes: ['animaux', 'cinema'] }))
    const first = state.current?.wordId
    state = nextTurn(endTurn(state))
    expect(state.deckUsed).toContain(first)
    const replay = createGame({ settings: state.settings, playerIds: TABLE, seed: 9, deckUsed: state.deckUsed })
    expect(replay.deckUsed).toEqual(state.deckUsed)
  })

  it('pioche vide (aucun mot chargé) : plus de mot courant, rien ne plante', () => {
    const state = playing(game(), [])
    expect(state.roundPhase).toBe('playing')
    expect(state.current).toBeNull()
    expect(markFound(state, [], T0 + 1)).toBe(state)
  })

  it('même graine → mêmes mots, mêmes consignes', () => {
    const run = () => {
      let state = playing(game({}, 'graine'))
      const seen: string[] = []
      for (let i = 0; i < 5; i += 1) {
        seen.push(`${state.current?.wordId}/${state.current?.mode}`)
        state = markFound(state, WORDS, T0 + i)
      }
      return seen
    }
    expect(run()).toEqual(run())
  })
})

describe('chrono et gestes', () => {
  it('« Prêt » lance un décompte de 3 s, puis le chrono de la durée choisie', () => {
    const ready = game({ durationSec: 45 })
    const countdown = startCountdown(ready, T0)
    expect(countdown.roundPhase).toBe('countdown')
    expect(countdown.phaseEndsAt).toBe(T0 + FC_COUNTDOWN_MS)
    expect(isPhaseOver(countdown, T0 + FC_COUNTDOWN_MS - 1)).toBe(false)
    expect(isPhaseOver(countdown, T0 + FC_COUNTDOWN_MS)).toBe(true)
    const live = startPlaying(countdown, WORDS, T0 + FC_COUNTDOWN_MS)
    expect(live.roundPhase).toBe('playing')
    expect(live.phaseEndsAt).toBe(T0 + FC_COUNTDOWN_MS + 45_000)
    expect(live.current).not.toBeNull()
  })

  it('trouvé et passé s’inscrivent au journal du tour avec leur consigne', () => {
    let state = playing(game())
    const first = state.current
    state = markFound(state, WORDS, T0 + 1_000)
    const second = state.current
    state = markPassed(state, WORDS, T0 + 2_000)
    expect(state.turnLog).toEqual([
      { wordId: first?.wordId, result: 'found', mode: first?.mode },
      { wordId: second?.wordId, result: 'passed', mode: second?.mode },
    ])
  })

  it('un geste après la sonnerie ne compte plus', () => {
    const state = playing(game({ durationSec: 60 }))
    expect(markFound(state, WORDS, T0 + 60_000)).toBe(state)
    expect(markPassed(state, WORDS, T0 + 61_000)).toBe(state)
  })

  it('hors du jeu (prêt, récapitulatif), les gestes sont ignorés', () => {
    const ready = game()
    expect(markFound(ready, WORDS, T0)).toBe(ready)
    const recap = endTurn(playing(ready))
    expect(markPassed(recap, WORDS, T0)).toBe(recap)
  })

  it('« Arrêter ce tour ? » refusé : le temps passé dans la boîte est rendu au chrono', () => {
    const state = playing(game({ durationSec: 60 }))
    const resumed = extendPhase(state, 8_000)
    expect(resumed.phaseEndsAt).toBe(T0 + 68_000)
    expect(isPhaseOver(resumed, T0 + 60_000)).toBe(false)
    expect(markFound(resumed, WORDS, T0 + 65_000).turnLog).toHaveLength(1)
    const countdown = startCountdown(game(), T0)
    expect(extendPhase(countdown, 2_000).phaseEndsAt).toBe(T0 + FC_COUNTDOWN_MS + 2_000)
    expect(extendPhase(state, 0)).toBe(state)
    expect(extendPhase(state, -5_000)).toBe(state)
    const recap = endTurn(state)
    expect(extendPhase(recap, 8_000)).toBe(recap)
  })

  it('arrêter un tour le rejoue depuis « Prêt », sans rien créditer', () => {
    let state = playing(game())
    state = markFound(state, WORDS, T0 + 1)
    const stopped = cancelTurn(state)
    expect(stopped.roundPhase).toBe('ready')
    expect(stopped.turnLog).toEqual([])
    expect(stopped.scores.alice).toEqual({ found: 0, passed: 0, said: 0, turns: 0 })
    expect(currentGuesserId(stopped)).toBe('alice')
  })
})

describe('scores', () => {
  it('la sonnerie crédite le devineur ; le mot affiché à la sonnerie ne compte pas', () => {
    let state = playing(game())
    state = markFound(state, WORDS, T0 + 1)
    state = markFound(state, WORDS, T0 + 2)
    state = markPassed(state, WORDS, T0 + 3)
    state = endTurn(state)
    expect(state.roundPhase).toBe('recap')
    expect(state.current).toBeNull()
    expect(state.scores.alice).toEqual({ found: 2, passed: 1, said: 0, turns: 1 })
    expect(state.scores.bob).toEqual({ found: 0, passed: 0, said: 0, turns: 0 })
    expect(turnSummary(state)).toEqual({ guesserId: 'alice', found: 2, passed: 1, said: [] })
  })

  it('mot prononcé : le fautif est signalé au récapitulatif, jamais le devineur, et s’annule', () => {
    let state = endTurn(playing(game()))
    state = flagSaid(state, 'alice')
    expect(state.turnSaid).toEqual([])
    state = flagSaid(flagSaid(flagSaid(state, 'bob'), 'chloe'), 'bob')
    expect(turnSummary(state).said).toEqual([
      { playerId: 'bob', count: 2 },
      { playerId: 'chloe', count: 1 },
    ])
    expect(state.scores.bob.said).toBe(2)
    state = unflagSaid(state)
    expect(state.scores.bob.said).toBe(1)
    expect(state.turnSaid).toEqual(['bob', 'chloe'])
    expect(flagSaid(state, 'inconnu')).toBe(state)
  })

  it('hors récapitulatif, on ne signale personne', () => {
    const ready = game()
    expect(flagSaid(ready, 'bob')).toBe(ready)
    expect(unflagSaid(ready)).toBe(ready)
  })

  it('alcool : score = mots trouvés, le meilleur distribue ; gorgées = passés + 2 par mot prononcé', () => {
    const state: FcState = {
      ...game(),
      scores: {
        alice: { found: 5, passed: 2, said: 0, turns: 1 },
        bob: { found: 3, passed: 0, said: 1, turns: 1 },
        chloe: { found: 3, passed: 4, said: 0, turns: 1 },
      },
    }
    const entries = ranking(state, 'alcool')
    expect(entries.map((entry) => [entry.id, entry.total, entry.rank, entry.best, entry.drinks])).toEqual([
      ['alice', 5, 1, true, 2],
      ['bob', 3, 2, false, 2],
      ['chloe', 3, 2, false, 4],
    ])
    expect(playerResults(state, 'alcool')).toEqual([
      { playerId: 'alice', won: true, drinks: 2 },
      { playerId: 'bob', won: false, drinks: 2 },
      { playerId: 'chloe', won: false, drinks: 4 },
    ])
  })

  it('Sans alcool : +1 trouvé, −1 passé, −2 mot prononcé, +5 au meilleur score ; aucune gorgée', () => {
    const state: FcState = {
      ...game(),
      scores: {
        alice: { found: 5, passed: 2, said: 0, turns: 1 },
        bob: { found: 6, passed: 0, said: 1, turns: 1 },
        chloe: { found: 1, passed: 0, said: 0, turns: 1 },
      },
    }
    const entries = ranking(state, 'soft')
    expect(entries.map((entry) => [entry.id, entry.score, entry.total, entry.rank])).toEqual([
      ['bob', 4, 9, 1],
      ['alice', 3, 3, 2],
      ['chloe', 1, 1, 3],
    ])
    expect(playerResults(state, 'soft').every((result) => result.drinks === 0)).toBe(true)
    expect(playerResults(state, 'soft').find((result) => result.won)?.playerId).toBe('bob')
  })

  it('ex aequo en tête : tous distribuent ; toute la table à égalité : personne', () => {
    const tied: FcState = {
      ...game(),
      scores: {
        alice: { found: 4, passed: 0, said: 0, turns: 1 },
        bob: { found: 4, passed: 1, said: 0, turns: 1 },
        chloe: { found: 2, passed: 0, said: 0, turns: 1 },
      },
    }
    expect(ranking(tied, 'alcool').filter((entry) => entry.best).map((entry) => entry.id)).toEqual(['alice', 'bob'])
    expect(ranking(tied, 'alcool').map((entry) => entry.rank)).toEqual([1, 1, 3])
    expect(ranking(game(), 'alcool').some((entry) => entry.best)).toBe(false)
  })
})

describe('reprise', () => {
  it('sauvegarde → reprise à l’identique entre deux tours', () => {
    let state = playing(game({ rounds: 2, themes: ['animaux', 'cinema', 'lieux'] }))
    state = markFound(state, WORDS, T0 + 1)
    state = nextTurn(endTurn(state))
    const raw = JSON.stringify({ version: FC_SAVE_VERSION, savedAt: T0, state: toFcSave(state) })
    const save = parseLocalGameSave<unknown>(raw, FC_SAVE_VERSION, T0 + 1_000)
    expect(restoreFcSave(save, TABLE, WORDS)).toEqual(state)
  })

  it('un récapitulatif se reprend avec ses mots et ses fautifs', () => {
    let state = playing(game())
    state = markPassed(state, WORDS, T0 + 1)
    state = flagSaid(endTurn(state), 'chloe')
    expect(restoreFcSave(toFcSave(state), TABLE, WORDS)).toEqual(state)
  })

  it('un chrono en cours n’est jamais sauvegardé : le tour se rejoue depuis « Prêt »', () => {
    let state = playing(game())
    state = markFound(state, WORDS, T0 + 1)
    const save = toFcSave(state)
    expect(save.roundPhase).toBe('ready')
    expect(save.turnLog).toEqual([])
    const restored = restoreFcSave(save, TABLE, WORDS)
    expect(restored?.roundPhase).toBe('ready')
    expect(restored?.scores.alice.found).toBe(0)
  })

  it('autre table, réglages illisibles ou forme inconnue → null', () => {
    const save = toFcSave(game())
    expect(restoreFcSave(save, ['alice', 'bob'], WORDS)).toBeNull()
    expect(restoreFcSave({ ...save, settings: { ...save.settings, durationSec: 30 } }, TABLE, WORDS)).toBeNull()
    expect(restoreFcSave({ ...save, turnIndex: 99 }, TABLE, WORDS)).toBeNull()
    expect(restoreFcSave({ ...save, roundPhase: 'playing' }, TABLE, WORDS)).toBeNull()
    expect(restoreFcSave('n’importe quoi', TABLE, WORDS)).toBeNull()
    expect(isSameLocalTable(save.playerIds, [{ id: 'alice' }])).toBe(false)
  })

  it('mots inconnus de la banque chargée (autre langue) : la pioche les oublie, le bilan du tour suit les scores', () => {
    let state = playing(game())
    state = markFound(state, WORDS, T0 + 1)
    state = endTurn(markPassed(state, WORDS, T0 + 2))
    const restored = restoreFcSave(toFcSave(state), TABLE, [])
    expect(restored?.deckUsed).toEqual([])
    expect(restored?.turnLog).toEqual(state.turnLog)
    expect(restored?.scores.alice).toEqual({ found: 1, passed: 1, said: 0, turns: 1 })
    expect(restored && turnSummary(restored)).toEqual({ guesserId: 'alice', found: 1, passed: 1, said: [] })
  })

  it('réglages non par défaut : la sauvegarde les porte, la reprise ne dépend que de la table', () => {
    const table = ['p1', 'p2', 'p3', 'p4']
    const custom: FcSettings = {
      teamMode: 'teams',
      durationSec: 90,
      rounds: 2,
      instructions: 'describe',
      themes: ['sport', 'animaux'],
    }
    let state = createGame({ settings: custom, playerIds: table, seed: 'reprise' })
    for (let turn = 0; turn < 3; turn += 1) state = nextTurn(endTurn(markFound(playing(state), WORDS, T0 + 1)))
    const raw = JSON.stringify({ version: FC_SAVE_VERSION, savedAt: T0, state: toFcSave(state) })
    const save = parseLocalGameSave<unknown>(raw, FC_SAVE_VERSION, T0 + 1_000)
    // Onglet rechargé : la pré-partie est revenue à « Chacun pour soi, 60 s, 1 tour », la table est la même.
    const restored = restoreFcSave(save, [...table].reverse(), WORDS)
    expect(restored).toEqual(state)
    expect(restored?.settings).toEqual({ ...custom, themes: ['animaux', 'sport'] })
    expect(restored?.turnIndex).toBe(3)
    expect(restored?.order).toHaveLength(8)
  })

  it('réglages : lecture stricte, thèmes remis dans l’ordre du catalogue', () => {
    expect(readFcSettings({ ...FC_DEFAULT_SETTINGS, themes: [] })).toBeNull()
    expect(readFcSettings({ ...FC_DEFAULT_SETTINGS, rounds: 3 })).toBeNull()
    expect(readFcSettings({ ...FC_DEFAULT_SETTINGS, themes: ['sport', 'cinema'] })?.themes).toEqual(['cinema', 'sport'])
  })
})

describe('pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now : la graine et l’horloge sont passées', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    let state = playing(game())
    state = markFound(state, WORDS, T0 + 1)
    state = markPassed(state, WORDS, T0 + 2)
    state = nextTurn(flagSaid(endTurn(state), 'bob'))
    ranking(state, 'soft')
    nextWord(state, WORDS)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})
