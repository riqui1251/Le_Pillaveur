import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import fr from '../../../messages/fr.json'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/salle'
import { IMPOSTEUR_MAX_PLAYERS } from '@/lib/imposteur/engine'
import { PRE_MAX_PLAYERS } from '@/lib/president/engine'
import { TvRoomScreen } from './TvRoomScreen'

;(globalThis as { React?: typeof React }).React = React

// next-intl/navigation réclame le routeur de Next, absent d'un rendu statique.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, ...rest }: { href: string }) => createElement('a', { href, ...rest }),
}))

const fixtures = build()

function render(fixtureId: string, stepIndex = 0): string {
  const step = fixtures.find((f) => f.id === fixtureId)!.steps[stepIndex]
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<
        typeof NextIntlClientProvider
      >,
      createElement(TvRoomScreen, {
        code: step.room?.code ?? 'APERCU',
        room: step.room,
        notFound: Boolean(step.notFound),
        frame: step.frame ?? null,
      })
    )
  )
}

const RENDERABLE = fixtures.filter((f) => f.id !== 'introuvable')

describe('Écrans communs TV — salle, briefing, victoire', () => {
  it('aucune classe de texte illisible à 3 m ni taille en px', () => {
    for (const fixture of RENDERABLE) {
      fixture.steps.forEach((_, i) => {
        // Le contenu seul : l'en-tête appartient à TvStage.
        const html = render(fixture.id, i).split('<main')[1] ?? ''
        expect(html, fixture.id).not.toMatch(/text-(xs|sm)\b|text-\[\d+px\]/)
        expect(html, fixture.id).not.toMatch(/\b[wh]-\[\d+px\]/)
        expect(html, fixture.id).not.toMatch(/\/(15|35|45|55|65|85)\b/)
      })
    }
  })

  it('jusqu’à 16 joueurs, chaque siège est affiché ; au-delà, un « +N » final', () => {
    const sixteen = render('lobby-16')
    for (const name of ['Jean-Baptiste', 'Marie-Charlotte', 'Bastien']) expect(sixteen).toContain(name)
    expect(sixteen).not.toMatch(/>\+\d+</)
    const thirty = render('lobby-30')
    expect(thirty).toContain('>+7<')
  })

  it('le lobby dit qui est prêt et qui est l’hôte, sans texte en dur', () => {
    const html = render('lobby-10')
    expect(html).toMatch(/\d+\/10 prêts/)
    expect(html).not.toContain('HOST')
    expect(html).toContain('lucide-crown')
  })

  it('le briefing montre les règles que lisent les téléphones', () => {
    const html = render('briefing')
    expect(html).toContain('Enchérir ou douter')
    expect(html).toContain('Qui boit ?')
  })

  it('victoire du Toucher-Coulé : équipe gagnante, équipes et gorgées', () => {
    const html = render('victoire-tc-4v4')
    expect(html).toContain('Équipe gagnante')
    expect(html).toContain('Tableau final')
    expect(html).toContain('Équipe A')
    expect(html).toContain('Équipe B')
    expect(html).toContain('lucide-beer')
  })

  it('les briefings ne montrent que des tables atteignables (plafond du jeu respecté)', () => {
    const caps: Record<string, number> = { imposteur: IMPOSTEUR_MAX_PLAYERS, president: PRE_MAX_PLAYERS }
    for (const id of ['briefing-16', 'briefing-president']) {
      const room = fixtures.find((f) => f.id === id)!.steps[0].room!
      expect(room.members.length, id).toBe(caps[room.gameId ?? ''])
    }
  })
})
