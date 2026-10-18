import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { ESPION_SPEECH_KINDS } from '@/lib/espion/engine'
import { ESPION_QUESTION_IDS, espionQuestionValues } from '@/lib/espion/data/questions'
import { BOT_PERSONAS } from '@/lib/online/bot-personas'
import { botLine } from '../bot-speech/bot-speech-feed'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  icuTranslator,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'
import fr from '../../../../messages/fr.json'
import en from '../../../../messages/en.json'
import es from '../../../../messages/es.json'
import it_ from '../../../../messages/it.json'

/**
 * Catalogue des paroles de L'Espion (games.espion.game), dans les 4 langues :
 * les exigences communes aux jeux à débat (catalogue-spec.ts), avec la
 * question et la réponse citées — 48 caractères au plus chacune
 * (data/qa-messages.test.ts), une bulle qui les cite tient en 80 —, et les
 * tics des personas, copies conformes de ceux du Loup-Garou.
 */

const FRAGMENT = 'x'.repeat(48)
const NODE = 'games.espion.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: ESPION_SPEECH_KINDS,
  traitKinds: ['answer', 'accuse', 'defend'],
  extraArgs: { question: FRAGMENT, answer: FRAGMENT },
  maxChars: 70,
  maxCharsWithExtraArgs: 80,
})

const MESSAGES: Record<string, unknown> = { fr, en, es, it: it_ }

/** Les vrais fragments d'une langue : chaque question et chaque réponse, toutes variantes. */
function fragments(locale: string): { questions: string[]; answers: string[] } {
  const qa = ((MESSAGES[locale] as { games: { espion: { game: { qa: Record<string, unknown> } } } }).games.espion.game.qa)
  const questions: string[] = []
  const answers: string[] = []
  for (const q of ESPION_QUESTION_IDS) {
    const node = qa[q] as Record<string, string>
    for (const [key, text] of Object.entries(node)) (key.startsWith('q') ? questions : answers).push(text)
    void espionQuestionValues(q)
  }
  for (const key of ['any', 'any_2', 'any_3']) answers.push(qa[key] as string)
  return { questions, answers }
}

describe('catalogue de l’Espion : la question et la réponse citées, et les tics', () => {
  const kindOf = (key: string) => key.split('.').pop()!.replace(/_\d+$/, '')

  it('{question} dans chaque variante de question, {answer} dans chaque réponse (traits compris), dans aucune autre phrase', () => {
    for (const locale of SPEECH_LOCALES) {
      const flat = flattenSpeechCatalogue(speechCatalogueOf(NODE, locale))
      for (const [key, text] of Object.entries(flat)) {
        if (key.startsWith('botTic.')) continue
        expect(/\{\s*question\b/.test(text), `${locale}.${key}`).toBe(kindOf(key) === 'question')
        expect(/\{\s*answer\b/.test(text), `${locale}.${key}`).toBe(kindOf(key) === 'answer')
      }
    }
  })

  it('les vrais fragments de chaque langue tiennent dans la bulle : 80 caractères au plus, accord compris', () => {
    for (const locale of SPEECH_LOCALES) {
      const flat = flattenSpeechCatalogue(speechCatalogueOf(NODE, locale))
      const { questions, answers } = fragments(locale)
      for (const [key, text] of Object.entries(flat)) {
        const kind = kindOf(key)
        if (kind !== 'question' && kind !== 'answer') continue
        const format = new IntlMessageFormat(text, locale)
        for (const fragment of kind === 'question' ? questions : answers) {
          for (const genre of ['f', 'm', 'other']) {
            const line = String(format.format({ name: 'Mauricette', speaker: genre, target: genre, question: fragment, answer: fragment }))
            expect([...line].length, `${locale}.${key} : ${line}`).toBeLessThanOrEqual(80)
          }
        }
      }
    }
  })

  it('les 20 tics sont ceux du Loup-Garou, mot pour mot, dans chaque langue', () => {
    for (const locale of SPEECH_LOCALES) {
      expect(speechCatalogueOf(NODE, locale).botTic, locale).toEqual(speechCatalogueOf('games.loup-garou.game', locale).botTic)
    }
  })

  it('une bulle de réponse de chaque persona cite la réponse et nomme celui qui a posé la question', () => {
    for (const locale of SPEECH_LOCALES) {
      const tr = icuTranslator(flattenSpeechCatalogue(speechCatalogueOf(NODE, locale)), locale)
      const { answers } = fragments(locale)
      for (const persona of BOT_PERSONAS) {
        for (const seed of ['a-0', 'b-1', 'c-2', 'd-3']) {
          const line = botLine('answer', { name: persona.name, isBot: true }, { name: 'Léa', isBot: false }, tr, {
            seed,
            values: { answer: answers[0], question: '' },
          })
          expect(line, `${locale}.${persona.name}`).toContain(answers[0])
          expect(line, `${locale}.${persona.name}`).toContain('Léa')
        }
      }
    }
  })
})
