import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  createDilState,
  reduceDil,
  toDilClientView,
  toDilSpectatorView,
  DIL_COUNTDOWN_MS,
  type DilCard,
  type DilSpeech,
  type DilSpeechKind,
  type DilState,
} from '@/lib/dilemmes/engine'
import { dilRevealReactions, type DilReactionView } from '@/lib/dilemmes/reveal-reactions'
import { DilemmesSpeechFeed } from './DilemmesSpeechFeed'

/**
 * Le fil des paroles de Dilemmes, rendu côté serveur avec le VRAI catalogue
 * de chaque langue : une clé absente ou un argument ICU mal nommé ferait
 * échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { dilemmes: { game: Record<string, string> } } }).games.dilemmes.game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const NEVER: DilCard = { kind: 'never', text: 'dormi au travail' }
const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false, leftAt: null },
  { id: 'l', name: 'Léa', isBot: false, leftAt: null },
  { id: 'b1', name: 'Raoul', isBot: true, leftAt: null },
  { id: 'b2', name: 'Bernadette', isBot: true, leftAt: null },
]
const sp = (playerId: string, kind: DilSpeechKind, targetId: string, round = 1): DilSpeech => ({ playerId, kind, targetId, round })
/** Deuxième carte en plein vote : seul le fil compte ici. */
const voting = (speech: DilSpeech[]): DilReactionView => ({ phase: 'vote', round: 1, card: NEVER, players: PLAYERS, lastReveal: null, speech })

function render(
  view: DilReactionView,
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', meId = 'h' as string | null } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(DilemmesSpeechFeed, { view, iconOf: (p) => (p.isBot ? '🤖' : '🦊'), meId, variant })
    )
  )
}

const bubbles = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('DilemmesSpeechFeed', () => {
  const FEED = [sp('b1', 'easy', 'l', 0), sp('b1', 'confess', 'h'), sp('b2', 'tough', 'l')]

  it('une bulle par parole de la carte en cours, auteur et cible nommés, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(voting(FEED), { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(2)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      const [confess, tough] = bubbles(html)
      expect(confess, locale).toContain('Raoul')
      expect(confess, locale).toContain('Riqui')
      expect(tough, locale).toContain('Bernadette')
      expect(tough, locale).toContain('Léa')
    }
  })

  it('la bulle qui vise le spectateur est surlignée sur son téléphone, jamais sur la TV', () => {
    expect(render(voting(FEED)).match(/bg-gold\/20/g)).toHaveLength(1)
    expect(render(voting(FEED), { variant: 'tv', meId: null })).not.toContain('bg-gold/20')
  })

  it('un kind inconnu de cet onglet est masqué ; monté vide, la région live existe déjà', () => {
    const html = render(voting([sp('b1', 'bavard' as DilSpeechKind, 'h'), sp('b2', 'easy', 'h')]))
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
    const empty = render(voting([]))
    expect(empty).toContain('aria-live="polite"')
    expect(empty).not.toContain('<li')
  })

  it('à la révélation, la réaction passe derrière les paroles de l’état, la même sur chaque écran', () => {
    // Gépéto (3 de bavardage) dit « dur de choisir », puis réclame les détails à Riqui.
    const seats = [
      { id: 'h', name: 'Riqui' },
      { id: 'g', name: 'Gépéto', isBot: true },
      { id: 'l', name: 'Léa' },
    ]
    const raw = { ...createDilState(seats, [NEVER], 's', 0, 1), cards: [NEVER] }
    let s: DilState = reduceDil(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: DIL_COUNTDOWN_MS })
    s = reduceDil(s, { type: 'VOTE', playerId: 'g', choice: 'B', now: 0, say: { kind: 'tough', targetId: 'h' } })
    s = reduceDil(s, { type: 'VOTE', playerId: 'h', choice: 'A', now: 0 })
    s = reduceDil(s, { type: 'VOTE', playerId: 'l', choice: 'B', now: 0 })
    expect(s.phase).toBe('reveal')
    expect(dilRevealReactions(toDilSpectatorView(s))).toEqual([{ playerId: 'g', kind: 'spill', targetId: 'h', round: 0 }])
    for (const locale of LOCALES) {
      const tv = bubbles(render(toDilSpectatorView(s), { locale, variant: 'tv', meId: null }))
      expect(tv, locale).toHaveLength(2)
      for (const p of s.players) {
        expect(bubbles(render(toDilClientView(s, p.id), { locale, meId: p.id })), `${locale}/${p.id}`).toEqual(tv)
      }
    }
  })
})
