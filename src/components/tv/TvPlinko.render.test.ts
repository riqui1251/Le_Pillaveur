import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import fr from '../../../messages/fr.json'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/plinko'
import { TvRoomScreen } from './TvRoomScreen'

;(globalThis as { React?: typeof React }).React = React

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, ...rest }: { href: string }) => createElement('a', { href, ...rest }),
}))

const fixtures = build()

function render(fixtureId: string, stepIndex = 0): string {
  const step = fixtures.find((f) => f.id === fixtureId)!.steps[stepIndex]
  const html = renderToStaticMarkup(
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
  return html.split('<main')[1] ?? ''
}

function stepIndex(fixtureId: string, label: string): number {
  return fixtures.find((f) => f.id === fixtureId)!.steps.findIndex((s) => s.label.startsWith(label))
}

describe('TV Plinko (jeu local diffusé)', () => {
  it('aucune classe de texte illisible à 3 m, ni taille en px, ni opacité morte', () => {
    for (const fixture of fixtures) {
      fixture.steps.forEach((_, i) => {
        const html = render(fixture.id, i)
        expect(html, `${fixture.id}#${i}`).not.toMatch(/text-(xs|sm)\b|text-\[\d+px\]/)
        expect(html, `${fixture.id}#${i}`).not.toMatch(/\b[wh]-\[\d+px\]|\d+px(?! linear)/)
        expect(html, `${fixture.id}#${i}`).not.toMatch(/\/(15|35|45|55|65|85)\b/)
      })
    }
  })

  it('pendant la chute, la liste des effets touchés par chaque balle, comme sur le téléphone', () => {
    const start = render('chute-12', 1)
    expect(start).toContain('aucun effet')
    expect(start).toContain('Boit')
    expect(start).toContain('Donne')
    const mid = render('chute-12', stepIndex('chute-12', 'mystère'))
    expect(mid).toContain('🎱')
    expect(mid).toContain('×2')
    expect(mid).toContain('Couleur')
  })

  it('au repos, pas de bande d’effets ; le joueur au tour et le suivant', () => {
    const ready = render('chute-12', 0)
    expect(ready).not.toContain('aucun effet')
    expect(ready).toContain('Marie-Charlotte')
    expect(ready).toContain('Ensuite')
  })

  it('le résultat donne les gorgées du joueur qui vient de lancer', () => {
    const html = render('chute-3', stepIndex('chute-3', 'résultat'))
    expect(html).toContain('Jean-Baptiste')
    expect(html).toMatch(/>Boit<\/span><span[^>]*>\d+ 🍺/)
  })

  it('en fin de partie, la TV suit l’écran du téléphone et ne devance pas les totaux', () => {
    const tournees = render('fin-12', 0)
    expect(tournees).toContain('Tournées Générales')
    expect(tournees).not.toContain('Hugo')
    const detail = render('fin-12', stepIndex('fin-12', 'détail : 1er'))
    expect(detail).toContain('Jean-Baptiste')
    expect(detail).not.toContain('Hugo')
    expect(detail).not.toContain('Résultats Finaux')
    const totals = render('fin-12', stepIndex('fin-12', 'totaux'))
    for (const name of ['Jean-Baptiste', 'Marie-Charlotte', 'Hugo']) expect(totals).toContain(name)
  })

  it('résultat chargé à 12 joueurs : une seule ligne, tournée abrégée, noms lisibles', () => {
    const html = render('charge-12', stepIndex('charge-12', 'résultat'))
    expect(html).toContain('flex min-w-0 flex-nowrap items-center gap-3')
    expect(html).toContain('🥂 ×2')
    expect(html).not.toContain('Tournée 🥂')
    expect(html).not.toMatch(/truncate text-lg/)
  })

  it('la case dorée est celle de la dernière balle bonus ARRIVÉE, comme sur le téléphone', () => {
    const html = render('charge-12', stepIndex('charge-12', 'toutes arrivées'))
    const slots = html.match(/class="flex h-14 flex-col[^"]*"/g) ?? []
    expect(slots).toHaveLength(10)
    expect(slots.findIndex((c) => c.includes('bg-gold/40'))).toBe(1)
  })

  it('les pions touchés au-delà de la place disponible sont comptés (+n), pas rognés', () => {
    const totals = render('fin-12', stepIndex('fin-12', 'totaux'))
    expect(totals).toContain('>+4<')
  })

  it('un téléphone sans les champs récents reste affiché', () => {
    expect(render('ancien-telephone', 0)).toContain('Marie-Charlotte')
    expect(render('ancien-telephone', 1)).toContain('Résultats Finaux')
  })
})
