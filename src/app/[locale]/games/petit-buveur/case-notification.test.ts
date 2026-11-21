import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '../../../../../messages/fr.json'
import en from '../../../../../messages/en.json'
import es from '../../../../../messages/es.json'
import itMessages from '../../../../../messages/it.json'
import { withAmbiance, type AmbianceMode } from './ambiance'
import { generateCase, getQuestions, type Case, type PetitBuveurT } from './case-config'
import {
  buildLastActionHtml,
  buildNotificationHtml,
  formatCaseDescription,
  toStoredCase,
  type EffectOutcome,
  type NotificationBuildContext,
} from './case-notification'
import { outcomeCaseBase, outcomeChallengeResult, outcomeCompose, outcomeI18n, outcomeSpared } from './outcome-helpers'

const CATALOGS = { fr, en, es, it: itMessages }
const PLAYERS = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
]

function translator(locale: keyof typeof CATALOGS, ambiance: AmbianceMode, errors: string[]): PetitBuveurT {
  const base = createTranslator({
    locale,
    messages: CATALOGS[locale] as never,
    namespace: 'games.petit-buveur' as never,
    onError: (e) => errors.push(`${locale}/${ambiance} ${e.message}`),
    getMessageFallback: ({ key }) => `MANQUE(${key})`,
  }) as unknown as PetitBuveurT
  return withAmbiance(base, ambiance)
}

function context(t: PetitBuveurT): NotificationBuildContext {
  return { t, players: PLAYERS, formatPlayerNameHtml: (p) => p.name, effectsSummaryHtml: '' }
}

/** Résultat d'un défi ou d'une question arbitrés, tel que le jeu local l'annonce. */
function challengeOutcome(completed: boolean, drinks: number): EffectOutcome {
  return outcomeCompose(
    outcomeCaseBase(),
    outcomeI18n('game.targetLabel', { playerRefs: { player: 'b' } }),
    outcomeChallengeResult('b', completed, drinks)
  )
}

describe('case Question : un énoncé à lire, pas seulement « réponds à voix haute »', () => {
  it('le tirage local porte une question du catalogue, dans les 4 langues', () => {
    for (const locale of Object.keys(CATALOGS) as (keyof typeof CATALOGS)[]) {
      const t = translator(locale, 'alcool', [])
      const questions = getQuestions(t)
      expect(questions.length).toBeGreaterThanOrEqual(20)
      let drawn: Case | null = null
      for (let i = 0; i < 5000 && !drawn; i += 1) {
        const c = generateCase('extreme', t)
        if (c.type === 'question') drawn = c
      }
      expect(drawn?.questionText).toBeTruthy()
      expect(questions).toContain(drawn?.questionText)
    }
  })

  it('la description cite la question et l’enjeu, en alcool comme en Soft', () => {
    for (const locale of Object.keys(CATALOGS) as (keyof typeof CATALOGS)[]) {
      for (const ambiance of ['alcool', 'soft'] as const) {
        const errors: string[] = []
        const t = translator(locale, ambiance, errors)
        const question = getQuestions(t)[0]
        const text = formatCaseDescription({ type: 'question', effect: 4, questionText: question }, t)
        expect(text).toContain(question)
        expect(text).toContain('4')
        expect(text).not.toMatch(/MANQUE\(|\{\w+\}/)
        expect(errors).toEqual([])
      }
    }
  })

  it('sans énoncé (partie sauvegardée avant) : l’ancienne formulation, sans clé brute', () => {
    const errors: string[] = []
    const text = formatCaseDescription({ type: 'question', effect: 2 }, translator('fr', 'alcool', errors))
    expect(text).toContain('2')
    expect(errors).toEqual([])
  })
})

describe('rappel « Action précédente » : la case telle qu’elle a été annoncée', () => {
  const defi: Case = { type: 'defi', effect: 3, defiChallenge: 'Raconte une blague' }
  const question: Case = { type: 'question', effect: 4, questionText: 'Quel est ton pire achat ?' }

  it.each([defi, question])('$type : le rappel garde l’énoncé et les gorgées', (c) => {
    const errors: string[] = []
    const ctx = context(translator('fr', 'alcool', errors))
    const stored = {
      turnNumber: 2,
      actorId: 'a',
      caseType: c.type,
      case: toStoredCase(c),
      outcome: challengeOutcome(false, c.effect),
      targetId: 'b',
    }
    const html = buildLastActionHtml(stored, ctx)
    expect(html).toContain(c.defiChallenge ?? c.questionText)
    expect(html).toBe(
      buildNotificationHtml({ case: toStoredCase(c), outcome: stored.outcome, includeEffectsSummary: false }, ctx)
    )
    expect(html).not.toMatch(/MANQUE\(|caseDescriptions/)
    expect(errors).toEqual([])
  })

  it('« Tout le monde boit » : le rappel cite les gorgées réelles, pas 0', () => {
    const ctx = context(translator('fr', 'alcool', []))
    const html = buildLastActionHtml(
      {
        turnNumber: 1,
        actorId: 'a',
        caseType: 'tous',
        case: { type: 'tous', effect: 2 },
        outcome: outcomeSpared('b'),
        targetId: 'b',
      },
      ctx
    )
    expect(html).toContain('boit 2 gorgée')
  })
})
