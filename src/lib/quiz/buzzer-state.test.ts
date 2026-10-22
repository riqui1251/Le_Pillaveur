import { describe, expect, it } from 'vitest'
import { quizBuzzerState, type QuizBuzzerInput } from './buzzer-state'

const states = (input: QuizBuzzerInput) => [0, 1, 2, 3].map((idx) => quizBuzzerState(idx, input))

describe('quizBuzzerState', () => {
  it('question sans réponse : les quatre buzzers sont ouverts', () => {
    expect(states({ phase: 'question', myChoice: null, pendingChoice: null })).toEqual(['open', 'open', 'open', 'open'])
  })

  it('envoi en cours : la case touchée tourne, les autres s’éteignent', () => {
    expect(states({ phase: 'question', myChoice: null, pendingChoice: 2 })).toEqual(['locked', 'locked', 'sending', 'locked'])
  })

  it('réponse enregistrée : le choix du serveur l’emporte sur la case en attente', () => {
    expect(states({ phase: 'question', myChoice: 1, pendingChoice: 2 })).toEqual(['locked', 'chosen', 'locked', 'locked'])
  })

  it('reveal : bonne réponse, mon mauvais choix lu dans le résultat, autres atténuées', () => {
    expect(
      states({ phase: 'reveal', myChoice: null, pendingChoice: null, answer: 3, revealChoice: 0 })
    ).toEqual(['wrongMine', 'wrong', 'wrong', 'correct'])
  })

  it('reveal : mon bon choix reste la bonne réponse', () => {
    expect(
      states({ phase: 'reveal', myChoice: null, pendingChoice: null, answer: 1, revealChoice: 1 })
    ).toEqual(['wrong', 'correct', 'wrong', 'wrong'])
  })

  it('reveal sans réponse de ma part : aucune case n’est « mon choix »', () => {
    expect(
      states({ phase: 'reveal', myChoice: null, pendingChoice: null, answer: 2, revealChoice: null })
    ).toEqual(['wrong', 'wrong', 'correct', 'wrong'])
  })
})
