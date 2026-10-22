import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { PRE_SPEECH_KINDS, type PreSpeech, type PreSpeechKind } from '@/lib/president/engine'
import { PresidentSpeechFeed } from './PresidentSpeechFeed'

/**
 * Le fil des paroles du Président rendu côté serveur avec le VRAI catalogue
 * de chaque langue : une clé absente ou un argument ICU mal nommé ferait
 * échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b2', name: 'Bernadette', isBot: true },
  { id: 'b3', name: 'Gépéto', isBot: true },
]
const sp = (playerId: string, kind: PreSpeechKind, targetId: string, round = 1): PreSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

function render(speech: PreSpeech[], { locale = 'fr', variant = 'phone' as 'phone' | 'tv', manche = 1 } = {}, errors: unknown[] = []) {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(PresidentSpeechFeed, {
        view: { manche, speech, players: PLAYERS },
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? undefined : 'h',
        variant,
      })
    )
  )
}

const bubbles = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('PresidentSpeechFeed', () => {
  it.each(LOCALES)('%s : chaque kind se rend, accordé, sans clé brute ni erreur ICU (téléphone et TV)', (locale) => {
    const speech = PRE_SPEECH_KINDS.map((kind, i) => sp(i % 2 ? 'b1' : 'b2', kind, i % 3 ? 'h' : 'b3'))
    for (const variant of ['phone', 'tv'] as const) {
      const errors: unknown[] = []
      const html = render(speech, { locale, variant }, errors)
      expect(errors).toEqual([])
      const lines = bubbles(html)
      expect(lines).toHaveLength(variant === 'tv' ? 4 : PRE_SPEECH_KINDS.length)
      for (const line of lines) {
        expect(line).not.toMatch(/botSay|\{|\}/)
      }
    }
  })

  it('seule la manche en cours : les paroles de la manche close sortent du fil', () => {
    const html = render([sp('b1', 'cut', 'h', 0), sp('b2', 'hail', 'b1', 1)])
    expect(bubbles(html)).toHaveLength(1)
    expect(bubbles(html)[0]).toContain('Bernadette')
  })

  it('la bulle qui vise le spectateur est surlignée sur son téléphone', () => {
    const html = render([sp('b1', 'cut', 'h')])
    expect(html).toContain('bg-gold/20')
    expect(render([sp('b1', 'cut', 'b2')])).not.toContain('bg-gold/20')
  })
})
