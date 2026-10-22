import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/mots-codes'
import type { MCClientView } from '@/lib/mots-codes/engine'
import { TvMotsCodes } from './TvMotsCodes'

;(globalThis as { React?: typeof React }).React = React

const fixtures = build()

const messages = fr as unknown as AbstractIntlMessages

function render(fixtureId: string, stepIndex: number): { html: string; view: MCClientView } {
  const fixture = fixtures.find((f) => f.id === fixtureId)!
  const room = fixture.steps[stepIndex].room!
  const view = JSON.parse(room.gameStateJson!) as MCClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages, timeZone: 'Europe/Paris', onError: () => {} } as unknown as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvMotsCodes, { room, state: view })
    )
  )
  return { html, view }
}

describe('TvMotsCodes — vue spectateur', () => {
  it("la carte clé n'arrive jamais à la TV avant la fin", () => {
    for (const fixture of fixtures) {
      for (const s of fixture.steps) {
        const view = JSON.parse(s.room!.gameStateJson!) as MCClientView
        expect(view.iSeeSolution).toBe(view.phase === 'finished')
        if (view.phase === 'finished') continue
        for (const tile of view.tiles) {
          if (!tile.revealed) expect(tile.kind).toBeNull()
        }
      }
    }
  })

  it('une tuile non révélée reste crème à la TV', () => {
    const { html, view } = render('table-16', 3)
    const cream = (html.match(/bg-cream text-\[#24201A\]/g) ?? []).length
    expect(cream).toBe(view.tiles.filter((t) => !t.revealed).length)
  })

  it("indice, essais restants et Maître-mot affichés comme sur le téléphone", () => {
    const guess = render('table-16', 2)
    expect(guess.html).toContain(guess.view.clue!.word)
    expect(guess.html).toContain('essai(s) restant(s)')
    const clue = render('table-16', 1)
    expect(clue.html).toContain('prépare son indice')
    expect(clue.html).toContain('lucide-key-round')
    expect(render('table-16', 6).html).toContain('En attente du retour de')
    const tight = render('table-16', 7)
    expect(tight.view.phase).toBe('clue')
    expect(tight.html).toMatch(/Marie-Charlotte(<!-- -->)? \((<!-- -->)?Rouge(<!-- -->)?\) prépare son indice/)
    expect(tight.html).toContain('En attente du retour de')
  })

  it("fin sur l'assassin : vainqueur et raison", () => {
    const { html } = render('table-4-assassin', 3)
    expect(html).toContain('gagne')
    expect(html).toContain('L’assassin a été touché')
  })

  it("le décompte ne montre pas les mots restants (9 contre 8 trahirait l'équipe qui commence)", () => {
    const { html, view } = render('table-16', 0)
    expect(view.phase).toBe('countdown')
    expect(html).not.toMatch(/font-display[^"]*tabular-nums[^"]*">\d+</)
    expect(render('table-16', 1).html).toMatch(/font-display[^"]*tabular-nums[^"]*">\d+</)
  })

  it('revanche : votes affichés en fin de partie', () => {
    const { html, view } = render('table-16', 9)
    expect(view.phase).toBe('finished')
    expect(html).toMatch(/2\/16/)
  })

  it('revanche : même quorum que les téléphones, un votant parti de la table ne compte plus', () => {
    const room = fixtures.find((f) => f.id === 'table-16')!.steps[9].room!
    const view = JSON.parse(room.gameStateJson!) as MCClientView
    const gone = view.rematchVotes[0]
    const members = room.members.filter((m) => m.userId !== gone)
    const html = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'fr', messages, timeZone: 'Europe/Paris', onError: () => {} } as unknown as ComponentProps<typeof NextIntlClientProvider>,
        createElement(TvMotsCodes, { room: { ...room, members }, state: view })
      )
    )
    expect(html).toMatch(new RegExp(`>${view.rematchVotes.length - 1}(<!-- -->)?/(<!-- -->)?${members.length}<`))
  })

  it('14 joueurs dans une équipe : noms toujours en text-xl, en-tête resserré', () => {
    const { html } = render('equipes-14-2', 1)
    expect(html).not.toContain('text-lg font-bold')
    expect(html).toContain('py-2')
    expect(render('equipes-14-2', 1).view.players.length).toBe(16)
  })

  it('les réactions des bots sous la grille, jusqu’à l’assassin ; absentes sans parole', () => {
    const chatter = fixtures.find((f) => f.id === 'paroles-bots')!
    chatter.steps.forEach((_, i) => {
      const { html, view } = render('paroles-bots', i)
      const said = (view.speech ?? []).filter((sp) => sp.round === view.turn)
      expect(said.length, `étape ${i}`).toBeGreaterThan(0)
      expect(html).toContain('aria-label="Fil de la table"')
      expect(html.indexOf('Fil de la table')).toBeGreaterThan(html.lastIndexOf('rounded-xl border-2'))
      for (const sp of said) expect(html).toContain(view.players.find((p) => p.id === sp.playerId)!.name)
    })
    expect(render('paroles-bots', 2).view.phase).toBe('finished')
    for (const fixture of fixtures.filter((f) => f.id !== 'paroles-bots')) {
      fixture.steps.forEach((_, i) => expect(render(fixture.id, i).html).not.toContain('Fil de la table'))
    }
  })

  it('aucune classe de texte illisible à 3 m', () => {
    for (const fixture of fixtures) {
      fixture.steps.forEach((_, i) => {
        const { html } = render(fixture.id, i)
        expect(html).not.toMatch(/text-(xs|sm)\b|text-\[\d+px\]|\/(15|35|45|55|65|85)\b/)
      })
    }
  })
})
