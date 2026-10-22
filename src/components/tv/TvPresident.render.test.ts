import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import es from '../../../messages/es.json'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/president'
import type { PreClientView } from '@/lib/president/engine'
import { TvRoomScreen } from './TvRoomScreen'

;(globalThis as { React?: typeof React }).React = React

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, ...rest }: { href: string }) => createElement('a', { href, ...rest }),
}))

describe('TvPresident — joker posé', () => {
  it('le joker est nommé dans la langue de l’écran, comme sur les téléphones', () => {
    const step = build().find((f) => f.id === 'pli-libre-8')!.steps[0]
    const room = step.room!
    const view = JSON.parse(room.gameStateJson!) as PreClientView
    const withJoker: PreClientView = { ...view, lastPlay: { playerId: view.players[0].id, cards: [52] } }
    const html = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'es', messages: es as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<
          typeof NextIntlClientProvider
        >,
        createElement(TvRoomScreen, {
          code: room.code,
          room: { ...room, gameStateJson: JSON.stringify(withJoker) },
          notFound: false,
          frame: null,
        })
      )
    )
    expect(html).toContain('🃏')
    expect(html).toContain('aria-label="Comodín"')
    expect(html).not.toContain('aria-label="Joker"')
  })
})
