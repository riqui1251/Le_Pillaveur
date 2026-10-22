import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import fr from '../../../messages/fr.json'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/game-1220'
import { TvRoomScreen } from './TvRoomScreen'
import {
  TV_1220_ROLL_MS,
  game1220RollOnSig,
  game1220RollSig,
  game1220ShownRolls,
  type Game1220RollShow,
} from './TvGame1220'

;(globalThis as { React?: typeof React }).React = React

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, ...rest }: { href: string }) => createElement('a', { href, ...rest }),
}))

/**
 * Les téléphones du 1220 font rouler les dés 700 ms avant d'afficher un
 * lancer reçu (Game1220Online) : la TV ne doit pas donner le résultat avant.
 */

const roll = (d12: number, d20: number) => ({ d12, d20, results: [] })

describe('TvGame1220 — un lancer reçu roule avant d’être lu, comme sur les téléphones', () => {
  it('suspense au moins aussi long que celui des téléphones', () => {
    expect(TV_1220_ROLL_MS).toBeGreaterThanOrEqual(700)
  })

  it('signature des lancers en jeu seulement', () => {
    expect(game1220RollSig({ phase: 'setup', history: [] })).toBeNull()
    expect(game1220RollSig({ phase: 'play', history: [] })).toBe('')
    expect(game1220RollSig({ phase: 'play', history: [roll(7, 2), roll(3, 5)] })).toBe('7-2,3-5')
    expect(game1220RollSig({ phase: 'finished', history: [roll(7, 2)] })).toBeNull()
  })

  it('TV allumée en cours de jeu, ou retour en jeu : le dernier lancer tel quel', () => {
    const mounted: Game1220RollShow = { sig: '3-5', rolling: false }
    expect(game1220RollOnSig(mounted, '3-5')).toBe(mounted)
    expect(game1220RollOnSig({ sig: null, rolling: false }, '3-5')).toEqual({ sig: '3-5', rolling: false })
  })

  it('nouveau lancer : les dés roulent et la TV montre encore le précédent', () => {
    const next = game1220RollOnSig({ sig: '3-5', rolling: false }, '7-2,3-5')
    expect(next).toEqual({ sig: '7-2,3-5', rolling: true })
    const history = [roll(7, 2), roll(3, 5), roll(1, 1)]
    const during = game1220ShownRolls(history[0], history, true)
    expect(during.roll).toBe(history[1])
    expect(during.previous).toEqual([history[2]])
    expect(during.previousCount).toBe(1)
    const after = game1220ShownRolls(history[0], history, false)
    expect(after.roll).toBe(history[0])
    expect(after.previous).toEqual([history[1], history[2]])
    expect(after.previousCount).toBe(2)
  })

  it('premier lancer de la partie : rien à lire tant qu’il roule', () => {
    expect(game1220RollOnSig({ sig: '', rolling: false }, '6-6')).toEqual({ sig: '6-6', rolling: true })
    const history = [roll(6, 6)]
    expect(game1220ShownRolls(history[0], history, true)).toEqual({ roll: null, previous: [], previousCount: 0 })
  })

  it('fin de partie ou retour à la mise en place : plus rien ne roule', () => {
    expect(game1220RollOnSig({ sig: '7-2', rolling: true }, null)).toEqual({ sig: null, rolling: false })
  })
})

describe('TvGame1220 — rendu des fixtures de l’aperçu', () => {
  const fixtures = build()
  const render = (fixtureId: string, stepIndex: number) => {
    const step = fixtures.find((f) => f.id === fixtureId)!.steps[stepIndex]
    return renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<
          typeof NextIntlClientProvider
        >,
        createElement(TvRoomScreen, { code: 'APERCU', room: step.room, notFound: false, frame: null })
      )
    ).split('<main')[1] ?? ''
  }

  it('TV allumée en plein jeu : le dernier lancer est lu tout de suite, sans dés qui roulent', () => {
    const play = fixtures.find((f) => f.id === 'play-12')!
    const last = play.steps.length - 1
    const html = render('play-12', last)
    expect(html).not.toContain('Les dés roulent')
    expect(html).toContain('Lancers précédents')
  })

  it('aucune taille illisible ni en px, à chaque étape', () => {
    for (const fixture of fixtures) {
      fixture.steps.forEach((_, i) => {
        const html = render(fixture.id, i)
        expect(html, `${fixture.id}#${i}`).not.toMatch(/text-(xs|sm)\b|text-\[\d+px\]/)
      })
    }
  })
})
