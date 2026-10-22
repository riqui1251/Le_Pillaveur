import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  createSFState,
  reduceSF,
  sfActive,
  toSFClientView,
  toSFSpectatorView,
  SF_COUNTDOWN_MS,
  type SFSpeech,
  type SFSpeechKind,
  type SFState,
} from '@/lib/sans-filtre/engine'
import { sfRevealReactions, type SFReactionView } from '@/lib/sans-filtre/reveal-reactions'
import { SansFiltreSpeechFeed } from './SansFiltreSpeechFeed'

/**
 * Le fil des paroles de Sans Filtre, rendu côté serveur avec le VRAI
 * catalogue de chaque langue : une clé absente ou un argument ICU mal nommé
 * ferait échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const game = (locale: string) =>
  (catalogue(locale) as { games: { 'sans-filtre': { game: Record<string, string> } } }).games['sans-filtre'].game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const seat = (id: string, name: string, isBot: boolean, isJudge = false) => ({
  id,
  name,
  isBot,
  leftAt: null,
  isJudge,
  hasPlayed: false,
})
const PLAYERS = [seat('h', 'Riqui', false, true), seat('l', 'Léa', false), seat('b1', 'Raoul', true), seat('b2', 'Bernadette', true)]
const sp = (playerId: string, kind: SFSpeechKind, targetId: string, round = 1): SFSpeech => ({ playerId, kind, targetId, round })
/** Une manche 2 en plein abattage : seul le fil compte ici. */
const submitting = (speech: SFSpeech[]): SFReactionView => ({ phase: 'submit', round: 1, players: PLAYERS, crowned: null, speech })

function render(
  view: SFReactionView,
  { locale = 'fr', variant = 'phone' as 'phone' | 'tv', meId = 'h' as string | null } = {},
  errors: unknown[] = []
): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      createElement(SansFiltreSpeechFeed, { view, iconOf: (p) => (p.isBot ? '🤖' : '🦊'), meId, variant })
    )
  )
}

const bubbles = (html: string) =>
  [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())

describe('SansFiltreSpeechFeed', () => {
  const FEED = [sp('b1', 'chase', 'l', 0), sp('b1', 'bribe', 'h'), sp('b2', 'rival', 'l')]

  it('une bulle par parole de la manche, auteur et cible nommés, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(submitting(FEED), { locale }, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(2)
      expect(html, locale).toContain(`aria-label="${game(locale).feedAria}"`)
      const [bribe, rival] = bubbles(html)
      expect(bribe, locale).toContain('Raoul')
      expect(bribe, locale).toContain('Riqui')
      expect(rival, locale).toContain('Bernadette')
      expect(rival, locale).toContain('Léa')
    }
  })

  it('la bulle qui vise le spectateur est surlignée sur son téléphone, jamais sur la TV', () => {
    expect(render(submitting(FEED)).match(/bg-gold\/20/g)).toHaveLength(1)
    expect(render(submitting(FEED), { variant: 'tv', meId: null })).not.toContain('bg-gold/20')
  })

  it('un kind inconnu de cet onglet est masqué ; monté vide, la région live existe déjà', () => {
    const html = render(submitting([sp('b1', 'bavard' as SFSpeechKind, 'h'), sp('b2', 'pitch', 'h')]))
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).not.toContain('botSay')
    const empty = render(submitting([]))
    expect(empty).toContain('aria-live="polite"')
    expect(empty).not.toContain('<li')
  })

  it('au couronnement, les réactions passent derrière les paroles de l’état, les mêmes sur chaque écran', () => {
    // Riqui juge ; Gépéto (3 de bavardage) promet un croissant, puis râle : Léa est couronnée.
    const seats = [
      { id: 'h', name: 'Riqui' },
      { id: 'l', name: 'Léa' },
      { id: 'g', name: 'Gépéto', isBot: true },
      { id: 'm', name: 'Mauricette', isBot: true },
    ]
    const whites = Array.from({ length: 60 }, (_, i) => `réponse ${i}`)
    const raw = createSFState(seats, ['Trou : ___.'], whites, 's', 0, 1)
    let s: SFState = reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: SF_COUNTDOWN_MS })
    for (const p of sfActive(s).filter((x) => x.id !== s.judgeId)) {
      const say = p.id === 'g' ? { kind: 'bribe' as const, targetId: 'h' } : undefined
      s = reduceSF(s, { type: 'PLAY_CARD', playerId: p.id, card: p.hand[0], now: 0, say })
    }
    s = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'h', card: s.submissions.find((x) => x.playerId === 'l')!.card, now: 0 })
    expect(s.phase).toBe('reveal')
    const reacted = sfRevealReactions(toSFSpectatorView(s))
    expect(reacted.length).toBe(2)
    for (const locale of LOCALES) {
      const tv = bubbles(render(toSFSpectatorView(s), { locale, variant: 'tv', meId: null }))
      expect(tv, locale).toHaveLength(3)
      for (const p of s.players) {
        expect(bubbles(render(toSFClientView(s, p.id), { locale, meId: p.id })), `${locale}/${p.id}`).toEqual(tv)
      }
    }
  })
})
