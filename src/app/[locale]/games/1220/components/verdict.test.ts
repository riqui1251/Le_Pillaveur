import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { RollHistory } from './verdict'

/**
 * L'historique des lancers est plafonné : passé le plafond, sa longueur ne
 * dit plus le numéro des lancers. Le numéro vient du compteur de lancers.
 */

const messages = JSON.parse(
  readFileSync(new URL('../../../../../../messages/fr.json', import.meta.url), 'utf8')
) as AbstractIntlMessages

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const render = (props: ComponentProps<typeof RollHistory>) =>
  renderToStaticMarkup(
    createElement(IntlProvider, { locale: 'fr', messages, timeZone: 'Europe/Paris' }, createElement(RollHistory, props))
  )

/** Les numéros affichés devant chaque lancer, du haut vers le bas. */
const numbers = (html: string) => [...html.matchAll(/<span class="w-6[^"]*">(\d+)\.<\/span>/g)].map((m) => Number(m[1]))

const rolls = (count: number) => Array.from({ length: count }, (_, i) => ({ d12: (i % 12) + 1, d20: (i % 20) + 1 }))

describe('RollHistory', () => {
  it('historique plafonné : le 19e lancer s’affiche « 19. », pas « 14. »', () => {
    // 20 lancers joués, 15 gardés : le dernier est sur les dés, les 14 autres dans la liste.
    const shown = numbers(render({ rolls: rolls(14), newestNumber: 19 }))
    expect(shown).toEqual(Array.from({ length: 14 }, (_, i) => 19 - i))
  })

  it('sans compteur, une liste complète se numérote par sa longueur', () => {
    expect(numbers(render({ rolls: rolls(3) }))).toEqual([3, 2, 1])
  })

  it('rien à afficher : aucun rendu', () => {
    expect(render({ rolls: [], newestNumber: 4 })).toBe('')
  })
})

describe('12-20 local : la liste est numérotée par le compteur de lancers', () => {
  it('le jeu local passe le compteur à l’historique', () => {
    const source = readFileSync(new URL('./game.tsx', import.meta.url), 'utf8')
    // history[0] est le lancer n° rollCount, affiché par les dés ; la liste commence au suivant.
    expect(source).toMatch(/<RollHistory rolls=\{history\.slice\(1\)\}[^>]*newestNumber=\{rollCount - 1\}/)
  })
})
