import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { BID_LADDER_PHONE, BID_LADDER_TV, BidLadder, type BidLadderProps, type LadderBid } from './BidLadder'

/**
 * L'échelle des enchères du Menteur, rendue côté serveur (react-dom/server)
 * avec le VRAI catalogue de chaque langue : une clé absente ou un argument
 * ICU mal nommé ferait échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))

// Le fournisseur exige `children` dans ses props, la règle react/no-children-prop
// les veut en 3e argument de createElement : on retire `children` du type.
const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b2', name: 'Bernadette', isBot: true },
]

/** Six enchères montantes : Riqui, Raoul, Bernadette, Riqui, Raoul, Bernadette. */
const CHAIN: LadderBid[] = [
  { qty: 1, face: 2, by: 'h' },
  { qty: 2, face: 3, by: 'b1' },
  { qty: 3, face: 3, by: 'b2' },
  { qty: 3, face: 5, by: 'h' },
  { qty: 4, face: 5, by: 'b1' },
  { qty: 5, face: 6, by: 'b2' },
]

function render(props: Partial<BidLadderProps>, locale = 'fr', errors: unknown[] = []): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      {
        locale,
        messages: catalogue(locale),
        timeZone: 'Europe/Paris',
        onError: (e) => {
          errors.push(e)
        },
      },
      createElement(BidLadder, {
        bids: CHAIN,
        players: PLAYERS,
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        variant: 'phone',
        ...props,
      })
    )
  )
}

const chips = (html: string) => html.match(/<li class=/g)?.length ?? 0

describe('BidLadder', () => {
  it('téléphone : les 4 dernières enchères, la plus récente surlignée, une phrase par puce pour les lecteurs d’écran', () => {
    const html = render({ limit: BID_LADDER_PHONE })
    expect(chips(html)).toBe(BID_LADDER_PHONE)
    // Les deux premières sont sorties de la fenêtre, signalées par « … ».
    expect(html).toContain('…')
    expect(html).not.toContain('Riqui a annoncé 1 dé de 2')
    expect(html).toContain('Bernadette a annoncé 3 dés de 3')
    expect(html).toContain('Bernadette a annoncé 5 dés de 6')
    expect(html.match(/border-gold\/60/g)).toHaveLength(1)
    expect(html).not.toContain('orange')
    expect(html).toContain('aria-label="Enchères de la manche, de la première à la dernière"')
    // Aucun titre visible pendant les enchères, aucune marque de bluff.
    expect(html).not.toContain('>Enchères de la manche<')
    expect(html).not.toContain('sans un seul')
    // Le petit dé des puces, pas celui des sélecteurs.
    expect(html).toContain('h-5 w-5')
  })

  it('TV : les 6 dernières, en grand', () => {
    const many = [...CHAIN, { qty: 6, face: 6, by: 'h' }, { qty: 7, face: 6, by: 'b1' }]
    const html = render({ bids: many, variant: 'tv', limit: BID_LADDER_TV })
    expect(chips(html)).toBe(BID_LADDER_TV)
    expect(html).toContain('text-2xl')
    // La TV garde l'orange de son plateau pour la dernière enchère.
    expect(html.match(/border-orange-400\/60/g)).toHaveLength(1)
    expect(html).toContain('Raoul a annoncé 7 dés de 6')
    expect(html).toContain('…')
  })

  it('révélation : toute la chaîne, titrée, et la marque « sans un seul » sur les seuls bluffs', () => {
    const duelBids = CHAIN.map((b, i) => ({ ...b, bluff: i === 1 || i === 5 }))
    for (const variant of ['phone', 'tv'] as const) {
      const html = render({ bids: duelBids, variant, titled: true })
      expect(chips(html)).toBe(CHAIN.length)
      expect(html).not.toContain('…')
      expect(html).toContain('>Enchères de la manche<')
      expect(html.match(/>sans un seul</g)).toHaveLength(2)
      expect(html).toContain('Raoul n’en avait aucun')
      expect(html).toContain('Bernadette n’en avait aucun')
      expect(html).not.toContain('Riqui n’en avait aucun')
    }
  })

  it('chaîne vide : rien n’est rendu', () => {
    expect(render({ bids: [] })).toBe('')
  })

  it.each(LOCALES)('%s : toutes les clés existent et se formatent, sans clé brute', (locale) => {
    const errors: unknown[] = []
    const html = render({ bids: CHAIN.map((b, i) => ({ ...b, bluff: i === 0 })), titled: true }, locale, errors)
    expect(errors).toEqual([])
    expect(html).not.toContain('games.menteur')
    expect(html).toContain('Riqui')
  })
})
