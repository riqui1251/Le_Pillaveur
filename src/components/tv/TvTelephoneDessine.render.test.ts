import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { TelephoneClientView } from '@/lib/telephone-dessine/engine'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/telephone-dessine'
import { TvTelephoneDessine } from './TvTelephoneDessine'

;(globalThis as { React?: typeof React }).React = React

const messages = fr as unknown as AbstractIntlMessages

/** Des phrases des fixtures : secrètes tant que la révélation n'a pas commencé. */
const SECRET_TEXTS = ['Un chat qui fait du ski', 'Mon oncle au mariage', 'Pirate en croisière', 'Un hibou fâché', 'Bateau']

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function render(step: (typeof steps)[number]): { html: string; view: TelephoneClientView; raw: string } {
  const room = step.room!
  const raw = room.gameStateJson!
  const view = JSON.parse(raw) as TelephoneClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvTelephoneDessine, { room, state: view })
    )
  )
  return { html, view, raw }
}

describe('TvTelephoneDessine — écran TV du Téléphone dessiné', () => {
  it('couvre chaque phase rendue, au plafond de 8 joueurs comme à 3', () => {
    const rendered = steps.map(render)
    expect([...new Set(rendered.map((r) => r.view.phase))].sort()).toEqual(['contributing', 'countdown', 'finished', 'reveal'])
    expect(rendered.some((r) => r.view.players.length === 8)).toBe(true)
    expect(rendered.some((r) => r.view.players.length === 3)).toBe(true)
  })

  it('ne reçoit ni ne montre aucun maillon avant la révélation', () => {
    for (const step of steps) {
      const { html, view, raw } = render(step)
      expect(view.received).toBeNull()
      expect(raw).not.toContain('pendingSubmissions')
      expect(raw).not.toContain('"chains"')
      if (view.phase === 'reveal' || view.phase === 'finished') continue
      expect(view.revealChain).toBeNull()
      for (const text of SECRET_TEXTS) {
        expect(raw, `${step.fixture} / ${step.label}`).not.toContain(text)
        expect(html, `${step.fixture} / ${step.label}`).not.toContain(text)
      }
    }
  })

  it('montre la manche, la consigne commune, le décompte et chaque joueur pendant les manches', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'contributing') continue
      expect(html).toContain(`Manche ${view.round + 1}/${view.totalRounds}`)
      expect(html).toContain(`${view.submittedCount}/${view.totalToSubmit} ont soumis`)
      for (const p of view.players) expect(html).toContain(p.name)
    }
  })

  it('révèle la chaîne entière, maillon par maillon, comme les téléphones', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'reveal' || !view.revealChain) continue
      expect(html).toContain(`La chaîne de ${view.revealChain.ownerName}`)
      view.revealChain.links.forEach((link, i) => {
        expect(html).toContain(`Maillon ${i + 1}`)
        if (link.type === 'text' && link.text.trim()) {
          expect(html).toContain(link.text.replace(/'/g, '&#x27;'))
        }
      })
    }
  })

  it('signale le joueur parti, comme le bandeau des téléphones', () => {
    const left = steps.map(render).find((r) => r.view.phase === 'contributing' && r.view.players.some((p) => p.leftAt))!
    const name = left.view.players.find((p) => p.leftAt)!.name
    expect(left.html).toContain(`En attente du retour de ${name}`)
  })

  it("n'emploie aucune taille illisible ni opacité inexistante en Tailwind 3.3", () => {
    for (const step of steps) {
      const { html } = render(step)
      expect(html).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]|\/(15|35|45|55|65|85)\b|\d+px/)
    }
  })
})
