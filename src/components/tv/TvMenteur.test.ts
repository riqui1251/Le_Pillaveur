import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { TvRoomDto } from '@/lib/online-room'
import {
  reduceMenteur,
  toMenteurSpectatorView,
  type MenteurPlayer,
  type MenteurState,
} from '@/lib/menteur/engine'
import { TvMenteur } from './TvMenteur'

/**
 * L'écran TV du Menteur rendu côté serveur : à la révélation, le fil des
 * paroles — et la réaction du bot qu'il porte — passe dans le panneau de
 * révélation, avec le résultat, comme sur les téléphones.
 */

const messages = JSON.parse(
  readFileSync(new URL('../../../messages/fr.json', import.meta.url), 'utf8')
) as AbstractIntlMessages

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const ROOM: TvRoomDto = {
  code: 'ABCD',
  status: 'playing',
  gameId: 'menteur',
  hostUserId: 'h',
  members: [],
  settings: {},
  stateVersion: 2,
  currentTurnUserId: null,
  gameStateJson: null,
}

const seat = (id: string, name: string, isBot: boolean): MenteurPlayer => ({
  id,
  name,
  isBot,
  leftAt: null,
  dice: [2, 3, 4, 5, 6],
  lostCount: 0,
})

/** Gépéto (bavardage 3) annonce « 4 × 4 » sur trois 4 ; Riqui est au tour. */
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

const render = (state: MenteurState) =>
  renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale: 'fr', messages, timeZone: 'Europe/Paris' },
      createElement(TvMenteur, { room: ROOM, state: toMenteurSpectatorView(state) })
    )
  )

/** Le fil monté dans le bloc du bas, hors du panneau de révélation. */
const BOTTOM_FEED = '<div class="flex justify-center"><ul'

describe('TvMenteur', () => {
  it('pendant les enchères, le fil est en bas de l’écran', () => {
    const html = render(bidding())
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1)
    expect(html).toContain(BOTTOM_FEED)
  })

  it('à la révélation, le fil passe dans le panneau, après le résultat, avec la réaction du bot', () => {
    const html = render(reduceMenteur(bidding(), { type: 'DUDO', playerId: 'h', now: 1_000_000 }))
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1)
    expect(html).not.toContain(BOTTOM_FEED)
    const feedAt = html.indexOf('aria-live="polite"')
    const loser = html.indexOf('Gépéto perd un dé')
    expect(loser).toBeGreaterThan(-1)
    expect(feedAt).toBeGreaterThan(loser)
    // La parole de l'enchère, puis la réaction ; l'échelle des enchères a ses propres puces.
    const feed = html.slice(feedAt, html.indexOf('</ul>', feedAt))
    const items = [...feed.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
    expect(items).toHaveLength(2)
    // La réaction de Gépéto, démasqué, à Riqui (« caught ») : la variante suit la clé de la bulle.
    expect(items[1]).toMatch(/^Gépéto .*Riqui/u)
  })
})
