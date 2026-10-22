import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { TC_SPEECH_KINDS, type TCSpeech, type TCSpeechKind } from '@/lib/toucher-coule/engine'
import { speechFeedItems } from '../bot-speech/bot-speech-feed'
import { ToucherCouleSpeechFeed } from './ToucherCouleSpeechFeed'

/**
 * Le fil des paroles du Touché-Coulé rendu côté serveur avec le VRAI
 * catalogue de chaque langue, et sa fenêtre : la fenêtre de tours en cours
 * et la précédente, des bulles stables quand le moteur élague le début.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'b2', name: 'Gépéto', isBot: true },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b3', name: 'Bernadette', isBot: true },
]
const TURN_ORDER = ['h', 'b2', 'b1', 'b3']
const sp = (playerId: string, kind: TCSpeechKind, targetId: string, round: number): TCSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

type View = { turnCount: number; speech: TCSpeech[]; speechBase?: number }

function render(view: View, { locale = 'fr', variant = 'phone' as 'phone' | 'tv' } = {}, errors: unknown[] = []) {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(ToucherCouleSpeechFeed, {
        view: { ...view, turnOrder: TURN_ORDER, players: PLAYERS },
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? undefined : 'h',
        variant,
      })
    )
  )
}

const bubbles = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('ToucherCouleSpeechFeed', () => {
  it.each(LOCALES)('%s : chaque kind se rend, sans clé brute ni erreur ICU (téléphone et TV)', (locale) => {
    const speech = TC_SPEECH_KINDS.map((kind, i) => sp(i % 2 ? 'b1' : 'b2', kind, i % 3 ? 'h' : 'b3', 0))
    for (const variant of ['phone', 'tv'] as const) {
      const errors: unknown[] = []
      const lines = bubbles(render({ turnCount: 1, speech }, { locale, variant }, errors))
      expect(errors).toEqual([])
      expect(lines).toHaveLength(variant === 'tv' ? 4 : TC_SPEECH_KINDS.length)
      for (const line of lines) expect(line).not.toMatch(/botSay|\{|\}/)
    }
  })

  it('fenêtre : celle des tours en cours et la précédente (4 tours par fenêtre en 2v2)', () => {
    const speech = [sp('b1', 'miss', 'b3', 0), sp('b2', 'sunk', 'h', 1), sp('b3', 'taunt', 'h', 2)]
    expect(bubbles(render({ turnCount: 9, speech }))).toHaveLength(2)
    expect(bubbles(render({ turnCount: 5, speech: speech.slice(0, 2) }))).toHaveLength(2)
    expect(bubbles(render({ turnCount: 13, speech }))).toHaveLength(1)
  })

  it('élagage du moteur : avec speechBase, les bulles gardent leur clé, donc leur phrase', () => {
    const speech = [sp('b1', 'miss', 'b3', 0), sp('b2', 'sunk', 'h', 1), sp('b3', 'taunt', 'h', 1), sp('b1', 'hit', 'b2', 2)]
    const full = bubbles(render({ turnCount: 9, speech }))
    const pruned = bubbles(render({ turnCount: 9, speech: speech.slice(1), speechBase: 1 }))
    expect(pruned).toEqual(full)
    const keys = (list: TCSpeech[], base: number) =>
      speechFeedItems(list, 2, 'h', undefined, { since: 1, indexBase: base }).map((i) => i.key)
    expect(keys(speech.slice(1), 1)).toEqual(keys(speech, 0))
  })

  it('le tic se compte par fenêtre : la bulle déjà à l’écran ne le gagne pas quand la fenêtre glisse', () => {
    const speech = [sp('b2', 'sunk', 'h', 0), sp('b2', 'hit', 'h', 1)]
    const firsts = (since: number, round: number) =>
      speechFeedItems(speech, round, null, undefined, { since }).map((i) => i.firstOfAuthor)
    expect(firsts(0, 1)).toEqual([true, true])
    expect(firsts(1, 2)).toEqual([true])
  })
})
