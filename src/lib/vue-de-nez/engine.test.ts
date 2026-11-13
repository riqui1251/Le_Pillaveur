import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSameLocalTable, parseLocalGameSave } from '@/lib/game-session'
import { VDN_THEMES } from './data/types'
import {
  VDN_MAX_ABS_ESTIMATE,
  VDN_POINTS,
  VDN_SAVE_VERSION,
  VDN_YEAR_BULLSEYE_MAX,
  allAnswered,
  answerOrder,
  assignLanes,
  bullseyeThreshold,
  createGame,
  currentQuestionId,
  nextQuestion,
  nextToAnswer,
  normalizeVdnThemes,
  ranking,
  restoreVdnSave,
  reveal,
  scaleFor,
  scalePosition,
  scoreQuestion,
  sipsDrunk,
  sipsGiven,
  submitEstimate,
  toVdnPublicView,
  toVdnSave,
  type VdnOutcome,
  type VdnPoolEntry,
  type VdnState,
} from './engine'

const TABLE = ['alice', 'bob', 'chloe']

/** Banque de test : trois questions par thème, ids lisibles. */
const POOL: VdnPoolEntry[] = VDN_THEMES.flatMap((theme) =>
  [1, 2, 3].map((n) => ({ id: `${theme}-${n}`, theme }))
)
const KNOWN = new Set(POOL.map((q) => q.id))

function must(outcome: VdnOutcome): VdnState {
  if (!outcome.ok) throw new Error(`refus inattendu : ${outcome.error}`)
  return outcome.state
}

function start(overrides: Partial<Parameters<typeof createGame>[0]> = {}): VdnState {
  return must(createGame({ playerIds: TABLE, pool: POOL, seed: 'soirée', ...overrides }))
}

/** Tout le monde estime, dans l'ordre de la table. */
function estimateAll(state: VdnState, values: Record<string, number>): VdnState {
  let next = state
  for (const [playerId, value] of Object.entries(values)) next = must(submitEstimate(next, playerId, value))
  return next
}

function revealWith(state: VdnState, answer: number): VdnState {
  return must(reveal(state, { id: currentQuestionId(state) ?? '', answer }))
}

describe('création', () => {
  it('même graine → même partie ; graine différente → autre tirage', () => {
    expect(start()).toEqual(start())
    expect(start({ seed: 'autre soirée' }).questionIds).not.toEqual(start().questionIds)
  })

  it('tire 10 questions distinctes par défaut, phase de réponse, scores à zéro', () => {
    const state = start()
    expect(state.questionIds).toHaveLength(10)
    expect(new Set(state.questionIds).size).toBe(10)
    expect(state.phase).toBe('answering')
    expect(state.index).toBe(0)
    expect(state.estimates).toEqual({ alice: null, bob: null, chloe: null })
    expect(state.scores).toEqual({ alice: 0, bob: 0, chloe: 0 })
    expect(state.reveal).toBeNull()
    expect(TABLE).toContain(TABLE[state.firstPlayerIndex])
  })

  it('« tout mélanger » fait alterner les thèmes : les 7 premières questions couvrent les 7', () => {
    const state = start()
    const themes = state.questionIds.slice(0, 7).map((id) => id.replace(/-\d$/, ''))
    expect(new Set(themes).size).toBe(7)
  })

  it('un filtre de thèmes ne tire que ceux-là ; banque trop courte → partie plus courte', () => {
    const state = start({ themes: ['sport', 'histoire'], questionCount: 15 })
    expect(state.questionIds).toHaveLength(6)
    expect(state.questionIds.every((id) => id.startsWith('sport-') || id.startsWith('histoire-'))).toBe(true)
    expect(state.settings.themes).toEqual(['histoire', 'sport'])
  })

  it('les 7 thèmes cochés reviennent à « tout mélanger »', () => {
    expect(normalizeVdnThemes([...VDN_THEMES])).toEqual([])
    expect(normalizeVdnThemes(['sport', 'corps', 'sport', 'inconnu'])).toEqual(['corps', 'sport'])
  })

  it('le minimum d’estimation suit la question (0 par défaut)', () => {
    const pool: VdnPoolEntry[] = [
      { id: 'froid', theme: 'sciences', min: -300 },
      { id: 'os', theme: 'corps' },
    ]
    const state = start({ pool, questionCount: 5 })
    const mins = Object.fromEntries(state.questionIds.map((id, i) => [id, state.questionMins[i]]))
    expect(mins).toEqual({ froid: -300, os: 0 })
  })

  it('refuse une table trop petite, un joueur en double, une banque vide', () => {
    expect(createGame({ playerIds: ['alice'], pool: POOL, seed: 1 })).toEqual({ ok: false, error: 'NOT_ENOUGH_PLAYERS' })
    expect(createGame({ playerIds: ['alice', 'alice'], pool: POOL, seed: 1 })).toEqual({ ok: false, error: 'DUPLICATE_PLAYER' })
    expect(createGame({ playerIds: TABLE, pool: [], seed: 1 })).toEqual({ ok: false, error: 'NO_QUESTIONS' })
    const onlySport: VdnPoolEntry[] = [{ id: 'sport-1', theme: 'sport' }]
    expect(createGame({ playerIds: TABLE, pool: onlySport, seed: 1, themes: ['corps'] })).toEqual({ ok: false, error: 'NO_QUESTIONS' })
  })

  it('la main tourne d’un cran à chaque question', () => {
    const state = { ...start(), firstPlayerIndex: 1 }
    expect(answerOrder(state)).toEqual(['bob', 'chloe', 'alice'])
    expect(answerOrder({ ...state, index: 1 })).toEqual(['chloe', 'alice', 'bob'])
    expect(answerOrder({ ...state, index: 2 })).toEqual(['alice', 'bob', 'chloe'])
  })
})

describe('estimations secrètes', () => {
  it('chacun répond une fois en local ; nextToAnswer suit l’ordre de passage', () => {
    let state = { ...start(), firstPlayerIndex: 0 }
    expect(nextToAnswer(state)).toBe('alice')
    state = must(submitEstimate(state, 'alice', 212))
    expect(nextToAnswer(state)).toBe('bob')
    expect(submitEstimate(state, 'alice', 300)).toEqual({ ok: false, error: 'ALREADY_ANSWERED' })
    state = estimateAll(state, { bob: 190, chloe: 150 })
    expect(allAnswered(state)).toBe(true)
    expect(nextToAnswer(state)).toBeNull()
  })

  it('en ligne, une estimation se corrige tant que la question est ouverte', () => {
    let state = start({ allowCorrection: true })
    state = must(submitEstimate(state, 'alice', 10))
    state = must(submitEstimate(state, 'alice', 12))
    expect(state.estimates.alice).toBe(12)
  })

  it('refuse un nombre illisible, trop grand, sous le minimum, ou un inconnu', () => {
    const state = start()
    expect(submitEstimate(state, 'alice', Number.NaN)).toEqual({ ok: false, error: 'NOT_A_NUMBER' })
    expect(submitEstimate(state, 'alice', Number.POSITIVE_INFINITY)).toEqual({ ok: false, error: 'NOT_A_NUMBER' })
    expect(submitEstimate(state, 'alice', VDN_MAX_ABS_ESTIMATE * 10)).toEqual({ ok: false, error: 'TOO_LARGE' })
    expect(submitEstimate(state, 'alice', -1)).toEqual({ ok: false, error: 'BELOW_MIN' })
    expect(submitEstimate(state, 'zoé', 5)).toEqual({ ok: false, error: 'UNKNOWN_PLAYER' })
  })

  it('accepte une estimation négative quand la question le permet, décimales comprises', () => {
    const state = { ...start(), questionMins: Array.from({ length: 10 }, () => -300) }
    expect(must(submitEstimate(state, 'alice', -273.15)).estimates.alice).toBe(-273.15)
    expect(Object.is(must(submitEstimate(state, 'bob', -0)).estimates.bob, 0)).toBe(true)
  })

  it('ne touche pas à l’état reçu', () => {
    const state = start()
    const before = JSON.stringify(state)
    submitEstimate(state, 'alice', 5)
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('barème d’une question', () => {
  const entries = (values: Record<string, number>) =>
    Object.entries(values).map(([playerId, estimate]) => ({ playerId, estimate }))

  it('le plus proche et le plus loin, classés par écart', () => {
    const rows = scoreQuestion(206, entries({ alice: 212, bob: 190, chloe: 300, dan: 150 }))
    expect(rows.map((r) => [r.playerId, r.gap, r.tag])).toEqual([
      ['alice', 6, 'closest'],
      ['bob', 16, null],
      ['dan', 56, null],
      ['chloe', 94, 'farthest'],
    ])
  })

  it('« dans le mille » : écart d’au plus 2 % de la réponse, réservé au plus proche', () => {
    const rows = scoreQuestion(1000, entries({ alice: 1001, bob: 1020, chloe: 1500 }))
    expect(rows.map((r) => r.tag)).toEqual(['bullseye', null, 'farthest'])
    expect(scoreQuestion(206, entries({ alice: 210, bob: 300 }))[0].tag).toBe('bullseye')
    expect(scoreQuestion(206, entries({ alice: 211, bob: 300 }))[0].tag).toBe('closest')
  })

  it('ex æquo : tous les plus proches et tous les plus loin sont concernés', () => {
    const rows = scoreQuestion(100, entries({ alice: 90, bob: 110, chloe: 50, dan: 150, eve: 120 }))
    const tags = Object.fromEntries(rows.map((r) => [r.playerId, r.tag]))
    expect(tags).toEqual({ alice: 'closest', bob: 'closest', eve: null, chloe: 'farthest', dan: 'farthest' })
  })

  it('tous au même écart : personne ne distribue, personne ne boit', () => {
    expect(scoreQuestion(100, entries({ alice: 90, bob: 110 })).every((r) => r.tag === null)).toBe(true)
    expect(scoreQuestion(100, entries({ alice: 100, bob: 100 })).every((r) => r.tag === null)).toBe(true)
    expect(scoreQuestion(100, entries({ alice: 42 }))[0].tag).toBeNull()
  })

  it('une année : « dans le mille » à un an près, pas à 2 % du millésime (±40 ans)', () => {
    // Chute du mur de Berlin : 1960 est le plus proche, à 29 ans — ni plus ni moins.
    const wall = entries({ alice: 1960, bob: 1900 })
    expect(scoreQuestion(1989, wall).map((r) => r.tag)).toEqual(['bullseye', 'farthest'])
    expect(scoreQuestion(1989, wall, { year: true }).map((r) => r.tag)).toEqual(['closest', 'farthest'])
    expect(bullseyeThreshold(1989, { year: true })).toBe(VDN_YEAR_BULLSEYE_MAX)
    expect(scoreQuestion(1989, entries({ alice: 1990, bob: 1950 }), { year: true })[0].tag).toBe('bullseye')
    expect(scoreQuestion(1989, entries({ alice: 1987, bob: 1950 }), { year: true })[0].tag).toBe('closest')
    // Avant notre ère aussi : fondation de Rome (753), 740 est à 13 ans, sous les 15 ans de 2 %.
    expect(scoreQuestion(753, entries({ alice: 740, bob: 600 })).map((r) => r.tag)).toEqual(['bullseye', 'farthest'])
    expect(scoreQuestion(753, entries({ alice: 740, bob: 600 }), { year: true }).map((r) => r.tag)).toEqual(['closest', 'farthest'])
    // Pompéi (79) : 2 % font déjà moins d'un an, le seuil ne s'élargit jamais.
    expect(bullseyeThreshold(79, { year: true })).toBe(1)
    expect(bullseyeThreshold(20, { year: true })).toBe(bullseyeThreshold(20))
    // reveal transmet le drapeau au barème.
    const state = estimateAll(start(), { alice: 1960, bob: 1900, chloe: 2025 })
    const shown = must(reveal(state, { id: currentQuestionId(state) ?? '', answer: 1989, year: true }))
    expect(shown.reveal?.results.map((r) => r.tag)).toEqual(['closest', null, 'farthest'])
    expect(shown.scores.alice).toBe(VDN_POINTS.closest)
  })

  it('réponse 0 : « dans le mille » seulement à écart nul', () => {
    expect(scoreQuestion(0, entries({ alice: 0, bob: 3 })).map((r) => r.tag)).toEqual(['bullseye', 'farthest'])
    expect(scoreQuestion(0, entries({ alice: 1, bob: 3 })).map((r) => r.tag)).toEqual(['closest', 'farthest'])
  })

  it('des décimales à écart égal restent ex æquo', () => {
    const rows = scoreQuestion(0.3, entries({ alice: 0.1, bob: 0.5, chloe: 0.35 }))
    expect(rows.map((r) => r.tag)).toEqual(['closest', 'farthest', 'farthest'])
  })
})

describe('révélation et enchaînement', () => {
  it('refuse de révéler avant toutes les réponses, ou une autre question', () => {
    const state = must(submitEstimate(start(), 'alice', 5))
    expect(reveal(state, { id: currentQuestionId(state) ?? '', answer: 5 })).toEqual({ ok: false, error: 'NOT_ALL_ANSWERED' })
    const done = estimateAll(state, { bob: 6, chloe: 7 })
    expect(reveal(done, { id: 'pas-elle', answer: 5 })).toEqual({ ok: false, error: 'WRONG_QUESTION' })
  })

  it('compte les événements : +3 au plus proche, +6 dans le mille, −1 au plus loin', () => {
    let state = estimateAll(start(), { alice: 208, bob: 190, chloe: 300 })
    state = revealWith(state, 206)
    expect(state.phase).toBe('reveal')
    expect(state.reveal?.answer).toBe(206)
    expect(state.reveal?.results.map((r) => r.playerId)).toEqual(['alice', 'bob', 'chloe'])
    expect(state.scores).toEqual({ alice: VDN_POINTS.bullseye, bob: 0, chloe: VDN_POINTS.farthest })
    expect(state.tallies.alice).toEqual({ closest: 0, bullseye: 1, farthest: 0 })
    expect(state.tallies.chloe).toEqual({ closest: 0, bullseye: 0, farthest: 1 })
    expect(submitEstimate(state, 'alice', 1)).toEqual({ ok: false, error: 'WRONG_PHASE' })
  })

  it('à l’échéance en ligne (force), les absents sont exclus du calcul', () => {
    let state = estimateAll(start(), { alice: 10, bob: 50 })
    state = must(reveal(state, { id: currentQuestionId(state) ?? '', answer: 12 }, { force: true }))
    expect(state.reveal?.results.map((r) => [r.playerId, r.tag])).toEqual([
      ['alice', 'closest'],
      ['bob', 'farthest'],
    ])
    expect(state.scores.chloe).toBe(0)
  })

  it('question suivante : estimations remises à zéro, scores gardés', () => {
    let state = revealWith(estimateAll(start(), { alice: 1, bob: 2, chloe: 9 }), 1)
    expect(nextQuestion(estimateAll(start(), {}))).toEqual({ ok: false, error: 'WRONG_PHASE' })
    state = must(nextQuestion(state))
    expect(state.phase).toBe('answering')
    expect(state.index).toBe(1)
    expect(state.estimates).toEqual({ alice: null, bob: null, chloe: null })
    expect(state.reveal).toBeNull()
    expect(state.scores.alice).toBe(VDN_POINTS.bullseye)
  })

  it('partie complète : fin après la dernière révélation, classement « compétition »', () => {
    let state = start({ questionCount: 5 })
    const rounds: Record<string, number>[] = [
      { alice: 100, bob: 150, chloe: 300 }, // alice dans le mille, chloe loin
      { alice: 100, bob: 120, chloe: 300 }, // idem
      { alice: 300, bob: 102, chloe: 140 }, // bob dans le mille (2 %), alice loin
      { alice: 110, bob: 300, chloe: 130 }, // alice proche (10 %), bob loin
      { alice: 200, bob: 200, chloe: 200 }, // tous égaux : rien
    ]
    for (const values of rounds) {
      expect(state.phase).toBe('answering')
      state = revealWith(estimateAll(state, values), 100)
      state = must(nextQuestion(state))
    }
    expect(state.phase).toBe('finished')
    expect(nextQuestion(state)).toEqual({ ok: false, error: 'WRONG_PHASE' })
    const rows = ranking(state)
    expect(rows.map((r) => [r.playerId, r.score, r.rank, r.won])).toEqual([
      ['alice', 6 + 6 - 1 + 3, 1, true],
      ['bob', 6 - 1, 2, false],
      ['chloe', -2, 3, false],
    ])
    const alice = rows[0].tally
    expect(alice).toEqual({ closest: 1, bullseye: 2, farthest: 1 })
    expect(sipsGiven(alice)).toBe(3 + 12)
    expect(sipsDrunk(alice)).toBe(3)
  })

  it('ex æquo en tête : même rang, tous gagnants ; score nul ou négatif : personne', () => {
    const tied = { ...start(), scores: { alice: 6, bob: 6, chloe: -1 } }
    expect(ranking(tied).map((r) => [r.playerId, r.rank, r.won])).toEqual([
      ['alice', 1, true],
      ['bob', 1, true],
      ['chloe', 3, false],
    ])
    const nobody = { ...start(), scores: { alice: 0, bob: -1, chloe: -1 } }
    expect(ranking(nobody).some((r) => r.won)).toBe(false)
  })
})

describe('règle graduée', () => {
  it('linéaire et ronde pour des valeurs proches (maquette : 100 → 350)', () => {
    const scale = scaleFor(206, [212, 190, 150, 300])
    expect(scale).toEqual({ kind: 'lin', min: 100, max: 350, ticks: [100, 150, 200, 250, 300, 350] })
    expect(scalePosition(scale, 206)).toBeCloseTo(0.424, 3)
  })

  it('logarithmique dès que la réponse atteint 10 000', () => {
    const scale = scaleFor(42_195, [40_000, 45_000, 50_000])
    expect(scale.kind).toBe('log')
    expect(scale.min).toBeLessThanOrEqual(40_000)
    expect(scale.max).toBeGreaterThanOrEqual(50_000)
    const xs = [40_000, 42_195, 45_000, 50_000].map((v) => scalePosition(scale, v))
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    // Le groupe serré reste lisible : il occupe plus d'un quart de la règle.
    expect(xs[3] - xs[0]).toBeGreaterThan(0.25)
  })

  it('logarithmique quand les estimations s’étalent sur plus d’un facteur 50', () => {
    expect(scaleFor(300, [5, 200, 1000]).kind).toBe('log')
    expect(scaleFor(300, [100, 200, 1000]).kind).toBe('lin')
  })

  it('une grande étendue garde au plus 9 graduations, bornes comprises', () => {
    const scale = scaleFor(8_000_000_000, [1_000_000, 500_000_000, 20_000_000_000])
    expect(scale.kind).toBe('log')
    expect(scale.ticks.length).toBeLessThanOrEqual(9)
    expect(scale.ticks[0]).toBe(scale.min)
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max)
  })

  it('en log, une estimation nulle se pose au bord gauche', () => {
    const scale = scaleFor(50_000, [0, 30_000])
    expect(scale.kind).toBe('log')
    expect(scalePosition(scale, 0)).toBe(0)
  })

  it('reste linéaire avec des valeurs négatives, et sans graduation sous zéro sinon', () => {
    const cold = scaleFor(-273, [-200, -300, -100])
    expect(cold.kind).toBe('lin')
    expect(cold.min).toBeLessThanOrEqual(-300)
    expect(cold.max).toBeGreaterThanOrEqual(-100)
    expect(scaleFor(5, [0, 8]).min).toBe(0)
  })

  it('toutes les valeurs égales : la règle s’ouvre autour d’elles', () => {
    const zero = scaleFor(0, [0, 0])
    expect(zero.min).toBe(0)
    expect(zero.max).toBeGreaterThan(0)
    const five = scaleFor(5, [5])
    expect(scalePosition(five, 5)).toBeGreaterThan(0)
    expect(scalePosition(five, 5)).toBeLessThan(1)
  })

  it('positions bornées entre 0 et 1', () => {
    const scale = scaleFor(10, [12, 8])
    expect(scalePosition(scale, -1000)).toBe(0)
    expect(scalePosition(scale, 1000)).toBe(1)
    expect(scalePosition(scale, Number.NaN)).toBe(0)
  })

  it('les marqueurs trop proches changent de rangée, les autres la partagent', () => {
    expect(assignLanes([0.1, 0.12, 0.5, 0.52, 0.9], 0.15)).toEqual([0, 1, 0, 1, 0])
    expect(assignLanes([0.5, 0.5, 0.5], 0.15, 2)).toEqual([0, 1, 0])
    expect(assignLanes([], 0.15)).toEqual([])
  })
})

describe('vue publique (en ligne, TV)', () => {
  it('pendant la question : ni graine, ni questions à venir, ni estimation d’autrui', () => {
    const state = estimateAll(start(), { alice: 123_456, bob: 98_765 })
    const view = toVdnPublicView(state, 'alice')
    expect(view).not.toHaveProperty('rngState')
    expect(view).not.toHaveProperty('estimates')
    expect(view).not.toHaveProperty('questionIds')
    expect(view.answeredIds).toEqual(['alice', 'bob'])
    expect(view.myEstimate).toBe(123_456)
    expect(view.questionId).toBe(state.questionIds[0])
    const json = JSON.stringify(view)
    expect(json).not.toContain('98765')
    expect(json).not.toContain(state.questionIds[1])
    expect(toVdnPublicView(state, null).myEstimate).toBeNull()
    expect(JSON.stringify(toVdnPublicView(state, null))).not.toContain('123456')
  })

  it('après la révélation, réponse et estimations deviennent publiques', () => {
    const state = revealWith(estimateAll(start(), { alice: 1, bob: 2, chloe: 3 }), 2)
    const view = toVdnPublicView(state, null)
    expect(view.reveal?.answer).toBe(2)
    expect(view.reveal?.results).toHaveLength(3)
  })
})

describe('reprise (useResumableLocalGame)', () => {
  it('sauvegarde → stockage → reprise à l’identique, en pleine question comme à la révélation', () => {
    const answering = must(submitEstimate(start(), 'alice', 42))
    const revealed = revealWith(estimateAll(answering, { bob: 7, chloe: 9 }), 8)
    for (const state of [answering, revealed]) {
      const raw = JSON.stringify({ version: VDN_SAVE_VERSION, savedAt: 1_000, state: toVdnSave(state) })
      const save = parseLocalGameSave<unknown>(raw, VDN_SAVE_VERSION, 2_000)
      expect(restoreVdnSave(save, TABLE, KNOWN)).toEqual(state)
    }
  })

  it('la table actuelle peut être dans un autre ordre ; une autre table est refusée', () => {
    const state = start()
    expect(restoreVdnSave(toVdnSave(state), ['chloe', 'alice', 'bob'], KNOWN)?.playerIds).toEqual(TABLE)
    expect(restoreVdnSave(toVdnSave(state), ['alice', 'bob'], KNOWN)).toBeNull()
    expect(restoreVdnSave(toVdnSave(state), ['alice', 'bob', 'zoé'], KNOWN)).toBeNull()
    expect(isSameLocalTable(state.playerIds, [{ id: 'alice' }])).toBe(false)
  })

  it('refuse une question disparue de la banque, une partie finie, une sauvegarde abîmée', () => {
    const state = start()
    const known = new Set(state.questionIds.slice(1))
    expect(restoreVdnSave(toVdnSave(state), TABLE, known)).toBeNull()
    expect(restoreVdnSave({ ...state, phase: 'finished' }, TABLE, KNOWN)).toBeNull()
    expect(restoreVdnSave(null, TABLE, KNOWN)).toBeNull()
    expect(restoreVdnSave('texte', TABLE, KNOWN)).toBeNull()
    expect(restoreVdnSave({ ...state, index: 10 }, TABLE, KNOWN)).toBeNull()
    expect(restoreVdnSave({ ...state, estimates: { ...state.estimates, alice: 'beaucoup' } }, TABLE, KNOWN)).toBeNull()
    expect(restoreVdnSave({ ...state, scores: { alice: 1 } }, TABLE, KNOWN)).toBeNull()
    expect(restoreVdnSave({ ...state, settings: { ...state.settings, questionCount: 12 } }, TABLE, KNOWN)).toBeNull()
    expect(restoreVdnSave({ ...state, reveal: { questionId: 'x', answer: 1, results: [] } }, TABLE, KNOWN)).toBeNull()
    expect(restoreVdnSave({ ...state, phase: 'reveal' }, TABLE, KNOWN)).toBeNull()
  })

  it('la reprise ne lit pas la pré-partie : la sauvegarde garde ses réglages et ses questions tirées', () => {
    // 5 questions « Histoire + Sport », deux jouées, puis rechargement : la pré-partie revient à 10, tous thèmes.
    let state = start({ questionCount: 5, themes: ['sport', 'histoire'] })
    for (let i = 0; i < 2; i += 1) state = must(nextQuestion(revealWith(estimateAll(state, { alice: 1, bob: 2, chloe: 9 }), 1)))
    const raw = JSON.stringify({ version: VDN_SAVE_VERSION, savedAt: 1_000, state: toVdnSave(state) })
    const restored = restoreVdnSave(parseLocalGameSave<unknown>(raw, VDN_SAVE_VERSION, 2_000), TABLE, KNOWN)
    expect(restored).toEqual(state)
    expect(restored?.settings).toEqual({ questionCount: 5, themes: ['histoire', 'sport'], allowCorrection: false })
    expect(restored?.index).toBe(2)
    expect(restored?.questionIds).toEqual(state.questionIds)
  })
})

describe('pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now, de la création au classement', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    let state = start({ questionCount: 5 })
    state = revealWith(estimateAll(state, { alice: 1, bob: 2, chloe: 3 }), 2)
    state = must(nextQuestion(state))
    ranking(state)
    scaleFor(20_000, [1, 2, 30_000])
    toVdnPublicView(state, 'alice')
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})
