import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/toucher-coule'
import type { TCClientView } from '@/lib/toucher-coule/engine'
import { TvToucherCoule } from './TvToucherCoule'

;(globalThis as { React?: typeof React }).React = React

const fixtures = build()

function render(fixtureId: string, stepIndex: number): { html: string; view: TCClientView } {
  const fixture = fixtures.find((f) => f.id === fixtureId)!
  const room = fixture.steps[stepIndex].room!
  const view = JSON.parse(room.gameStateJson!) as TCClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvToucherCoule, { room, state: view })
    )
  )
  return { html, view }
}

describe('TvToucherCoule — vue spectateur', () => {
  it("aucune case d'un navire intact n'arrive à la TV", () => {
    for (const fixture of fixtures) {
      for (const s of fixture.steps) {
        const view = JSON.parse(s.room!.gameStateJson!) as TCClientView
        for (const ship of view.ships) {
          if (!ship.sunk) expect([...ship.cells].sort()).toEqual([...ship.hits].sort())
        }
      }
    }
  })

  it('les grilles ne montrent que les tirs reçus', () => {
    const { html, view } = render('bataille-4v4', 5)
    const shots = [...Object.values(view.shotsAt.A), ...Object.values(view.shotsAt.B)]
    const marked = (html.match(/💥|💀/g) ?? []).length
    expect(marked).toBe(shots.filter((r) => r === 'hit').length)
  })

  it('dernier tir, tour et gorgées affichés comme sur le téléphone', () => {
    const { html } = render('bataille-4v4', 1)
    expect(html).toContain("À l&#x27;eau")
    expect(html).toContain('Au tour de')
    expect(html).toContain('lucide-beer')
  })

  it('en placement, chaque équipe garde toute sa flotte (pas de « 0/8 »)', () => {
    for (const [id, total] of [['placement-4v4', 8], ['placement-1v1', 3]] as const) {
      for (const stepIndex of [0, 1]) {
        const { html } = render(id, stepIndex)
        expect(html.match(new RegExp(`>${total}/${total}<`, 'g'))?.length).toBe(2)
      }
    }
  })

  it('plusieurs joueurs partis : un seul message central, un compte à rebours par joueur', () => {
    const { html } = render('bataille-4v4', 6)
    expect((html.match(/En attente du retour de/g) ?? []).length).toBe(1)
    expect(html).toContain('+2')
    expect((html.match(/lucide-hourglass/g) ?? []).length).toBe(3)
    expect(html).not.toMatch(/text-white\/60/)
  })

  it('aucune classe de texte illisible à 3 m', () => {
    for (const id of ['placement-4v4', 'placement-1v1', 'bataille-4v4', 'duel-1v1']) {
      const { html } = render(id, 1)
      expect(html).not.toMatch(/text-(xs|sm)\b|text-\[\d+px\]/)
    }
  })
})
