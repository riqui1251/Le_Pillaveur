import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import {
  reduceMenteur,
  toMenteurClientView,
  toMenteurSpectatorView,
  type MenteurPlayer,
  type MenteurSpeech,
  type MenteurSpeechKind,
  type MenteurState,
} from '@/lib/menteur/engine'
import { menteurRevealReactions, type MenteurReactionView } from '@/lib/menteur/reveal-reactions'
import { MenteurSpeechFeed } from './MenteurSpeechFeed'

/**
 * Le fil des paroles du Menteur, rendu côté serveur avec le VRAI catalogue
 * de chaque langue : une clé absente ou un argument ICU mal nommé ferait
 * échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { menteur: { game: Record<string, string> } } }).games.menteur.game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b2', name: 'Bernadette', isBot: true },
]
const sp = (playerId: string, kind: MenteurSpeechKind, targetId: string, round = 2): MenteurSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})
/** Une vue d'enchères de la manche 2 : seul le fil compte ici. */
const bidding = (speech: MenteurSpeech[]): MenteurReactionView => ({
  phase: 'bidding',
  round: 2,
  players: PLAYERS,
  lastReveal: null,
  speech,
})

function render(
  view: MenteurReactionView,
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', meId = 'h' as string | null } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(MenteurSpeechFeed, {
        view,
        iconOf: (p) => (p.isBot ? '🤖' : '🦊'),
        meId,
        variant,
      })
    )
  )
}

/** Le texte de chaque bulle, sans balises. */
const bubbles = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('MenteurSpeechFeed', () => {
  const FEED = [
    sp('b1', 'grudge', 'h', 1),
    sp('b1', 'sure', 'b2'),
    sp('b2', 'unsure', 'h'),
    sp('b1', 'suspect', 'h'),
  ]

  it('une bulle par parole de la manche, nom de l’auteur et cible nommée, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(bidding(FEED), { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(3)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      expect(html, locale).toContain('Raoul')
      expect(html, locale).toContain('Bernadette')
      expect(html, locale).toContain('Riqui')
    }
  })

  it('« On te défie ! » sur le « Menteur ! » qui vise le spectateur, et lui seul ; jamais sur la TV', () => {
    for (const locale of LOCALES) {
      const badge = game(locale).speechAimedYou
      const count = (html: string) => html.split(badge).length - 1
      expect(count(render(bidding(FEED), { locale })), locale).toBe(1)
      expect(count(render(bidding([sp('b1', 'again', 'h')]), { locale })), locale).toBe(1)
      expect(count(render(bidding([sp('b1', 'suspect', 'b2')]), { locale })), locale).toBe(0)
      expect(count(render(bidding(FEED), { locale, variant: 'tv', meId: null })), locale).toBe(0)
    }
  })

  it('un kind inconnu de cet onglet est masqué, jamais rendu en clé brute', () => {
    const html = render(bidding([sp('b1', 'bavard' as MenteurSpeechKind, 'h'), sp('b2', 'sure', 'h')]))
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })

  it('monté vide dès les enchères : la région aria-live existe avant la première bulle', () => {
    const html = render(bidding([]))
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('<li')
  })

  describe('à la révélation', () => {
    const seat = (id: string, name: string, isBot: boolean): MenteurPlayer => ({
      id,
      name,
      isBot,
      leftAt: null,
      dice: [2, 3, 4, 5, 6],
      lostCount: 0,
    })
    /**
     * Gépéto (bavardage 3 : il parle à coup sûr) annonce « 4 × 4 » sur trois
     * 4 et Riqui le démasque. Le fil de la manche a deux paroles.
     */
    const revealState = (): MenteurState => {
      const players = [seat('h', 'Riqui', false), seat('g', 'Gépéto', true), seat('s', 'Suzette', true)]
      const bid = { qty: 4, face: 4, by: 'g' }
      return reduceMenteur(
        {
          version: 1,
          phase: 'bidding',
          players,
          turnIdx: 0,
          currentBid: bid,
          lastReveal: null,
          round: 2,
          winnerId: null,
          rematchVotes: [],
          rngState: 1,
          rulePalifico: false,
          ruleCalza: false,
          revealAt: null,
          palifico: false,
          bids: [bid],
          duels: [],
          speech: [sp('s', 'grudge', 'g'), sp('g', 'sure', 'h')],
        },
        { type: 'DUDO', playerId: 'h', now: 1_000_000 }
      )
    }

    it('la réaction du bot passe derrière les paroles de l’état, la même sur le téléphone et la TV, dans les 4 langues', () => {
      const state = revealState()
      const phoneView = toMenteurClientView(state, 'h')
      const tvView = toMenteurSpectatorView(state)
      expect(menteurRevealReactions(tvView)).toEqual([sp('g', 'caught', 'h')])
      for (const locale of LOCALES) {
        const errors: unknown[] = []
        const phone = render(phoneView, { locale }, errors)
        const tv = render(tvView, { locale, variant: 'tv', meId: null }, errors)
        expect(errors, locale).toEqual([])
        const phoneBubbles = bubbles(phone)
        expect(phoneBubbles, locale).toHaveLength(3)
        expect(bubbles(tv), locale).toEqual(phoneBubbles)
        const reaction = phoneBubbles[2]
        // L'avatar, puis le nom de l'auteur en gras.
        expect(reaction, locale).toMatch(/^🤖Gépéto /u)
        expect(reaction, locale).toContain('Riqui')
        // Gépéto a déjà parlé dans la manche : son tic n'habille que sa 1re bulle.
        const tic = (game(locale) as unknown as { botTic: Record<string, string> }).botTic.gepeto
        expect(phoneBubbles[1], locale).toContain(tic)
        expect(reaction, locale).not.toContain(tic)
      }
    })

    it('la réaction qui vise le spectateur est surlignée sur son téléphone, sans badge de défi', () => {
      const html = render(toMenteurClientView(revealState(), 'h'))
      const items = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1])
      expect(items).toHaveLength(3)
      expect(items[2]).toContain('border-gold/40')
      expect(html).not.toContain(game('fr').speechAimedYou)
    })

    it('aucune réaction écrite : le fil de l’état reste celui des coups', () => {
      const state = revealState()
      expect(state.speech).toHaveLength(2)
      expect(state.speech?.some((s) => s.kind === 'caught')).toBe(false)
    })
  })
})
