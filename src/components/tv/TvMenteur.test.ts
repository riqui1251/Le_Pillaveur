import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import type { TvRoomDto } from '@/lib/online-room'
import { DEFAULT_ONLINE_PREFERENCES } from '@/lib/online-preferences'
import {
  reduceMenteur,
  toMenteurSpectatorView,
  type MenteurPlayer,
  type MenteurState,
} from '@/lib/menteur/engine'
import { TvMenteur, hiddenBluffCount, tvLadderLimit, tvRevealLadderRows } from './TvMenteur'

/**
 * L'écran TV du Menteur rendu côté serveur : à la révélation, le fil des
 * paroles — et la réaction du bot qu'il porte — passe dans le panneau de
 * révélation, avec le résultat, comme sur les téléphones.
 */

const ambiance = vi.hoisted(() => ({ mode: 'alcool' }))
vi.mock('@/components/providers/AmbianceAttribute', () => ({
  useAmbianceMode: () => ({ mode: ambiance.mode, setMode: () => {} }),
}))

const catalogue = JSON.parse(readFileSync(new URL('../../../messages/fr.json', import.meta.url), 'utf8'))
const messages = catalogue as AbstractIntlMessages

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

const render = (state: MenteurState, room: TvRoomDto = ROOM) =>
  renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale: 'fr', messages, timeZone: 'Europe/Paris' },
      createElement(TvMenteur, { room, state: toMenteurSpectatorView(state) })
    )
  )

/** Le fil monté dans sa colonne, à côté de l'enchère, hors du panneau de révélation. */
const SIDE_FEED = '<div class="flex w-[30rem] shrink-0 flex-col justify-center self-stretch"><div class="flex min-h-0 shrink flex-col justify-end overflow-hidden"><ul'

describe('TvMenteur', () => {
  it('pendant les enchères, le fil est dans sa colonne à côté de l’enchère', () => {
    const html = render(bidding())
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1)
    expect(html).toContain(SIDE_FEED)
  })

  it('sans parole, le fil reste monté mais sa colonne est masquée', () => {
    const html = render({ ...bidding(), speech: [] })
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1)
    expect(html).not.toContain(SIDE_FEED)
    expect(html).toContain('<div class="hidden"><div class="flex min-h-0 shrink flex-col justify-end overflow-hidden"><ul')
  })

  it('pendant les enchères, aucun gobelet n’est ouvert : le seul dé dessiné est celui de l’enchère', () => {
    const html = render(bidding())
    expect(html.match(/role="img"/g)).toHaveLength(1)
    expect(html).toContain('15 dés sur la table')
  })

  it('aucune taille de texte interdite ni taille en px', () => {
    const states = [bidding(), reduceMenteur(bidding(), { type: 'DUDO', playerId: 'h', now: 1_000_000 })]
    for (const state of states) {
      const html = render(state)
      expect(html).not.toMatch(/text-(xs|sm)\b|text-\[\d+px\]/)
      // Le décalage d'entrée des bulles (framer-motion, translateY) n'est pas une taille.
      expect(html).not.toMatch(/style="[^"]*(width|height|font-size|padding|border-radius):[^;"]*\dpx/)
    }
  })

  it('à la révélation, le fil passe dans le panneau, après le résultat, avec la réaction du bot', () => {
    const html = render(reduceMenteur(bidding(), { type: 'DUDO', playerId: 'h', now: 1_000_000 }))
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1)
    expect(html).not.toContain(SIDE_FEED)
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

describe('podium', () => {
  const finished = (rematchVotes: string[]): MenteurState => ({
    ...bidding(),
    phase: 'finished',
    winnerId: 'h',
    currentBid: null,
    rematchVotes,
  })
  const member = (userId: string, displayName: string): TvRoomDto['members'][number] => ({
    userId,
    displayName,
    isHost: userId === 'h',
    isReady: true,
    preferences: DEFAULT_ONLINE_PREFERENCES,
    level: 1,
    role: 'player',
  })
  const room: TvRoomDto = { ...ROOM, members: [member('h', 'Riqui'), member('u', 'Léa')] }

  it('montre la revanche en cours, votes sur le quorum, comme le bouton des téléphones', () => {
    expect(render(finished(['h']), room)).toContain('Revanche en cours…')
    expect(render(finished(['h']), room)).toMatch(/>1\/2</)
    expect(render(finished([]), room)).not.toContain('Revanche en cours…')
  })
})

describe('ambiance Sans alcool', () => {
  /** Gépéto a déjà perdu deux dés (1 + 2 = 3 gorgées). */
  const sipped = (state: MenteurState): MenteurState => ({
    ...state,
    players: state.players.map((p) => (p.id === 'g' ? { ...p, lostCount: 2 } : p)),
  })
  const screens = (): MenteurState[] => [
    sipped(bidding()),
    sipped(reduceMenteur(bidding(), { type: 'DUDO', playerId: 'h', now: 1_000_000 })),
    sipped({ ...bidding(), phase: 'finished', winnerId: 'h', currentBid: null }),
  ]
  const inMode = (mode: string, state: MenteurState) => {
    ambiance.mode = mode
    try {
      return render(state)
    } finally {
      ambiance.mode = 'alcool'
    }
  }

  it('Apéro : la chope et les gorgées bues, en jeu, à la révélation et au podium', () => {
    for (const state of screens()) expect(inMode('alcool', state)).toContain('lucide-beer')
  })

  it('Soft : aucune chope, nulle part', () => {
    for (const state of screens()) expect(inMode('soft', state)).not.toContain('lucide-beer')
  })
})

describe('révélation : échelle et bluffs', () => {
  it('une échelle rognée compte les marques « sans un seul » tombées', () => {
    const bids = [true, false, true, false, false].map((bluff, i) => ({ qty: i + 1, face: 3, by: 'g', bluff }))
    expect(hiddenBluffCount(bids, undefined)).toBe(0)
    expect(hiddenBluffCount(bids, 3)).toBe(1)
    expect(hiddenBluffCount(bids, 2)).toBe(2)
  })

  it('le bandeau « joueur parti » et un verdict sur deux lignes laissent moins de lignes, jamais zéro', () => {
    const base = { diceRows: 6, banner: false, verdictRem: 60, outcomeChars: 40, eliminatedChars: 0 }
    const rows = tvRevealLadderRows(base)
    expect(rows).toBe(2)
    expect(tvRevealLadderRows({ ...base, banner: true })).toBe(1)
    expect(tvRevealLadderRows({ ...base, banner: true, verdictRem: 90 })).toBe(1)
    expect(tvRevealLadderRows({ ...base, diceRows: 2 })).toBeGreaterThan(rows)
  })
})

describe('tvLadderLimit', () => {
  const chain = (n: number, bluffEvery = 0) =>
    Array.from({ length: n }, (_, i) => ({ qty: i + 1, face: 2, by: 'g', bluff: bluffEvery > 0 && i % bluffEvery === 0 }))

  it('toute la chaîne tient : pas de « … »', () => {
    expect(tvLadderLimit(chain(3), 44, 2)).toBeUndefined()
  })

  it('une chaîne trop longue garde les dernières enchères qui tiennent sur les lignes données', () => {
    const limit = tvLadderLimit(chain(20), 44, 2)
    expect(limit).toBeGreaterThan(2)
    expect(limit).toBeLessThan(10)
    expect(tvLadderLimit(chain(20), 44, 4)).toBeGreaterThan(limit as number)
  })

  it('les marques de bluff, plus larges, laissent moins de puces', () => {
    expect(tvLadderLimit(chain(20, 1), 44, 2)).toBeLessThan(tvLadderLimit(chain(20), 44, 2) as number)
  })
})
