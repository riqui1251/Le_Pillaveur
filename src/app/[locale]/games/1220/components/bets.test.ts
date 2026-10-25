import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../../../../messages/fr.json'
import type { Choices1220 } from '@/lib/game-1220'
import { TableBets } from './bets'

;(globalThis as { React?: typeof React }).React = React

function renderTable(choices: Choices1220): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<
        typeof NextIntlClientProvider
      >,
      createElement(TableBets, {
        open: false,
        onOpenChange: () => {},
        rows: [{ key: 'evil', avatar: null, name: 'Tricheur', choices }],
      })
    )
  )
}

describe('TableBets — paris d’un autre téléphone', () => {
  it('affiche les quatre paris d’un joueur', () => {
    const html = renderTable({ parity: 'impair', band: '21-30', drinkNumber: 5, giveNumber: 16 })
    expect(html).toContain('Impair')
    expect(html).toContain('>5<')
    expect(html).toContain('>16<')
  })

  it('un pari piégé (objet, chaîne, clé inconnue) ne fait plus planter l’écran', () => {
    const trapped = {
      parity: { boom: 1 },
      band: 'nulle part',
      drinkNumber: { boom: 1 },
      giveNumber: '13',
      extra: 'x',
    } as unknown as Choices1220
    let html = ''
    expect(() => {
      html = renderTable(trapped)
    }).not.toThrow()
    expect(html).not.toContain('boom')
    expect(html).not.toContain('[object Object]')
    expect(html).toContain('>7<')
  })
})
