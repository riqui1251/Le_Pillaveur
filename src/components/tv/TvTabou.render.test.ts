import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { TabouClientView } from '@/lib/tabou/engine'
import { getTabouWords } from '@/lib/tabou/data'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/tabou'
import { TvTabou } from './TvTabou'

;(globalThis as { React?: typeof React }).React = React

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))
const WORDS = getTabouWords('fr')

function render(step: (typeof steps)[number]): { html: string; view: TabouClientView } {
  const room = step.room!
  const view = JSON.parse(room.gameStateJson!) as TabouClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvTabou, { room, state: view })
    )
  )
  return { html, view }
}

describe('TvTabou — écran TV du Tabou Vocal', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['countdown', 'describing', 'finished', 'roundEnd'])
  })

  it('ne reçoit ni ne montre le mot en cours ou ses tabous pendant la manche', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      expect(view.currentWord).toBeNull()
      expect(JSON.stringify(view)).not.toMatch(/"allWords"|"remainingWords"|"rngState"/)
      if (view.phase !== 'describing' && view.phase !== 'countdown') continue
      const shown = WORDS.filter((w) => html.includes(`>${w.word}<`) || html.includes(` ${w.word} `))
      expect(shown).toEqual([])
      expect(html).not.toContain('Mots interdits')
    }
  })

  it('montre au bilan le dernier mot, sans ses mots tabous (le téléphone ne les montre pas)', () => {
    const roundEnds = steps.map(render).filter(({ view }) => view.phase === 'roundEnd')
    expect(roundEnds.length).toBeGreaterThan(0)
    for (const { html, view } of roundEnds) {
      expect(html).toContain(view.lastRoundWord!.word)
      for (const banned of view.lastRoundWord!.taboo) expect(html).not.toContain(`>${banned}<`)
    }
  })

  it('pendant la manche : décrivant, scores des deux équipes et tous les joueurs', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'describing') continue
      const describer = view.players.find((p) => p.id === view.describerId)!
      expect(html).toContain(`${describer.name} décrit…`)
      for (const p of view.players) expect(html).toContain(p.name)
      expect(html).toContain(`>${view.scores.A}<`)
      expect(html).toContain(`>${view.scores.B}<`)
    }
  })

  it('montre à la fin le compteur de revanche, comme les téléphones', () => {
    const finished = steps.map(render).filter(({ view }) => view.phase === 'finished')
    for (const { html, view } of finished) {
      const votes = view.rematchVotes ?? []
      if (votes.length === 0) expect(html).not.toContain('Revanche en cours')
      else expect(html).toContain(`Revanche en cours… <span class="tabular-nums">${votes.length}/`)
    }
    expect(finished.some(({ view }) => (view.rematchVotes ?? []).length > 0)).toBe(true)
  })

  it('le bandeau du joueur parti tient sur deux lignes sans couper le décompte', () => {
    const left = steps.map(render).filter(({ view }) => view.phase === 'describing' && view.players.some((p) => !p.isBot && p.leftAt))
    expect(left.length).toBeGreaterThan(0)
    for (const { html } of left) {
      expect(html).toMatch(/En attente du retour de Marie-Charlotte — bot dans \d+s/)
      expect(html).not.toMatch(/truncate[^"]*amber-100|amber-100[^"]*truncate/)
    }
  })

  it('aucune taille interdite à 3 mètres', () => {
    for (const step of steps) {
      const { html } = render(step)
      expect(html).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]/)
    }
  })
})
