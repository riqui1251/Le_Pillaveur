import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { PURPLE_SPEECH_KINDS, type PurpleSpeech, type PurpleSpeechKind } from '@/lib/purple/engine'
import { PurpleSpeechFeed } from './PurpleSpeechFeed'

/**
 * Le fil des paroles du Purple rendu côté serveur avec le VRAI catalogue de
 * chaque langue, sa fenêtre de tours, et le masque « Sans alcool ».
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
  { id: 'b2', name: 'Gépéto', isBot: true },
  { id: 'b3', name: 'Bernadette', isBot: true },
  { id: 'b4', name: 'Marcel', isBot: true },
]
const sp = (playerId: string, kind: PurpleSpeechKind, targetId: string, round = 0): PurpleSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

function render(
  view: { turn: number; speech: PurpleSpeech[]; speechBase?: number },
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', soft = false } = {},
  errors: unknown[] = []
) {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(PurpleSpeechFeed, {
        view: { ...view, players: PLAYERS },
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? undefined : 'h',
        variant,
        soft,
      })
    )
  )
}

const bubbles = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('PurpleSpeechFeed', () => {
  it.each(LOCALES)('%s : chaque kind se rend, sans clé brute ni erreur ICU (téléphone et TV)', (locale) => {
    const speech = PURPLE_SPEECH_KINDS.map((kind, i) => sp(i % 2 ? 'b1' : 'b2', kind, i % 3 ? 'h' : 'b3'))
    for (const variant of ['phone', 'tv'] as const) {
      const errors: unknown[] = []
      const lines = bubbles(render({ turn: 0, speech }, { locale, variant }, errors))
      expect(errors).toEqual([])
      expect(lines).toHaveLength(variant === 'tv' ? 4 : PURPLE_SPEECH_KINDS.length)
      for (const line of lines) expect(line).not.toMatch(/botSay|\{|\}/)
    }
  })

  it('« Sans alcool » : la pique qui parle de boire disparaît, les autres bulles gardent leur phrase', () => {
    const speech = [sp('b1', 'panache', 'h'), sp('b2', 'mock', 'h'), sp('b3', 'lament', 'h'), sp('b1', 'handOff', 'h')]
    const all = bubbles(render({ turn: 0, speech }))
    const soft = bubbles(render({ turn: 0, speech }, { soft: true }))
    expect(all).toHaveLength(4)
    expect(soft).toEqual([all[0], all[2], all[3]])
  })

  it('« Sans alcool » : le tic qui trinque (Marcel) se tait aussi', () => {
    const tic = (catalogue('fr') as { games: { purple: { botTic: Record<string, string> } } }).games.purple.botTic.marcel
    const speech = [sp('b4', 'lament', 'h')]
    expect(bubbles(render({ turn: 0, speech }))[0]).toContain(tic)
    expect(bubbles(render({ turn: 0, speech }, { soft: true }))[0]).not.toContain(tic)
  })

  it('fenêtre : celle des tours en cours et la précédente ; élagage du moteur sans changer une bulle', () => {
    const speech = [sp('b1', 'panache', 'h', 0), sp('b2', 'mock', 'h', 1), sp('b3', 'lament', 'h', 2)]
    expect(bubbles(render({ turn: 12, speech }))).toHaveLength(2)
    expect(bubbles(render({ turn: 18, speech }))).toHaveLength(1)
    expect(bubbles(render({ turn: 12, speech: speech.slice(1), speechBase: 1 }))).toEqual(bubbles(render({ turn: 12, speech })))
  })
})
