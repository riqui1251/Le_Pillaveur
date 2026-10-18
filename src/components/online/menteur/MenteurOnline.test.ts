import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import {
  reduceMenteur,
  toMenteurClientView,
  type MenteurPlayer,
  type MenteurState,
} from '@/lib/menteur/engine'
import { MenteurOnline } from '../MenteurOnline'

/**
 * L'écran téléphone du Menteur rendu côté serveur, hooks de salle simulés :
 * à la révélation, la réaction du bot se lit dans le panneau, et le fil sous
 * l'enchère reste monté (masqué à l'œil) pour que sa région aria-live, née
 * avant la révélation, annonce le « Menteur ! » et la réaction.
 */

const room = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'h', ambianceMode: 'normal' } }),
}))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({ room: room.current, voteRematch: () => {}, leaveRoom: () => {} }),
}))
vi.mock('@/hooks/useGameAction', () => ({
  useGameAction: () => ({ busy: false, actionError: null, sendAction: async () => {} }),
}))
vi.mock('@/hooks/useBotReferee', () => ({ useBotReferee: () => {}, useAfkTick: () => 0 }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/', useRouter: () => ({ push: () => {} }) }))
vi.mock('@/components/online/GameTutorialModal', () => ({
  useGameTutorial: () => ({ open: false }),
  GameTutorialModal: () => null,
  TutorialReopenButton: () => null,
}))
vi.mock('@/components/online/GameOnlineLobby', () => ({ GameOnlineLobby: () => null }))
vi.mock('@/components/online/OnlineEndScreen', () => ({ OnlineEndScreen: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))

const messages = JSON.parse(
  readFileSync(new URL('../../../../messages/fr.json', import.meta.url), 'utf8')
) as AbstractIntlMessages
const game = (messages as { games: { menteur: { game: { reveal: { continue: string } } } } }).games.menteur.game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const seat = (id: string, name: string, isBot: boolean): MenteurPlayer => ({
  id,
  name,
  isBot,
  leftAt: null,
  dice: [2, 3, 4, 5, 6],
  lostCount: 0,
})

/** Gépéto (bavardage 3) annonce « 4 × 4 » sur trois 4, avec un « sûr » ; Riqui est au tour. */
const bidding = (): MenteurState => {
  const bid = { qty: 4, face: 4, by: 'g' }
  return {
    version: 1,
    phase: 'bidding',
    players: [seat('h', 'Riqui', false), seat('g', 'Gépéto', true), seat('s', 'Suzette', true)],
    turnIdx: 0,
    currentBid: bid,
    lastReveal: null,
    round: 1,
    winnerId: null,
    rematchVotes: [],
    rngState: 1,
    rulePalifico: false,
    ruleCalza: false,
    revealAt: null,
    palifico: false,
    bids: [bid],
    duels: [],
    speech: [{ playerId: 'g', kind: 'sure', targetId: 'h', round: 1 }],
  }
}

function render(state: MenteurState): string {
  room.current = {
    id: 'r',
    gameId: 'menteur',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: state.phase === 'bidding' ? state.players[state.turnIdx].id : 'h',
    members: [],
    gameStateJson: JSON.stringify(toMenteurClientView(state, 'h')),
  }
  return renderToStaticMarkup(
    createElement(IntlProvider, { locale: 'fr', messages, timeZone: 'Europe/Paris' }, createElement(MenteurOnline))
  )
}

/** Les bulles de la liste qui commence à `from`. */
const bubblesAt = (html: string, from: number) => {
  const list = html.slice(from, html.indexOf('</ul>', from))
  return [...list.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
}

const LIVE = '<ul aria-live="polite"'

describe('MenteurOnline : le fil des paroles', () => {
  it('pendant les enchères, un seul fil, visible, sous l’enchère', () => {
    const html = render(bidding())
    expect(html.split(LIVE)).toHaveLength(2)
    expect(html).toContain(`<div>${LIVE}`)
    expect(bubblesAt(html, html.indexOf(LIVE))).toHaveLength(1)
  })

  it('à la révélation : la réaction dans le panneau, après le résultat ; le fil vivant reste monté, masqué à l’œil', () => {
    const html = render(reduceMenteur(bidding(), { type: 'DUDO', playerId: 'h', now: 1_000_000 }))
    const live = html.indexOf(`<div class="sr-only">${LIVE}`)
    const copy = html.indexOf(`<div aria-hidden="true">${LIVE}`)
    expect(live).toBeGreaterThan(-1)
    expect(copy).toBeGreaterThan(-1)
    // Une seule région annoncée : la copie du panneau est muette.
    expect(html.split(LIVE)).toHaveLength(3)
    // Le panneau : résultat, puis la copie du fil, puis « Manche suivante ».
    const loser = html.indexOf('Gépéto perd un dé')
    expect(loser).toBeGreaterThan(-1)
    expect(copy).toBeGreaterThan(loser)
    expect(html.indexOf(game.reveal.continue, copy)).toBeGreaterThan(copy)
    // Les mêmes bulles des deux côtés : le « sûr » de l'enchère, puis la réaction de Gépéto à Riqui.
    const shown = bubblesAt(html, copy)
    expect(shown).toHaveLength(2)
    expect(shown[1]).toMatch(/^Gépéto .*Riqui/u)
    expect(bubblesAt(html, live)).toEqual(shown)
  })
})
