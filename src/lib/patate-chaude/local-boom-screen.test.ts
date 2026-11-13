import React, { createElement, createRef, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import fr from '../../../messages/fr.json'
import type { Player } from '@/lib/players'
import { PcBoomScreen } from '@/app/[locale]/games/patate-chaude/components/boom-screen'
import type { PcBoom } from './engine'

/**
 * Écran BOUM du jeu local : la fiche veut un écran rouge carreau, comme le BOUM du Chiffre Piégé —
 * un calque plein écran, pas une carte posée sur le feutre. Il dit qui tenait la bombe, ce qu'il
 * prend, la mèche et les passes, et porte seul les gestes de fin de manche.
 */

;(globalThis as { React?: typeof React }).React = React

// Le dessin du souffle n'a rien à vérifier ici.
vi.mock('@/app/[locale]/games/patate-chaude/components/bomb', () => ({
  BombArt: () => null,
  BoomBurst: () => null,
}))

const BOOM: PcBoom = { playerId: 'alice', round: 3, fuseMs: 23_400, passes: 9 }
const ALICE = { id: 'alice', name: 'Alice' } as unknown as Player

type Props = ComponentProps<typeof PcBoomScreen>

function render(overrides: Partial<Props> = {}): string {
  const props: Props = {
    boom: BOOM,
    loser: ALICE,
    verdict: 'Alice boit 3 gorgées',
    roundLabel: 'Manche 4/5',
    lastRound: false,
    locked: false,
    onNext: () => undefined,
    actionsRef: createRef<HTMLDivElement>(),
    ...overrides,
  }
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      {
        locale: 'fr',
        messages: fr as unknown as AbstractIntlMessages,
        timeZone: 'Europe/Paris',
        onError: () => undefined,
      } as unknown as ComponentProps<typeof NextIntlClientProvider>,
      createElement(PcBoomScreen, props)
    )
  )
}

const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? []

describe('Patate Chaude locale — écran BOUM', () => {
  it('est un plein écran rouge carreau, au-dessus de la Navbar', () => {
    const html = render()
    expect(html).toMatch(/^<section[^>]*class="fixed inset-0 z-\[45\] !mt-0 [^"]*bg-suit-red/)
    expect(html).toContain('BOUM')
    expect(html).toContain('Alice tenait la bombe')
    expect(html).toContain('Alice boit 3 gorgées')
    expect(html).toContain('23 s')
    expect(html).toContain('Manche 4/5')
  })

  it('« Manche suivante », puis « Voir le classement » à la dernière manche', () => {
    expect(render()).toContain('Manche suivante')
    const last = render({ lastRound: true })
    expect(last).toContain('Voir le classement')
    expect(last).not.toContain('Manche suivante')
  })

  it('« Terminer » seulement en partie illimitée ; tout est grisé le temps du BOUM', () => {
    expect(buttons(render())).toHaveLength(1)
    const unlimited = render({ onFinish: () => undefined })
    expect(unlimited).toContain('Terminer la partie')
    expect(buttons(unlimited)).toHaveLength(2)
    const locked = buttons(render({ onFinish: () => undefined, locked: true }))
    expect(locked).toHaveLength(2)
    for (const button of locked) expect(button).toContain('disabled')
  })
})
