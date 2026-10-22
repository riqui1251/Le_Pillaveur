import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  bluffActive,
  createBluffState,
  reduceBluff,
  toBluffClientView,
  toBluffSpectatorView,
  BLUFF_COUNTDOWN_MS,
  type BluffSpeech,
  type BluffSpeechKind,
  type BluffState,
} from '@/lib/bluff/engine'
import { bluffRevealReactions, type BluffReactionView } from '@/lib/bluff/reveal-reactions'
import { BluffSpeechFeed } from './BluffSpeechFeed'

/**
 * Le fil des paroles du Grand Bluff, rendu côté serveur avec le VRAI
 * catalogue de chaque langue : une clé absente ou un argument ICU mal nommé
 * ferait échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { bluff: { game: Record<string, string> } } }).games.bluff.game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false, leftAt: null },
  { id: 'b1', name: 'Raoul', isBot: true, leftAt: null },
  { id: 'b2', name: 'Bernadette', isBot: true, leftAt: null },
]
const sp = (playerId: string, kind: BluffSpeechKind, targetId: string, round = 1): BluffSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})
/** Une manche 2 (promptIdx 1) en plein vote : seul le fil compte ici. */
const voting = (speech: BluffSpeech[]): BluffReactionView => ({
  phase: 'vote',
  promptIdx: 1,
  players: PLAYERS,
  lastReveal: null,
  speech,
})

function render(
  view: BluffReactionView,
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', meId = 'h' as string | null } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(BluffSpeechFeed, { view, iconOf: (p) => (p.isBot ? '🤖' : '🦊'), meId, variant })
    )
  )
}

const bubbles = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('BluffSpeechFeed', () => {
  const FEED = [sp('b1', 'chase', 'h', 0), sp('b1', 'proud', 'h'), sp('b2', 'unsure', 'h')]

  it('une bulle par parole de la manche, auteur et cible nommés, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(voting(FEED), { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(2)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      for (const b of bubbles(html)) expect(b, locale).toContain('Riqui')
      expect(html, locale).toContain('Raoul')
      expect(html, locale).toContain('Bernadette')
    }
  })

  it('la bulle qui vise le spectateur est surlignée sur son téléphone, jamais sur la TV', () => {
    expect(render(voting(FEED))).toContain('bg-gold/20')
    expect(render(voting(FEED), { meId: 'b1' })).not.toContain('bg-gold/20')
    expect(render(voting(FEED), { variant: 'tv', meId: null })).not.toContain('bg-gold/20')
  })

  it('un kind inconnu de cet onglet est masqué, jamais rendu en clé brute', () => {
    const html = render(voting([sp('b1', 'bavard' as BluffSpeechKind, 'h'), sp('b2', 'sure', 'h')]))
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
  })

  it('monté vide dès la première phase : la région aria-live existe avant la première bulle', () => {
    const html = render(voting([]))
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('<li')
  })

  it('à la révélation, les réactions passent derrière les paroles de l’état, les mêmes sur chaque écran', () => {
    // Raoul (bavardage 2) et Gépéto (3) ont voté le bluff de Riqui ; Gépéto réagit à coup sûr.
    const seats = [
      { id: 'h', name: 'Riqui' },
      { id: 'r', name: 'Raoul', isBot: true },
      { id: 'g', name: 'Gépéto', isBot: true },
    ]
    const raw = createBluffState(seats, [{ id: 'q', q: 'Capitale ?', answer: 'Tokyo', decoys: ['Osaka', 'Kyoto'] }], 's', 0, 1)
    let s: BluffState = reduceBluff(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: BLUFF_COUNTDOWN_MS })
    for (const p of bluffActive(s)) s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: p.id, text: `bluff ${p.id}`, now: 0 })
    s = reduceBluff(s, { type: 'VOTE', playerId: 'g', candidateId: s.candidates.find((c) => c.authorId === 'r')!.candidateId, now: 0, say: { kind: 'sure', targetId: 'h' } })
    for (const id of ['r', 'h']) {
      s = reduceBluff(s, { type: 'VOTE', playerId: id, candidateId: s.candidates.find((c) => c.isReal)!.candidateId, now: 0 })
    }
    expect(s.phase).toBe('reveal')
    const reacted = bluffRevealReactions(toBluffSpectatorView(s))
    expect(reacted.length).toBeGreaterThan(0)
    for (const locale of LOCALES) {
      const tv = bubbles(render(toBluffSpectatorView(s), { locale, variant: 'tv', meId: null }))
      expect(tv, locale).toHaveLength(1 + reacted.length)
      for (const p of s.players) {
        expect(bubbles(render(toBluffClientView(s, p.id), { locale, meId: p.id })), `${locale}/${p.id}`).toEqual(tv)
      }
    }
  })
})
