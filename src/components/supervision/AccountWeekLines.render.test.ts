import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import { AccountWeekLines, type AccountWeekPlay, type AccountWeekVisits } from './AccountWeekLines'

;(globalThis as { React?: typeof React }).React = React

/**
 * Lignes « 7 j » d'un compte dans la liste Comptes, telles que l'exploitant
 * les lit : la raison d'une absence de visite, et la durée de table.
 */

const messages = fr as unknown as AbstractIntlMessages
const UNITS = { s: 's', min: 'min', h: 'h', d: 'j' }

/** Texte de chaque ligne rendue, dans l'ordre. */
function lines(visits: AccountWeekVisits, play?: AccountWeekPlay): string[] {
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(AccountWeekLines, { visits, play, units: UNITS })
    )
  )
  return Array.from(html.matchAll(/<span class="min-w-0 break-words">([^<]*)<\/span>/g), (m) => m[1])
}

const untracked = (state: string): AccountWeekVisits => ({ visits: 0, activeSeconds: 0, state })
const TABLE: AccountWeekPlay = { games: 2, tableSeconds: 100 * 60, estimated: false }

describe('AccountWeekLines — liste Comptes', () => {
  it('table de deux : A suivi et B non suivi affichent la MÊME durée de table', () => {
    const a = lines({ visits: 3, activeSeconds: 70 * 60, state: 'tracked' }, TABLE)
    const b = lines(untracked('seenUntracked'), TABLE)

    expect(a).toEqual(['7 j : 3 visites · 1 h 10 min actif', '7 j : 2 parties en ligne · 1 h 40 min à table'])
    expect(b).toEqual(['7 j : vu, aucune visite suivie', '7 j : 2 parties en ligne · 1 h 40 min à table'])
  })

  it('sans visite, dit la raison — jamais « 0 visite »', () => {
    expect(lines(untracked('staff'))).toEqual(['7 j : équipe, visites non suivies'])
    expect(lines(untracked('carried'))).toEqual(['7 j : aucune nouvelle visite'])
    expect(lines(untracked('notSeen'))).toEqual(['7 j : pas vu'])
  })

  it('un compte de l’équipe qui a joué garde sa ligne de table', () => {
    expect(lines(untracked('staff'), { games: 1, tableSeconds: 20 * 60, estimated: false })).toEqual([
      '7 j : équipe, visites non suivies',
      '7 j : 1 partie en ligne · 20 min à table',
    ])
  })

  it('durée de table estimée : « ≈ » ; aucune durée additionnée : le nombre de parties seul', () => {
    expect(lines(untracked('seenUntracked'), { games: 2, tableSeconds: 45 * 60, estimated: true })[1]).toBe(
      '7 j : 2 parties en ligne · ≈ 45 min à table'
    )
    expect(lines(untracked('seenUntracked'), { games: 1, tableSeconds: 0, estimated: false })[1]).toBe(
      '7 j : 1 partie en ligne'
    )
  })

  it('aucune partie : pas de ligne de table', () => {
    expect(lines(untracked('notSeen'), { games: 0, tableSeconds: 0, estimated: false })).toEqual(['7 j : pas vu'])
  })

  it('réponse sans état (servie avant son ajout) ou état inconnu : rien plutôt qu’une clé affichée', () => {
    expect(lines({ visits: 0, activeSeconds: 0 })).toEqual([])
    expect(lines(untracked('autre'))).toEqual([])
    expect(lines({ visits: 2, activeSeconds: 600 })).toEqual(['7 j : 2 visites · 10 min actif'])
  })
})
