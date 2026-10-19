import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { getQuizQuestions } from '@/lib/quiz/data'
import {
  createQuizState,
  reduceQuiz,
  QUIZ_COUNTDOWN_MS,
  QUIZ_REVEAL_MIN_MS,
  type QuizQuestion,
  type QuizState,
} from '@/lib/quiz/engine'
import {
  onlineRoom,
  previewMembers,
  PREVIEW_NAMES,
  type TvPreviewFixture,
  type TvPreviewStep,
} from '../fixture-kit'

/** Ce que fait chaque joueur à une question : bonne réponse, mauvaise, ou rien avant la fin du temps. */
type Move = 'right' | 'wrong' | 'none'

const ALL_QUESTIONS = ['fr', 'en', 'es', 'it'].flatMap((lang) => getQuizQuestions(lang))

/**
 * Partie pilotée par le VRAI moteur. L'horloge virtuelle démarre ~10 min dans
 * le futur : chaque échéance montrée reste à venir pendant la revue, sans
 * retoucher l'état à la main.
 */
function newGame(
  humans: number,
  bots: number,
  pool: QuizQuestion[],
  count: number,
  names: readonly string[] = [...PREVIEW_NAMES, 'Pierre-Alexandre', 'Anne-Sophie']
) {
  const members = previewMembers(humans, names)
  const players = [
    ...members.map((m) => ({ id: m.userId, name: m.displayName })),
    ...Array.from({ length: bots }, (_, i) => ({
      id: `bot-${i + 1}`,
      name: botDisplayName(BOT_PERSONAS[i % BOT_PERSONAS.length]),
      isBot: true,
    })),
  ]
  let clock = Date.now() + 10 * 60_000 - 20_000
  let state: QuizState = createQuizState(players, pool, count, 'apercu-tv', clock)

  const snap = (label: string): TvPreviewStep => ({ label, room: onlineRoom('quiz', state, { members, stateVersion: state.version }) })

  return {
    snap,
    get state() {
      return state
    },
    start() {
      clock += QUIZ_COUNTDOWN_MS
      state = reduceQuiz(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: clock })
    },
    /** Fait répondre les joueurs présents [from, to) selon `move(index)`, dans l'ordre (le plus rapide d'abord). */
    answer(move: (index: number) => Move, from = 0, to = players.length) {
      const answer = state.questions[state.qIdx].answer
      for (let i = from; i < to && state.phase === 'question'; i += 1) {
        const m = move(i)
        if (m === 'none' || state.players[i].leftAt) continue
        clock += 450
        const choice = m === 'right' ? answer : (answer + 1 + (i % 3)) % 4
        state = reduceQuiz(state, { type: 'ANSWER', playerId: players[i].id, choice, now: clock })
      }
    },
    leave(index: number) {
      clock += 200
      state = reduceQuiz(state, { type: 'LEAVE', playerId: players[index].id, at: clock })
    },
    /** Fin du temps (si tout le monde n'a pas répondu, le moteur a déjà révélé sinon). */
    close() {
      if (state.phase !== 'question' || state.phaseEndsAt === null) return
      clock = state.phaseEndsAt
      state = reduceQuiz(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: clock })
    },
    next() {
      clock += QUIZ_REVEAL_MIN_MS
      state = reduceQuiz(state, { type: 'CONTINUE', playerId: players[0].id, now: clock })
    },
    /** Votes de revanche : tenus par la salle en ligne, pas par le moteur du quiz. */
    rematch(userIds: string[]) {
      state = { ...state, rematchVotes: userIds, version: state.version + 1 }
    },
  }
}

/** Variété de résultats : le joueur 0 réussit toujours (série 🔥), les autres alternent. */
function moveOf(round: number) {
  return (i: number): Move => {
    if (i === 0) return 'right'
    const k = (i * 7 + round * 3) % 6
    return k < 3 ? 'right' : k < 5 ? 'wrong' : 'none'
  }
}

const correctOf = (q: QuizQuestion) => q.choices[q.answer]
const longestWord = (s: string) => Math.max(...s.split(/\s+/).map((w) => w.length))

function fullTable(): TvPreviewFixture {
  const g = newGame(13, 3, getQuizQuestions('fr'), 4)
  const steps: TvPreviewStep[] = [g.snap('compte à rebours')]
  g.start()
  steps.push(g.snap('question 1, personne n’a répondu'))
  g.answer(moveOf(0), 0, 9)
  steps.push(g.snap('question 1, 9 réponses sur 16'))
  g.answer(moveOf(0), 9)
  g.close()
  steps.push(g.snap('révélation 1'))
  for (let round = 1; round < 4; round += 1) {
    g.next()
    if (round === 3) {
      g.leave(10)
      g.answer(moveOf(round), 0, 5)
      steps.push(g.snap('question 4, série 🔥 de Léa, Nora partie (x/15)'))
    }
    g.answer(moveOf(round), round === 3 ? 5 : 0)
    g.close()
    steps.push(g.snap(`révélation ${round + 1}`))
  }
  g.next()
  steps.push(g.snap('podium'))
  g.rematch(['u1', 'u2', 'u5'])
  steps.push(g.snap('podium, revanche 3 votes'))
  return { id: 'partie-16', label: '16 joueurs (max), noms longs : de bout en bout', steps }
}

function smallTable(): TvPreviewFixture {
  const g = newGame(2, 0, getQuizQuestions('fr'), 3)
  const steps: TvPreviewStep[] = [g.snap('compte à rebours')]
  g.start()
  g.answer(() => 'right', 0, 1)
  steps.push(g.snap('question 1, 1 réponse sur 2'))
  g.answer(() => 'wrong', 1)
  steps.push(g.snap('révélation 1'))
  g.next()
  g.answer((i) => (i === 0 ? 'none' : 'right'))
  g.close()
  steps.push(g.snap('révélation 2, temps écoulé pour Léa'))
  g.next()
  g.answer(() => 'right')
  g.next()
  steps.push(g.snap('podium'))
  g.rematch(['u2'])
  steps.push(g.snap('podium, revanche 1/2'))
  return { id: 'partie-2', label: '2 joueurs', steps }
}

/**
 * Table de 6 aux noms longs (palier de classement sur deux lignes), sur les
 * questions dont la BONNE réponse est la plus longue ou a le mot le plus long :
 * c'est elle qui porte la coche et le compte à la révélation.
 */
function sixLongNames(): TvPreviewFixture {
  const fr = getQuizQuestions('fr')
  const byLength = [...fr].sort((a, b) => correctOf(b).length - correctOf(a).length)
  const byWord = [...fr].sort((a, b) => longestWord(correctOf(b)) - longestWord(correctOf(a)))
  const pool = [byLength[0], byWord[0], byLength[1]].filter((q, i, arr) => arr.indexOf(q) === i)
  const names = ['Jean-Baptiste', 'Marie-Charlotte', 'Pierre-Alexandre', 'Anne-Sophie', 'Maximilien']
  const g = newGame(5, 1, pool, pool.length, names)
  const moves = (round: number) => (i: number): Move => (i === 0 ? 'right' : (['right', 'wrong', 'none', 'right', 'wrong'] as const)[(i + round) % 5])
  g.start()
  const steps: TvPreviewStep[] = []
  for (let round = 0; round < pool.length; round += 1) {
    g.answer(moves(round), 0, 3)
    steps.push(g.snap(`question ${round + 1}, 3 réponses sur 6`))
    g.answer(moves(round), 3)
    g.close()
    steps.push(g.snap(`révélation ${round + 1}${round === 2 ? ', série 🔥 de Jean-Baptiste' : ''}`))
    g.next()
  }
  steps.push(g.snap('podium, 6 joueurs'))
  g.rematch(['u1', 'u3'])
  steps.push(g.snap('podium, revanche 2/5'))
  return { id: 'six-noms-longs', label: '6 joueurs aux noms longs, bonnes réponses longues', steps }
}

function mediumTable(): TvPreviewFixture {
  const g = newGame(8, 2, getQuizQuestions('fr'), 2)
  g.start()
  g.answer(moveOf(1), 0, 4)
  const steps: TvPreviewStep[] = [g.snap('question 1, 10 joueurs')]
  g.answer(moveOf(1), 4)
  g.close()
  steps.push(g.snap('révélation 1'))
  g.next()
  g.answer(moveOf(2))
  g.close()
  g.next()
  steps.push(g.snap('podium, 10 joueurs'))
  return { id: 'partie-10', label: '10 joueurs', steps }
}

/**
 * Les énoncés et choix les plus longs de toutes les banques, et la bonne
 * réponse la plus longue (révélée) : rien ne doit être coupé.
 */
function longTexts(): TvPreviewFixture {
  const longestQ = ALL_QUESTIONS.reduce((a, b) => (b.q.length > a.q.length ? b : a))
  const widest = (q: QuizQuestion) => Math.max(...q.choices.map((c) => c.length))
  const longestC = ALL_QUESTIONS.reduce((a, b) => (widest(b) > widest(a) ? b : a))
  const longestCorrect = ALL_QUESTIONS.reduce((a, b) => (correctOf(b).length > correctOf(a).length ? b : a))
  const pool = [longestQ, longestC, longestCorrect]
  const g = newGame(13, 3, pool, pool.length)
  g.start()
  const steps: TvPreviewStep[] = []
  for (let round = 0; round < pool.length; round += 1) {
    g.answer(moveOf(round), 0, 6)
    steps.push(g.snap(`question ${round + 1}`))
    g.answer(moveOf(round), 6)
    g.close()
    steps.push(g.snap(`révélation ${round + 1}`))
    if (round < pool.length - 1) g.next()
  }
  return { id: 'textes-longs', label: 'Énoncé, choix et bonne réponse les plus longs, 16 joueurs', steps }
}

export function build(): TvPreviewFixture[] {
  return [fullTable(), mediumTable(), sixLongNames(), smallTable(), longTexts()]
}
