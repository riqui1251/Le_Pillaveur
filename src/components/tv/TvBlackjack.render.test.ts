import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { BlackjackSyncedState } from '@/lib/online-game-state'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/blackjack'
import { TvBlackjack } from './TvBlackjack'

;(globalThis as { React?: typeof React }).React = React

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function render(step: (typeof steps)[number]): { html: string; view: BlackjackSyncedState } {
  const room = step.room!
  const view = JSON.parse(room.gameStateJson!) as BlackjackSyncedState
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvBlackjack, { room, state: view })
    )
  )
  return { html, view }
}

const find = (fixture: string, label: string) => render(steps.find((s) => s.fixture === fixture && s.label === label)!)

describe('TvBlackjack — écran TV', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['betting', 'finished', 'playing', 'results'])
  })

  it('ne livre ni le sabot ni la carte fermée du croupier pendant le jeu', () => {
    for (const step of steps) {
      const { view } = render(step)
      expect(view).not.toHaveProperty('shoe')
      expect(view).not.toHaveProperty('rngState')
      if (view.phase === 'playing') expect(view.dealer[1]).toBeNull()
    }
  })

  it('pose la table imprimée, puis le solde de chaque place en fin de manche', () => {
    const betting = find('mises-6', 'mises').html
    expect(betting).toContain('Le Black Jack paie 3 pour 2')
    expect(betting).toContain('La banque tire à 16, reste à 17')
    const { html } = find('manche-6', 'résultats')
    // Black Jack de Maxime (mise 2 → distribue 3), égalité de Camille, gain de Sofiane (6).
    expect(html).toContain('BJ +3')
    expect(html).toMatch(/>=</)
    expect(html).toContain('+6')
  })

  it('montre le bilan en fin de partie', () => {
    const { html } = find('fin-6', 'fin')
    expect(html).toContain('Partie terminée')
    expect(html).toMatch(/mains? gagnées? sur/)
  })
})
