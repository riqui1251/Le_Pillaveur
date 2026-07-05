import { describe, expect, it } from 'vitest'
import {
  createQuizState,
  currentQuizActorId,
  reduceQuiz,
  toQuizClientView,
  toQuizSpectatorView,
  QuizEngineError,
  QUIZ_POINTS_BASE,
  QUIZ_POINTS_SPEED_MAX,
  QUIZ_QUESTION_MS,
  QUIZ_REVEAL_MS,
  QUIZ_SIPS_WRONG,
  type QuizQuestion,
  type QuizState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const T0 = 1_000_000

const POOL: QuizQuestion[] = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  cat: 'culture',
  diff: 1,
  q: `Question ${i} ?`,
  choices: ['A', 'B', 'C', 'D'],
  answer: i % 4,
}))

const DUO = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
]

function make(count = 3): QuizState {
  return createQuizState(DUO, POOL, count, 'seed', T0)
}

/** La bonne réponse de la question courante (côté test, on lit l'état brut). */
function answerOf(state: QuizState): number {
  return state.questions[state.qIdx].answer
}

describe('createQuizState', () => {
  it('tire N questions sans doublon, reproductible par graine', () => {
    const s = make(3)
    expect(s.questions).toHaveLength(3)
    expect(new Set(s.questions.map((q) => q.id)).size).toBe(3)
    expect(createQuizState(DUO, POOL, 3, 'seed', T0)).toEqual(s)
    expect(createQuizState(DUO, POOL, 3, 'autre', T0).questions).not.toEqual(s.questions)
    expect(s.phase).toBe('question')
    expect(s.phaseEndsAt).toBe(T0 + QUIZ_QUESTION_MS)
    expect(s.questionStartAt).toBe(T0)
  })

  it('borne joueurs et pool', () => {
    expect(() => createQuizState([{ id: 'a', name: 'A' }], POOL, 3, 1, T0)).toThrow(
      QuizEngineError
    )
    expect(() => createQuizState(DUO, [], 3, 1, T0)).toThrow('NO_QUESTIONS')
    // Pool plus petit que le compte demandé → toutes les questions du pool.
    expect(createQuizState(DUO, POOL.slice(0, 2), 10, 1, T0).questions).toHaveLength(2)
  })
})

describe('ANSWER', () => {
  it('une seule réponse, choix 0-3, résolution anticipée quand tous ont répondu', () => {
    let s = make()
    const good = answerOf(s)
    expect(() => reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: 5, now: T0 })).toThrow(
      'INVALID_CHOICE'
    )
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: good, now: T0 + 2000 })
    expect(() =>
      reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: good, now: T0 + 3000 })
    ).toThrow('ALREADY_ANSWERED')
    expect(s.phase).toBe('question')
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'b', choice: (good + 1) % 4, now: T0 + 4000 })
    expect(s.phase).toBe('reveal') // tous ont répondu → reveal immédiat
    expect(s.lastResult?.answer).toBe(good)
  })

  it('bonus de vitesse : plus rapide = plus de points (horodatage serveur)', () => {
    let s = make()
    const good = answerOf(s)
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: good, now: T0 }) // instantané
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'b', choice: good, now: T0 + 7500 }) // mi-temps
    const ra = s.lastResult!.perPlayer.a
    const rb = s.lastResult!.perPlayer.b
    expect(ra.points).toBe(QUIZ_POINTS_BASE + QUIZ_POINTS_SPEED_MAX)
    expect(rb.points).toBe(QUIZ_POINTS_BASE + Math.round(QUIZ_POINTS_SPEED_MAX / 2))
    expect(s.players.find((p) => p.id === 'a')?.score).toBe(ra.points)
    expect(s.players.find((p) => p.id === 'a')?.streak).toBe(1)
  })

  it('mauvaise réponse ou silence = 2 gorgées, streak remis à zéro', () => {
    let s = make()
    const good = answerOf(s)
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: (good + 1) % 4, now: T0 + 1000 })
    // b ne répond pas → timeout.
    s = reduceQuiz(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + QUIZ_QUESTION_MS,
    })
    expect(s.phase).toBe('reveal')
    expect(s.lastResult?.perPlayer.a).toMatchObject({ correct: false, points: 0, sips: QUIZ_SIPS_WRONG })
    expect(s.lastResult?.perPlayer.b).toMatchObject({ choice: null, correct: false, sips: QUIZ_SIPS_WRONG })
    expect(s.players.every((p) => p.sips === QUIZ_SIPS_WRONG && p.streak === 0)).toBe(true)
  })

  it('un joueur parti ne bloque pas la résolution anticipée', () => {
    let s = make()
    s = reduceQuiz(s, { type: 'LEAVE', playerId: 'b', at: T0 })
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: 0, now: T0 + 1000 })
    expect(s.phase).toBe('reveal') // seul présent → résolution directe
  })
})

describe('ADVANCE / CONTINUE (reveal → suite)', () => {
  function toReveal(s: QuizState): QuizState {
    let n = reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: 0, now: T0 + 1000 })
    n = reduceQuiz(n, { type: 'ANSWER', playerId: 'b', choice: 1, now: T0 + 1000 })
    return n
  }

  it('reveal chronométré → question suivante (état remis à neuf)', () => {
    let s = toReveal(make(3))
    expect(s.phaseEndsAt).toBe(T0 + 1000 + QUIZ_REVEAL_MS)
    expect(() =>
      reduceQuiz(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + 1000 })
    ).toThrow('NOT_EXPIRED')
    const t1 = T0 + 1000 + QUIZ_REVEAL_MS
    s = reduceQuiz(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: t1 })
    expect(s.phase).toBe('question')
    expect(s.qIdx).toBe(1)
    expect(s.lastResult).toBeNull()
    expect(s.questionStartAt).toBe(t1)
  })

  it('CONTINUE saute le reveal sans attendre ; dernière question → podium', () => {
    let s = toReveal(make(1))
    s = reduceQuiz(s, { type: 'CONTINUE', playerId: 'a', now: T0 + 2000 })
    expect(s.phase).toBe('finished')
    expect(s.phaseEndsAt).toBeNull()
  })

  it('acteur courant toujours null (échéances serveur en guise d’arbitre)', () => {
    expect(currentQuizActorId()).toBeNull()
  })
})

describe('vues anti-triche', () => {
  it('la bonne réponse ne sort JAMAIS pendant la phase question', () => {
    const s = make()
    const view = toQuizClientView(s, 'a')
    expect(view.currentQuestion).toMatchObject({ q: s.questions[0].q })
    expect('answer' in (view.currentQuestion as object)).toBe(false)
    const json = JSON.stringify(view)
    expect(json).not.toContain('rngState')
    expect(json).not.toContain('"answer"')
    expect(json).not.toContain('answeredAt')
    // Les questions SUIVANTES ne sont pas non plus dans la vue.
    expect(json).not.toContain(s.questions[1].q)
  })

  it('mon choix visible pour moi seul ; les autres voient « a répondu »', () => {
    let s = make()
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: 2, now: T0 + 1000 })
    const mine = toQuizClientView(s, 'a')
    expect(mine.myChoice).toBe(2)
    const other = toQuizClientView(s, 'b')
    expect(other.myChoice).toBeNull()
    expect(other.players.find((p) => p.id === 'a')?.hasAnswered).toBe(true)
    const tv = toQuizSpectatorView(s)
    expect(tv.myChoice).toBeNull()
    expect(JSON.stringify(tv)).not.toContain('"answer"')
  })

  it('au reveal, la réponse et les choix deviennent publics', () => {
    let s = make()
    const good = answerOf(s)
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'a', choice: good, now: T0 })
    s = reduceQuiz(s, { type: 'ANSWER', playerId: 'b', choice: (good + 1) % 4, now: T0 })
    const view = toQuizSpectatorView(s)
    expect(view.lastResult?.answer).toBe(good)
    expect(view.lastResult?.perPlayer.b.choice).toBe((good + 1) % 4)
  })
})

describe('contrat remplacement', () => {
  it('LEAVE / REJOIN / REPLACE_LEFT', () => {
    let s = make()
    s = reduceQuiz(s, { type: 'LEAVE', playerId: 'a', at: T0 })
    expect(s.players[0].leftAt).toBe(T0)
    expect(reduceQuiz(s, { type: 'REJOIN', playerId: 'a' }).players[0].leftAt).toBeNull()
    const bot = reduceQuiz(s, { type: 'REPLACE_LEFT', now: T0 + 60_000, graceMs: 30_000 })
    expect(bot.players[0].isBot).toBe(true)
  })
})
