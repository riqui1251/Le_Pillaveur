import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { DilClientView } from '@/lib/dilemmes/engine'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/dilemmes'
import { TvDilemmes } from './TvDilemmes'

;(globalThis as { React?: typeof React }).React = React

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function render(step: (typeof steps)[number]): { html: string; view: DilClientView } {
  const room = step.room!
  const view = JSON.parse(room.gameStateJson!) as DilClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvDilemmes, { room, state: view })
    )
  )
  return { html, view }
}

const find = (fixture: string, label: string) => render(steps.find((s) => s.fixture === fixture && s.label === label)!)

describe('TvDilemmes — écran TV', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['countdown', 'finished', 'reveal', 'vote'])
  })

  it('aucun vote individuel avant la révélation', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase === 'reveal') continue
      expect(view.myVote).toBeNull()
      // En fin de partie, lastReveal garde la dernière manche, déjà révélée à tous.
      if (view.phase !== 'finished') expect(view.lastReveal).toBeNull()
      expect(JSON.parse(step.room!.gameStateJson!)).not.toHaveProperty('votes')
      expect(html).not.toContain(' %')
    }
  })

  it('montre qui a déjà voté, comme la rangée du téléphone', () => {
    const { html, view } = find('prefere-16', 'vote, 9/16 ont voté')
    expect(view.players.filter((p) => p.hasVoted)).toHaveLength(9)
    expect((html.match(/bg-emerald-500\/20/g) ?? []).length).toBe(9)
    for (const p of view.players) expect(html).toContain(p.name)
  })

  it('révélation : pourcentages, pseudos des camps et consigne à boire', () => {
    const { html, view } = find('prefere-16', 'révélation, camps partagés')
    const a = view.lastReveal!.filter((r) => r.choice === 'A').length
    expect(html).toContain(`${Math.round((a / view.lastReveal!.length) * 100)} %`)
    expect(html).toContain('La minorité boit')
    expect(find('qui-16', 'révélation').html).toContain('Le plus désigné boit')
  })

  it('les paroles des bots sous la carte, effacées tant qu’aucune bulle n’est dite', () => {
    for (const label of ['vote, Gépéto taquine', 'révélation, réaction d’un bot']) {
      const { html } = find('paroles', label)
      expect(html).toContain('max-h-[7rem]')
      expect(html).toMatch(/Gépéto<\/span> /)
    }
    // À la révélation, une réaction s'ajoute à la taquinerie.
    expect((find('paroles', 'révélation, réaction d’un bot').html.match(/rounded-tl-sm/g) ?? []).length).toBe(2)
    const silent = find('prefere-16', 'vote, 9/16 ont voté').html
    expect(silent).not.toContain('max-h-[7rem]')
    expect(silent).toContain('aria-live="polite"')
  })

  it('départ et fin de partie', () => {
    expect(find('depart', 'vote, attente du retour').html).toContain('En attente du retour de')
    expect(find('fin', 'fin, revanche 3/16').html).toContain('Revanche 3/16')
    const few = find('fin-3', 'fin, revanche 1/2 (bot hors quorum)')
    expect(few.view.players).toHaveLength(3)
    expect(few.html).toContain('Revanche 1/2')
  })

  it('noms longs : pseudos des camps en flex-wrap, pastilles hors flux dans « Qui de la table »', () => {
    const { html } = find('prefere-unanime-16', 'révélation unanime')
    expect(html).not.toContain('grid-cols-3')
    expect(html).toContain('Maxime-Alexandre')
    const who = find('qui-16', 'vote, 11/16').html
    expect((who.match(/absolute -right-2 -top-3/g) ?? []).length).toBe(11)
  })

  it('aucune taille de texte illisible à 3 m', () => {
    for (const step of steps) {
      const { html } = render(step)
      expect(html, `${step.fixture} / ${step.label}`).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]|\/(15|35|45|55|65|85)\b/)
      expect(html, `${step.fixture} / ${step.label}`).not.toMatch(/style="[^"]*\d+px/)
    }
  })
})
