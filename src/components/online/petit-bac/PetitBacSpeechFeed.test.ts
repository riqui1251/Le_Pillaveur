import { readFileSync } from 'node:fs'
import React, { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { PbcClientView, PbcRevealCell, PbcSpeech, PbcSpeechKind } from '@/lib/petit-bac/engine'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/petit-bac'
import { TvPetitBac } from '@/components/tv/TvPetitBac'
import { PetitBacSpeechFeed } from './PetitBacSpeechFeed'

;(globalThis as { React?: typeof React }).React = React

/**
 * Le fil des paroles du Petit Bac, rendu côté serveur avec le VRAI catalogue
 * de chaque langue : la bulle d'un commentaire de grille cite la réponse lue
 * dans la grille publique, au téléphone comme à la TV.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { 'petit-bac': { game: { feedAria: string; botTic: Record<string, string> } } } })
    .games['petit-bac'].game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS = [
  { id: 'h1', name: 'Riqui', isBot: false },
  { id: 'h2', name: 'Léa', isBot: false },
  { id: 'b1', name: 'Paul', isBot: true },
  { id: 'b2', name: 'Marcel', isBot: true },
]
const cell = (playerId: string, answer: string, points: number): PbcRevealCell => ({
  playerId,
  answer,
  points,
  contestCount: 0,
  iContested: false,
  rejected: false,
})
const GRID: PbcRevealCell[][] = [
  [cell('h1', 'Ornithorynque', 2), cell('h2', 'Bison', 2), cell('b1', '', 0)],
  [cell('h1', 'Brest', 1), cell('h2', 'brest', 1), cell('b1', '', 0)],
]
const sp = (playerId: string, kind: PbcSpeechKind, extra: Partial<PbcSpeech> = {}): PbcSpeech => ({
  playerId,
  kind,
  targetId: 'h1',
  round: 1,
  ...extra,
})

function render(
  speech: PbcSpeech[],
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', soft = false } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(PetitBacSpeechFeed, {
        view: { speech, round: 1, revealGrid: GRID, players: PLAYERS },
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId: variant === 'tv' ? null : 'h1',
        variant,
        soft,
      })
    )
  )
}

describe('PetitBacSpeechFeed', () => {
  const FEED = [sp('b1', 'stop', { round: 0 }), sp('b1', 'stop'), sp('b1', 'contest', { category: 0 })]

  it('une bulle par parole de la manche, la réponse commentée citée, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(FEED, { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(2)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      expect(html, locale).toContain('Ornithorynque')
      expect(html, locale).toContain('Riqui')
    }
  })

  it('le doublon cite la réponse de sa cible ; une case hors grille donne un tiret, jamais un trou', () => {
    expect(render([sp('b1', 'twin', { category: 1, targetId: 'h2' })])).toContain('brest')
    const lost = render([sp('b1', 'contest', { category: 7 })])
    expect(lost).toContain('—')
    expect(lost).not.toContain('{answer}')
  })

  it('Sans alcool : le tic qui trinque est tu ; un kind inconnu est masqué', () => {
    const tic = game('fr').botTic.marcel
    expect(render([sp('b2', 'stop')])).toContain(tic)
    expect(render([sp('b2', 'stop')], { soft: true })).not.toContain(tic)
    const html = render([sp('b1', 'bavard' as PbcSpeechKind), sp('b1', 'tease')])
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })
})

describe('TvPetitBac : le fil sous la grille de la révélation', () => {
  const steps = build().flatMap((f) => f.steps)
  const step = steps.find((s) => (JSON.parse(s.room!.gameStateJson!) as PbcClientView).phase === 'reveal')!
  const base = JSON.parse(step.room!.gameStateJson!) as PbcClientView
  const botId = base.players[base.players.length - 1].id
  // Un déserteur converti commente la première réponse à 2 points d'un autre.
  const target = base.revealGrid!.flatMap((col, c) => col.map((x) => ({ ...x, c }))).find((x) => x.points === 2 && x.playerId !== botId && /^[\p{L} -]{2,20}$/u.test(x.answer))!
  const state: PbcClientView = {
    ...base,
    players: base.players.map((p) => (p.id === botId ? { ...p, isBot: true } : p)),
    speech: [{ playerId: botId, kind: 'contest', targetId: target.playerId, round: base.round, category: target.c }],
  }
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: catalogue('fr'), timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvPetitBac, { room: step.room!, state })
    )
  )

  it('la bulle est là, cite la réponse, en tailles de TV', () => {
    expect(html).toContain(`aria-label="${game('fr').feedAria}"`)
    expect(html).toContain(`« ${target.answer.trim()} »`)
    expect(html).not.toMatch(/\btext-(xs|sm)\b/)
  })

  it('sans parole, aucune bande de fil', () => {
    const silent = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'fr', messages: catalogue('fr'), timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
        createElement(TvPetitBac, { room: step.room!, state: base })
      )
    )
    expect(silent).not.toContain(`aria-label="${game('fr').feedAria}"`)
  })
})
