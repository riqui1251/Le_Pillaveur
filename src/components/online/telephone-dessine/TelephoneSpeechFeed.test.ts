import { readFileSync } from 'node:fs'
import React, { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { TelephoneClientView, TelephoneSpeech, TelephoneSpeechKind } from '@/lib/telephone-dessine/engine'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/telephone-dessine'
import { TvTelephoneDessine } from '@/components/tv/TvTelephoneDessine'
import { TelephoneSpeechFeed } from './TelephoneSpeechFeed'

;(globalThis as { React?: typeof React }).React = React

/**
 * Le fil des paroles du Téléphone dessiné, rendu côté serveur avec le VRAI
 * catalogue de chaque langue : une bulle à la chute de la chaîne à l'écran,
 * au téléphone comme à la TV.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { 'telephone-dessine': { game: { feedAria: string; botTic: Record<string, string> } } } })
    .games['telephone-dessine'].game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS = [
  { id: 'h1', name: 'Riqui', isBot: false },
  { id: 'h2', name: 'Léa', isBot: false },
  { id: 'b1', name: 'Paul', isBot: true },
  { id: 'b2', name: 'Marcel', isBot: true },
]
/** 3 manches de contribution : la 1re chaîne révélée parle en « manche » 3, la 2e en 4. */
const VIEW = { phase: 'reveal' as const, round: 2, totalRounds: 3, revealIdx: 1, players: PLAYERS }
const sp = (playerId: string, kind: TelephoneSpeechKind, round = 4): TelephoneSpeech => ({
  playerId,
  kind,
  targetId: 'h1',
  round,
})

function render(
  speech: TelephoneSpeech[],
  { locale = 'fr', soft = false } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(TelephoneSpeechFeed, {
        view: { ...VIEW, speech },
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: 'h1',
        variant: 'phone',
        soft,
      })
    )
  )
}

describe('TelephoneSpeechFeed', () => {
  it('seule la chaîne à l’écran parle, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render([sp('b1', 'laugh', 3), sp('b1', 'laugh'), sp('b2', 'intact', 4)], { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(2)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      expect(html, locale).toContain('Riqui')
    }
  })

  it('Sans alcool : le tic qui trinque est tu ; un kind inconnu est masqué', () => {
    const tic = game('fr').botTic.marcel
    expect(render([sp('b2', 'laugh')])).toContain(tic)
    expect(render([sp('b2', 'laugh')], { soft: true })).not.toContain(tic)
    const html = render([sp('b1', 'bavard' as TelephoneSpeechKind), sp('b1', 'encore')])
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })
})

describe('TvTelephoneDessine : la réaction à côté du meneur attendu', () => {
  const steps = build().flatMap((f) => f.steps)
  const step = steps.find((s) => {
    const v = JSON.parse(s.room!.gameStateJson!) as TelephoneClientView
    return v.phase === 'reveal' && v.revealChain !== null && v.revealChain.links.length === v.revealChain.linkCount
  })!
  const base = JSON.parse(step.room!.gameStateJson!) as TelephoneClientView
  const bot = base.players[base.players.length - 1]
  const human = base.players[0]
  const state: TelephoneClientView = {
    ...base,
    players: base.players.map((p) => (p.id === bot.id ? { ...p, isBot: true } : p)),
    speech: [{ playerId: bot.id, kind: 'laugh', targetId: human.id, round: base.totalRounds + base.revealIdx }],
  }
  const html = (s: TelephoneClientView) =>
    renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'fr', messages: catalogue('fr'), timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
        createElement(TvTelephoneDessine, { room: step.room!, state: s })
      )
    )

  it('la bulle est là, en tailles de TV, sans largeur ni hauteur en pixels', () => {
    const out = html(state)
    expect(out).toContain(`aria-label="${game('fr').feedAria}"`)
    expect(out).toContain(human.name)
    expect(out).not.toMatch(/\btext-(xs|sm)\b/)
    // Le décalage d'entrée des bulles (framer-motion, translateY) n'est pas une taille.
    expect(out).not.toMatch(/style="[^"]*(width|height|font-size|padding|border-radius):[^;"]*\dpx/)
  })

  it('sans parole, le rendu d’avant : le meneur attendu, centré', () => {
    const out = html(base)
    expect(out).not.toContain(`aria-label="${game('fr').feedAria}"`)
  })
})
