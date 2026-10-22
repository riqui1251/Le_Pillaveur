import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { TabouClientView, TabouSpeech } from '@/lib/tabou/engine'
import { TabouSpeechFeed } from './TabouSpeechFeed'

/**
 * Le fil des paroles du Tabou, rendu côté serveur avec le VRAI catalogue de
 * chaque langue : une clé absente ou un argument ICU mal nommé ferait
 * échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { tabou: { game: Record<string, Record<string, string> | string> } } }).games.tabou
    .game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS: TabouClientView['players'] = [
  { id: 'h', name: 'Riqui', isBot: false, leftAt: null, team: 'A' },
  { id: 'c', name: 'Paulo', isBot: true, leftAt: null, team: 'A' },
  { id: 'm', name: 'Marcel', isBot: true, leftAt: null, team: 'B' },
]
const sp = (playerId: string, kind: TabouSpeech['kind'], targetId: string, round = 2): TabouSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})
const view = (speech: TabouSpeech[]) => ({ round: 2, players: PLAYERS, speech })

function render(
  speech: TabouSpeech[],
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', soft = false } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(TabouSpeechFeed, {
        view: view(speech),
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? null : 'h',
        variant,
        soft,
      })
    )
  )
}

const FEED = [sp('m', 'jinx', 'h', 1), sp('c', 'go', 'h'), sp('m', 'jinx', 'h'), sp('c', 'found', 'h')]

describe('TabouSpeechFeed', () => {
  it('une bulle par parole de la manche, auteur et cible nommés, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(FEED, { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(3)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      for (const name of ['Paulo', 'Marcel', 'Riqui']) expect(html, locale).toContain(name)
      expect(render(FEED, { locale, variant: 'tv' }).match(/<li/g), `${locale} tv`).toHaveLength(3)
    }
  })

  it('ambiance « Sans alcool » : Marcel ne trinque plus, son tic prend sa variante soft', () => {
    for (const locale of LOCALES) {
      const { botTic, botTicSoft } = game(locale) as Record<string, Record<string, string>>
      const normal = render([sp('m', 'jinx', 'h')], { locale })
      const soft = render([sp('m', 'jinx', 'h')], { locale, soft: true })
      expect(normal, locale).toContain(botTic.marcel)
      expect(soft, locale).not.toContain(botTic.marcel)
      expect(soft, locale).toContain(botTicSoft.marcel)
    }
  })

  it('un kind inconnu de cet onglet est masqué, jamais rendu en clé brute', () => {
    const html = render([sp('c', 'bavard' as TabouSpeech['kind'], 'h'), sp('m', 'tease', 'h')])
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })

  it('monté vide : la région aria-live existe avant la première bulle', () => {
    const html = render([])
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('<li')
  })
})
