import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { TvRoomDto } from '@/lib/online-room'
import type { PetitBuveurCastState } from '@/lib/cast-types'
import type { EngineState } from '@/lib/petit-buveur/engine'
import { TvPetitBuveur } from './TvPetitBuveur'
import { TvVictory } from './TvVictory'

// La config Vitest (env node, sans plugin React) compile le JSX en React.createElement
// sans l'importer : le composant le cherche donc en global.
;(globalThis as { React?: typeof React }).React = React

const room = {
  code: 'ABCDEF',
  status: 'cast',
  gameId: null,
  hostUserId: 'h',
  members: [],
  settings: {},
  stateVersion: 1,
  currentTurnUserId: null,
  gameStateJson: null,
} as unknown as TvRoomDto

function render(state: PetitBuveurCastState): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvPetitBuveur, { room, state })
    )
  )
}

const base: PetitBuveurCastState = {
  castKind: 'petit-buveur',
  players: [
    { id: 'a', name: 'Alice', position: 2, drinks: 3 },
    { id: 'b', name: 'Bob', position: 0, drinks: 0 },
  ],
  currentPlayer: 0,
  phase: 'playing',
  winner: null,
}

describe('TvPetitBuveur — ambiance diffusée', () => {
  it("en Soft, aucune bière ni gorgée sur l'écran TV", () => {
    const html = render({ ...base, ambiance: 'soft' })
    expect(html).not.toContain('🍺')
    expect(html).not.toContain('lucide-beer')
    expect(html).not.toMatch(/gorgée/i)
    expect(html).toContain('3 gage(s)')
  })

  it('en ambiance alcool, le compteur reste en gorgées', () => {
    const html = render({ ...base, ambiance: 'alcool' })
    expect(html).toContain('lucide-beer')
    expect(html).toContain('3 gorgée(s)')
  })
})

describe('TvVictory — écran de fin du Petit Buveur', () => {
  const finished = { ...base, phase: 'finished', winner: 'a' } as unknown as EngineState

  function renderVictory(state: EngineState & { ambiance?: 'alcool' | 'soft' }): string {
    return renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
        createElement(TvVictory, { room, gameId: 'petit-buveur', state })
      )
    )
  }

  it('en Soft, le classement final compte des gages, sans bière', () => {
    const html = renderVictory({ ...finished, ambiance: 'soft' })
    expect(html).not.toContain('🍺')
    expect(html).not.toContain('lucide-beer')
    expect(html).toContain('3 gage(s)')
  })

  it('en ambiance alcool, le classement final compte des gorgées', () => {
    const html = renderVictory({ ...finished, ambiance: 'alcool' })
    expect(html).toContain('lucide-beer')
    expect(html).toContain('3 gorgée(s)')
  })
})
