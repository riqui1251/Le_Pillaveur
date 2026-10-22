import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { GAME_1220_SPEECH_KINDS, type Game1220Speech, type Game1220SpeechKind } from '@/lib/1220/engine'
import { Game1220SpeechFeed } from './Game1220SpeechFeed'

/**
 * Le fil des paroles du 12-20 rendu côté serveur avec le VRAI catalogue de
 * chaque langue : le lancer affiché seul, le masque « Sans alcool ».
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
const sp = (playerId: string, kind: Game1220SpeechKind, round: number, targetId = 'h'): Game1220Speech => ({
  playerId,
  kind,
  targetId,
  round,
})

function render(
  speech: Game1220Speech[],
  roll: number,
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', soft = false, speechBase = 0 } = {},
  errors: unknown[] = []
) {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(Game1220SpeechFeed, {
        view: { speech, speechBase, players: PLAYERS },
        roll,
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

describe('Game1220SpeechFeed', () => {
  it.each(LOCALES)('%s : chaque kind se rend, sans clé brute ni erreur ICU (téléphone et TV)', (locale) => {
    const speech = GAME_1220_SPEECH_KINDS.map((kind, i) => sp(i % 2 ? 'b1' : 'b2', kind, 3, i % 3 ? 'h' : 'b3'))
    for (const variant of ['phone', 'tv'] as const) {
      const errors: unknown[] = []
      const lines = bubbles(render(speech, 3, { locale, variant }, errors))
      expect(errors).toEqual([])
      expect(lines).toHaveLength(variant === 'tv' ? 4 : GAME_1220_SPEECH_KINDS.length)
      for (const line of lines) expect(line).not.toMatch(/botSay|\{|\}/)
    }
  })

  it('le lancer affiché seul : pendant que les dés roulent, les réactions du précédent', () => {
    const speech = [sp('b1', 'jinx', 4), sp('b2', 'bullseye', 5)]
    expect(bubbles(render(speech, 5))).toHaveLength(1)
    expect(bubbles(render(speech, 5))[0]).toContain('Gépéto')
    expect(bubbles(render(speech, 4))[0]).toContain('Raoul')
    expect(bubbles(render(speech.slice(1), 5, { speechBase: 1 }))).toEqual(bubbles(render(speech, 5)))
  })

  it('« Sans alcool » : le tic qui trinque (Marcel) se tait aussi', () => {
    const tic = (catalogue('fr') as { games: { '1220': { botTic: Record<string, string> } } }).games['1220'].botTic.marcel
    const speech = [sp('b4', 'jinx', 1)]
    expect(bubbles(render(speech, 1))[0]).toContain(tic)
    expect(bubbles(render(speech, 1, { soft: true }))[0]).not.toContain(tic)
  })

  it('« Sans alcool » : les piques qui parlent de boire disparaissent, les autres gardent leur phrase', () => {
    const speech = [sp('b1', 'jinx', 2), sp('b2', 'mock', 2), sp('b3', 'gift', 2), sp('b1', 'almost', 2)]
    const all = bubbles(render(speech, 2))
    expect(bubbles(render(speech, 2, { soft: true }))).toEqual([all[0], all[3]])
  })
})
