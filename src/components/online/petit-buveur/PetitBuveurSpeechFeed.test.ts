import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { PbSpeech, PbSpeechKind } from '@/lib/petit-buveur/engine'
import { PetitBuveurSpeechFeed, settledSpeech, shownSpeechOf } from './PetitBuveurSpeechFeed'

/**
 * Le fil des paroles du Petit Buveur en ligne, rendu côté serveur avec le
 * VRAI catalogue de chaque langue : une clé absente ou un argument ICU mal
 * nommé ferait échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { 'petit-buveur': { game: { feedAria: string; botTic: Record<string, string> } } } })
    .games['petit-buveur'].game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

// isBot absent pour un humain, comme dans l'état du moteur.
const PLAYERS = [
  { id: 'h', name: 'Riqui' },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b2', name: 'Marcel', isBot: true },
]
const sp = (playerId: string, kind: PbSpeechKind, round = 3, targetId = 'h'): PbSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

function render(
  speech: PbSpeech[],
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', soft = false, tvSize = undefined as number | undefined } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(PetitBuveurSpeechFeed, {
        speech,
        round: 3,
        players: PLAYERS,
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? null : 'h',
        variant,
        soft,
        tvSize,
      })
    )
  )
}

describe('PetitBuveurSpeechFeed', () => {
  const FEED = [sp('b1', 'aim', 2), sp('b1', 'overtake'), sp('b2', 'payback')]

  it('une bulle par parole du tour de table en cours, auteur et cible nommés, dans les 4 langues', () => {
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
      expect(render([sp('b2', 'payback')], { locale }), locale).toContain(tic)
      const soft = render([sp('b2', 'payback')], { locale, soft: true })
      expect(soft, locale).not.toContain(tic)
      expect(soft.match(/<li/g), locale).toHaveLength(1)
    }
  })

  it('un kind inconnu de cet onglet est masqué, jamais rendu en clé brute', () => {
    const html = render([sp('b1', 'bavard' as PbSpeechKind), sp('b2', 'ouch')])
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })

  it('monté vide : la région aria-live existe avant la première bulle ; la TV ne garde que la dernière', () => {
    const empty = render([])
    expect(empty).toContain('aria-live="polite"')
    expect(empty).not.toContain('<li')
    const tv = render(FEED, { variant: 'tv', tvSize: 1 })
    expect(tv.match(/<li/g)).toHaveLength(1)
    expect(tv).toContain('Marcel')
    expect(tv).toContain('text-xl')
    expect(tv).not.toMatch(/\d+px/)
  })
})

describe('settledSpeech : la bulle attend que le plateau soit posé', () => {
  const before = shownSpeechOf([sp('b1', 'aim')], 3)
  const after = shownSpeechOf([sp('b1', 'aim'), sp('b2', 'ouch')], 3)

  it('pendant le dé, le pion qui marche ou le tirage, le fil d’avant reste ; posé, la nouvelle bulle arrive', () => {
    expect(settledSpeech(before, after, false)).toBe(before)
    expect(settledSpeech(before, after, true)).toBe(after)
    expect(settledSpeech(after, shownSpeechOf(after.speech, 3), true)).toBe(after)
  })

  it('nouveau tour de table : le fil change aussi, mais seulement une fois posé', () => {
    const nextRound = shownSpeechOf(after.speech, 4)
    expect(settledSpeech(after, nextRound, false)).toBe(after)
    expect(settledSpeech(after, nextRound, true)).toBe(nextRound)
    expect(shownSpeechOf(undefined, 1)).toEqual({ key: '1:0', speech: [], round: 1 })
  })
})
