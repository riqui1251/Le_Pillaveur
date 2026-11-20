import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { createSFState, reduceSF, toSFClientView, SF_COUNTDOWN_MS, type SFState } from '@/lib/sans-filtre/engine'
import { SansFiltreOnline } from './SansFiltreOnline'

/**
 * L'écran téléphone de Sans Filtre rendu côté serveur, hooks de salle simulés,
 * avec le VRAI catalogue des 4 langues. Ce qu'on vérifie : un juge désigné en
 * cours de manche voit sa propre réponse parmi les autres, désactivée, avec la
 * raison — et les autres joueurs ne voient rien qui la distingue.
 */

const room = vi.hoisted(() => ({ current: null as unknown, viewerId: 'p1' }))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: room.viewerId, ambianceMode: 'normal' } }),
}))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({ room: room.current, voteRematch: () => {}, leaveRoom: () => {} }),
}))
vi.mock('@/hooks/useGameAction', () => ({
  useGameAction: () => ({ busy: false, actionError: null, sendAction: async () => null }),
}))
vi.mock('@/hooks/useBotReferee', () => ({ useBotReferee: () => {}, useAdvanceTick: () => {} }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/', useRouter: () => ({ push: () => {} }) }))
vi.mock('@/components/online/GameTutorialModal', () => ({
  useGameTutorial: () => ({ open: false, reopen: () => {}, close: () => {} }),
  GameTutorialModal: () => null,
  TutorialReopenButton: () => null,
}))
vi.mock('@/components/online/GameOnlineLobby', () => ({ GameOnlineLobby: () => null }))
vi.mock('@/components/online/OnlineEndScreen', () => ({ OnlineEndScreen: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const ownCardNotice = (locale: string): string =>
  (catalogue(locale) as { games: Record<string, { game: { judgeOwnCard: string } }> }).games['sans-filtre'].game
    .judgeOwnCard

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const NOW = Date.now()
const BLACKS = ['Trou n°1 : ___.', 'Trou n°2 : ___.', 'Trou n°3 : ___.']
// Textes sans caractère que le rendu échapperait, pour les retrouver tels quels.
const WHITES = Array.from({ length: 48 }, (_, i) => `REPONSE-${i}-FIN`)

/** p0 juge, p1 à p3 abattent une carte : jugement ouvert. */
function judging(): SFState {
  const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}` }))
  const raw = createSFState(players, BLACKS, WHITES, 'seed-render', NOW - SF_COUNTDOWN_MS, 3)
  let s = reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: NOW })
  for (const id of ['p1', 'p2', 'p3']) {
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: id, card: s.players.find((p) => p.id === id)!.hand[0], now: NOW + 1_000 })
  }
  expect(s.phase).toBe('judging')
  expect(s.judgeId).toBe('p0')
  return s
}

/** Le juge p0 quitte : p1, qui avait déjà joué, juge à sa place. */
function handedOver(): SFState {
  const s = reduceSF(judging(), { type: 'LEAVE', playerId: 'p0', at: NOW + 5_000 })
  expect(s.judgeId).toBe('p1')
  return s
}

function render(state: SFState, viewerId: string, locale: string = 'fr', errors: unknown[] = []): string {
  room.viewerId = viewerId
  room.current = {
    id: 'r',
    gameId: 'sans-filtre',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: state.judgeId,
    gameStateJson: JSON.stringify(toSFClientView(state, viewerId)),
    members: [],
  }
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      {
        locale,
        messages: catalogue(locale),
        timeZone: 'Europe/Paris',
        onError: (error: unknown) => {
          errors.push(error)
        },
      },
      createElement(SansFiltreOnline)
    )
  )
}

const textOf = (state: SFState, playerId: string) =>
  WHITES[state.submissions.find((s) => s.playerId === playerId)!.card]
/** Le bouton de la réponse donnée, s'il existe (le juge seul a des boutons). */
const answerButton = (html: string, text: string) =>
  html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${text}`, 's'))?.[0]

describe('SansFiltreOnline : juge désigné en cours de manche', () => {
  it('voit sa réponse désactivée parmi les autres, avec la raison, dans les 4 langues', () => {
    const state = handedOver()
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(state, 'p1', locale, errors)
      expect(errors, locale).toEqual([])
      expect(html, locale).toContain(ownCardNotice(locale))
      expect(answerButton(html, textOf(state, 'p1')), locale).toMatch(/\sdisabled(=""|\s|>)/)
      for (const other of ['p2', 'p3']) {
        expect(answerButton(html, textOf(state, other)), `${locale} ${other}`).not.toMatch(/\sdisabled(=""|\s|>)/)
      }
    }
  })

  it('les autres joueurs voient les trois réponses, sans rien qui désigne celle du juge', () => {
    const state = handedOver()
    for (const viewer of ['p2', 'p3']) {
      const html = render(state, viewer)
      for (const author of ['p1', 'p2', 'p3']) expect(html, viewer).toContain(textOf(state, author))
      expect(html, viewer).not.toContain(ownCardNotice('fr'))
      expect(answerButton(html, 'REPONSE-'), viewer).toBeUndefined()
    }
  })

  it('désigné pendant la pose après avoir joué : son bandeau parle en juge, pas en joueur', () => {
    const game = (catalogue('fr') as { games: Record<string, { game: Record<string, string> }> }).games['sans-filtre']
      .game
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `Joueur ${i}` }))
    const raw = createSFState(players, BLACKS, WHITES, 'seed-render', NOW - SF_COUNTDOWN_MS, 3)
    let s = reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: NOW })
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: 'p1', card: s.players[1].hand[0], now: NOW + 1_000 })
    s = reduceSF(s, { type: 'LEAVE', playerId: 'p0', at: NOW + 2_000 })
    expect(s.phase).toBe('submit')
    expect(s.judgeId).toBe('p1')

    const html = render(s, 'p1')

    // « Carte abattue ! » le laissait croire qu'il jouait encore la manche.
    const start = (key: string) => game[key].split('{')[0].trim()
    expect(html).toContain(start('judgeWaits'))
    expect(html).not.toContain(start('played'))
  })

  it('un juge ordinaire n’a ni carte désactivée ni avis', () => {
    const state = judging()

    const html = render(state, 'p0')

    expect(html).not.toContain(ownCardNotice('fr'))
    for (const author of ['p1', 'p2', 'p3']) {
      expect(answerButton(html, textOf(state, author)), author).not.toMatch(/\sdisabled(=""|\s|>)/)
    }
  })
})
