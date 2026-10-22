import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { CrobardClientView, CrobardSpeech } from '@/lib/crobard/engine'
import { CrobardSpeechFeed } from './CrobardSpeechFeed'

/**
 * Le fil des paroles du Crobard, rendu côté serveur avec le VRAI catalogue
 * de chaque langue, tics retouchés compris.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
type Game = Record<string, string> & { botTic: Record<string, string> } & Record<string, Record<string, string>>
const game = (locale: string) => (catalogue(locale) as unknown as { games: { crobard: { game: Game } } }).games.crobard.game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS: CrobardClientView['players'] = [
  { id: 'h', name: 'Riqui', isBot: false, leftAt: null, score: 0 },
  { id: 'm', name: 'Marcel', isBot: true, leftAt: null, score: 0 },
  { id: 'g', name: 'Gaston', isBot: true, leftAt: null, score: 0 },
]
const sp = (playerId: string, kind: CrobardSpeech['kind'], targetId: string, round = 3): CrobardSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

function render(
  speech: CrobardSpeech[],
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', soft = false } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(CrobardSpeechFeed, {
        view: { round: 3, players: PLAYERS, speech },
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? null : 'h',
        variant,
        soft,
      })
    )
  )
}

describe('CrobardSpeechFeed', () => {
  it('une bulle par parole de la manche, dans les 4 langues, téléphone et TV', () => {
    const feed = [sp('m', 'go', 'h', 2), sp('m', 'puzzled', 'h'), sp('g', 'first', 'h'), sp('m', 'stumped', 'h')]
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(feed, { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(3)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      expect(render(feed, { locale, variant: 'tv' }).match(/<li/g), `${locale} tv`).toHaveLength(3)
    }
  })

  it('tics : Gaston ne dit jamais « papillon » au Crobard, Marcel ne trinque pas en ambiance soft', () => {
    for (const locale of LOCALES) {
      const g = game(locale)
      const html = render([sp('g', 'found', 'h'), sp('m', 'found', 'h')], { locale })
      expect(html, locale).toContain(g.botTicAlt.gaston)
      expect(html, locale).not.toContain('papillon')
      expect(render([sp('m', 'go', 'h')], { locale }), locale).toContain(g.botTic.marcel)
      expect(render([sp('m', 'go', 'h')], { locale, soft: true }), locale).not.toContain(g.botTic.marcel)
    }
  })

  it('un kind inconnu de cet onglet est masqué, jamais rendu en clé brute', () => {
    const html = render([sp('m', 'bavard' as CrobardSpeech['kind'], 'h'), sp('g', 'bravo', 'h')])
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })
})
