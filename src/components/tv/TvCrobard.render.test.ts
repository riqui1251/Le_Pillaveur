import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { CrobardClientView } from '@/lib/crobard/engine'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/crobard'
import { TvCrobard } from './TvCrobard'

;(globalThis as { React?: typeof React }).React = React

const messages = fr as unknown as AbstractIntlMessages

/** Les mots imposés par les fixtures : secrets tant que la manche n'est pas finie. */
const WORDS = ['Maison', 'Volcan en éruption', 'Parapluie', 'Bougie', 'Horloge', 'Téléphérique', 'Étoile filante']

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function render(step: (typeof steps)[number]): { html: string; view: CrobardClientView } {
  const room = step.room!
  const view = JSON.parse(room.gameStateJson!) as CrobardClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvCrobard, { room, state: view })
    )
  )
  return { html, view }
}

describe('TvCrobard — écran TV du Crobard', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['choosing', 'countdown', 'drawing', 'finished', 'roundEnd'])
  })

  it('ne reçoit ni ne montre jamais le mot avant le bilan', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      expect(view.word).toBeNull()
      expect(view.wordChoices).toBeNull()
      expect(view.isDrawer).toBe(false)
      if (view.phase === 'roundEnd' || view.phase === 'finished') continue
      for (const word of WORDS) expect(html, `${step.fixture} / ${step.label}`).not.toContain(word)
    }
  })

  it('révèle le mot au bilan, comme les téléphones', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'roundEnd') continue
      expect(html).toContain(view.lastRoundWord!)
    }
  })

  it('montre le dessinateur, le décompte des trouvailles et tous les scores pendant le dessin', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'drawing') continue
      const drawer = view.players.find((p) => p.id === view.drawerId)!
      expect(html).toContain(`${drawer.name}</span> dessine`)
      const total = view.players.filter((p) => p.id !== view.drawerId && !p.leftAt).length
      expect(html).toContain(`${view.correctGuessers.length}/${total} ont trouvé`)
      for (const p of view.players) expect(html).toContain(p.name)
    }
  })

  it('signale le joueur parti, comme le bandeau des téléphones', () => {
    const left = steps.map(render).find((r) => r.view.players.some((p) => p.leftAt))!
    const name = left.view.players.find((p) => p.leftAt)!.name
    expect(left.html).toContain(`En attente du retour de ${name}`)
  })

  it('nomme le dessinateur pendant le choix du mot, la fin de la phrase hors troncature', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'choosing') continue
      const drawer = view.players.find((p) => p.id === view.drawerId)!
      expect(html).toContain(`${drawer.name}</span></span> choisit un mot…`)
    }
  })

  it('pose le bandeau du joueur parti au-dessus de la toile, sans la recouvrir', () => {
    const { html } = steps.map(render).find((r) => r.view.players.some((p) => p.leftAt))!
    expect(html).not.toMatch(/absolute[^"]*bottom-/)
    expect(html.indexOf('En attente du retour')).toBeLessThan(html.indexOf('<canvas'))
  })

  it('compte les votes de revanche sur les membres de la table, sans les bots', () => {
    const ends = steps.map(render).filter((r) => r.view.phase === 'finished' && (r.view.rematchVotes?.length ?? 0) > 0)
    expect(ends.length).toBeGreaterThan(0)
    for (const { html, view } of ends) {
      const humans = view.players.filter((p) => !p.isBot).length
      expect(html).toContain(`(${view.rematchVotes?.length}/${humans})`)
    }
  })

  it("rend le bilan d'une manche sans dessin", () => {
    const blank = steps.map(render).filter((r) => r.view.phase === 'roundEnd' && r.view.strokes.length === 0)
    expect(blank.length).toBeGreaterThanOrEqual(2)
    for (const { html, view } of blank) expect(html).toContain(view.lastRoundWord!)
  })

  it("n'emploie aucune taille illisible ni opacité inexistante en Tailwind 3.3", () => {
    for (const step of steps) {
      const classes = [...render(step).html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]).join(' ')
      expect(classes).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]|\/(15|35|45|55|65|85)\b/)
    }
  })
})
