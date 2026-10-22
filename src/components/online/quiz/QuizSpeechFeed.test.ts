import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { QuizSpeech, QuizSpeechKind } from '@/lib/quiz/engine'
import { QuizSpeechFeed } from './QuizSpeechFeed'

/**
 * Le fil des paroles du Grand Pillaveur, rendu côté serveur avec le VRAI
 * catalogue de chaque langue : une clé absente ou un argument ICU mal nommé
 * ferait échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { quiz: { game: { feedAria: string; botTic: Record<string, string> } } } }).games.quiz.game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b2', name: 'Marcel', isBot: true },
]
const sp = (playerId: string, kind: QuizSpeechKind, round = 1, targetId = 'h'): QuizSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

function render(
  speech: QuizSpeech[],
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', soft = false } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(QuizSpeechFeed, {
        speech,
        qIdx: 1,
        players: PLAYERS,
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? null : 'h',
        variant,
        soft,
      })
    )
  )
}

describe('QuizSpeechFeed', () => {
  const FEED = [sp('b1', 'sure', 0), sp('b1', 'sure'), sp('b2', 'knewIt')]

  it('une bulle par parole de la question en cours, auteur et cible nommés, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(FEED, { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(2)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      expect(html, locale).toContain('Raoul')
      expect(html, locale).toContain('Riqui')
    }
  })

  it('Sans alcool : le tic qui trinque de Marcel est tu, la phrase reste', () => {
    for (const locale of LOCALES) {
      const tic = game(locale).botTic.marcel
      expect(render([sp('b2', 'knewIt')], { locale }), locale).toContain(tic)
      const soft = render([sp('b2', 'knewIt')], { locale, soft: true })
      expect(soft, locale).not.toContain(tic)
      expect(soft.match(/<li/g), locale).toHaveLength(1)
    }
  })

  it('un kind inconnu de cet onglet est masqué, jamais rendu en clé brute', () => {
    const html = render([sp('b1', 'bavard' as QuizSpeechKind), sp('b2', 'asleep')])
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })

  it('monté vide : la région aria-live existe avant la première bulle ; la TV rend les mêmes bulles', () => {
    const empty = render([])
    expect(empty).toContain('aria-live="polite"')
    expect(empty).not.toContain('<li')
    const tv = render(FEED, { variant: 'tv' })
    expect(tv.match(/<li/g)).toHaveLength(2)
    expect(tv).toContain('text-xl')
  })
})
