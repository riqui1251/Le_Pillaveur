import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { MCClientView, MCSpeech } from '@/lib/mots-codes/engine'
import { MotsCodesSpeechFeed } from './MotsCodesSpeechFeed'

/**
 * Le fil des paroles des Mots Codés, rendu côté serveur avec le VRAI
 * catalogue de chaque langue : la « manche » est le tour d'équipe.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
type Game = { feedAria: string; botTic: Record<string, string>; botTicSoft: Record<string, string> }
const game = (locale: string) =>
  (catalogue(locale) as unknown as { games: { 'mots-codes': { game: Game } } }).games['mots-codes'].game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS: MCClientView['players'] = [
  { id: 'h', name: 'Riqui', isBot: false, leftAt: null, team: 'gold', isSpymaster: false },
  { id: 'c', name: 'Paulo', isBot: true, leftAt: null, team: 'gold', isSpymaster: false },
  { id: 'm', name: 'Marcel', isBot: true, leftAt: null, team: 'red', isSpymaster: false },
]
const sp = (playerId: string, kind: MCSpeech['kind'], targetId: string, round = 4): MCSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

function render(
  speech: MCSpeech[],
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', soft = false } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(MotsCodesSpeechFeed, {
        view: { turn: 4, players: PLAYERS, speech },
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? null : 'h',
        variant,
        soft,
      })
    )
  )
}

describe('MotsCodesSpeechFeed', () => {
  it('une bulle par parole du tour d’équipe, dans les 4 langues, téléphone et TV', () => {
    const feed = [sp('c', 'nice', 'h', 3), sp('c', 'oops', 'h'), sp('m', 'thanks', 'h'), sp('m', 'assassin', 'h')]
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(feed, { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(3)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      expect(render(feed, { locale, variant: 'tv' }).match(/<li/g), `${locale} tv`).toHaveLength(3)
    }
  })

  it('ambiance « Sans alcool » : Marcel ne trinque plus', () => {
    for (const locale of LOCALES) {
      const { botTic, botTicSoft } = game(locale)
      expect(render([sp('m', 'thanks', 'h')], { locale }), locale).toContain(botTic.marcel)
      const soft = render([sp('m', 'thanks', 'h')], { locale, soft: true })
      expect(soft, locale).toContain(botTicSoft.marcel)
      expect(soft, locale).not.toContain(botTic.marcel)
    }
  })

  it('un kind inconnu de cet onglet est masqué, jamais rendu en clé brute', () => {
    const html = render([sp('c', 'bavard' as MCSpeech['kind'], 'h'), sp('m', 'tease', 'h')])
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })
})
