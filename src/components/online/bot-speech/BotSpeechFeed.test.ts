import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { BotSpeech } from '@/lib/online/bot-speech'
import { BotSpeechFeed, type BotSpeechFeedProps } from './BotSpeechFeed'
import { TV_FEED_SIZE, speechFeedItems, type LineTranslator } from './bot-speech-feed'

/**
 * Le fil commun aux jeux à débat, rendu côté serveur (react-dom/server) : la
 * suite tourne sous Node, sans DOM — ce qu'on vérifie est le balisage d'un
 * rendu, pas l'animation ni le défilement.
 */

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>
/** Le seul texte du socle lu par le fil : la pastille « Nouvelles paroles », jamais rendue au montage. */
const MESSAGES = { gameUi: { feed: { newer: 'Nouvelles paroles' } } }

type Kind = 'accuse' | 'cheer' | 'mystery'

const sp = (playerId: string, kind: Kind, targetId: string | null, round = 1): BotSpeech<Kind> => ({
  playerId,
  kind,
  targetId,
  round,
})

const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b2', name: 'Suzette', isBot: true },
]

/** Catalogue factice : `{name}` et `{clue}` interpolés, chaque appel consigné. */
function fakeTr(calls: { key: string; values?: Record<string, string> }[] = []): LineTranslator {
  const catalogue: Record<string, string> = {
    'botSay.accuse': 'Je vise {name}',
    'botSay.cheer': 'Bravo {name} pour « {clue} »',
  }
  return {
    has: (key) => key in catalogue,
    format: (key, values) => {
      calls.push({ key, values })
      return catalogue[key].replace('{name}', values?.name ?? '').replace('{clue}', values?.clue ?? '')
    },
  }
}

function render(props: Partial<BotSpeechFeedProps<Kind>> & Pick<BotSpeechFeedProps<Kind>, 'speeches'>): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale: 'fr', messages: MESSAGES, timeZone: 'Europe/Paris' },
      createElement(BotSpeechFeed<Kind>, {
        round: 1,
        players: PLAYERS,
        iconOf: () => '🤖',
        variant: 'phone',
        tr: fakeTr(),
        feedAria: 'Fil des paroles',
        ...props,
      })
    )
  )
}

const bubbles = (html: string) => html.match(/<li\b/g)?.length ?? 0

describe('BotSpeechFeed', () => {
  it('une bulle par parole connue ; un kind inconnu du catalogue est masqué, jamais rendu en clé brute', () => {
    const html = render({ speeches: [sp('b1', 'accuse', 'h'), sp('b2', 'mystery', 'h'), sp('b2', 'accuse', 'b1')] })
    expect(bubbles(html)).toBe(2)
    expect(html).toContain('Je vise Riqui')
    expect(html).toContain('Je vise Raoul')
    expect(html).not.toContain('mystery')
    expect(html).toContain('aria-label="Fil des paroles"')
  })

  it('badge seulement sur une parole d’un kind listé qui vise le spectateur local', () => {
    const aimedBadge = { kinds: ['accuse'] as const, text: 'Il t’accuse !' }
    const speeches = [sp('b1', 'accuse', 'h'), sp('b2', 'cheer', 'h'), sp('b2', 'accuse', 'b1')]
    const mine = render({ speeches, meId: 'h', aimedBadge, valuesOf: () => ({ clue: 'sable' }) })
    expect(mine.match(/Il t’accuse !/g)).toHaveLength(1)
    // Sans spectateur (TV), ou sans badge déclaré : aucune mention.
    expect(render({ speeches, aimedBadge, valuesOf: () => ({ clue: 'sable' }) })).not.toContain('Il t’accuse')
    expect(render({ speeches, meId: 'h', valuesOf: () => ({ clue: 'sable' }) })).not.toContain('Il t’accuse')
  })

  it('TV : les 4 dernières bulles de la manche, aux clés stables quand la fenêtre glisse', () => {
    const speeches = [
      sp('b1', 'accuse', 'h', 0),
      sp('b1', 'accuse', 'h'),
      sp('b2', 'accuse', 'b1'),
      sp('h', 'accuse', 'b2'),
      sp('b1', 'accuse', 'b2'),
      sp('b2', 'accuse', 'h'),
    ]
    expect(bubbles(render({ speeches, variant: 'tv' }))).toBe(TV_FEED_SIZE)
    expect(bubbles(render({ speeches, variant: 'phone' }))).toBe(5)
    const before = speechFeedItems(speeches.slice(0, 5), 1, null, TV_FEED_SIZE)
    const after = speechFeedItems(speeches, 1, null, TV_FEED_SIZE)
    expect(after.slice(0, 3).map((i) => i.key)).toEqual(before.slice(1).map((i) => i.key))
  })

  it('`valuesOf` alimente la phrase en plus de {name, speaker, target}, sans pouvoir les écraser', () => {
    const calls: { key: string; values?: Record<string, string> }[] = []
    const html = render({
      speeches: [sp('b2', 'cheer', 'b1')],
      tr: fakeTr(calls),
      valuesOf: (speech) => ({ clue: `indice-de-${speech.targetId}`, name: 'pirate' }),
    })
    expect(html).toContain('Bravo Raoul pour « indice-de-b1 »')
    expect(calls.find((c) => c.key === 'botSay.cheer')?.values).toEqual({
      clue: 'indice-de-b1',
      name: 'Raoul',
      speaker: 'f',
      target: 'm',
    })
  })

  it('téléphone : bulles de 14 px en crème, auteur sur sa ligne en or, même texte que la TV', () => {
    const speeches = [sp('b1', 'accuse', 'h'), sp('b2', 'accuse', 'b1')]
    const phone = render({ speeches, meId: 'h' })
    expect(phone).not.toMatch(/text-xs\b|text-white/)
    expect(phone).toContain('text-sm')
    // La bulle qui me vise ressort du fil ; l'autre reste sur le feutre. Sur
    // son fond or, l'auteur passe en or pâle (l'or pur y tombe à 4,4:1).
    const items = [...phone.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1])
    expect(items[0]).toContain('bg-gold/20')
    expect(items[0]).toContain('class="block font-bold leading-tight text-amber-200"')
    expect(items[1]).not.toContain('bg-gold/20')
    expect(items[1]).toContain('class="block font-bold leading-tight text-gold"')
    const text = (html: string) =>
      [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    expect(text(phone)).toEqual(text(render({ speeches, variant: 'tv' })))
    expect(text(phone)[0]).toBe('🤖Raoul Je vise Riqui')
  })

  it('« all » (défaut) : le fil est la région annoncée ; « aimed » : le fil se tait, une région à part attend', () => {
    const speeches = [sp('b1', 'accuse', 'h')]
    const all = render({ speeches, meId: 'h' })
    expect(all.startsWith('<ul aria-live="polite"')).toBe(true)
    expect(all).not.toContain('role="status"')
    const aimed = render({ speeches, meId: 'h', live: 'aimed' })
    expect(aimed.startsWith('<ul aria-live="off"')).toBe(true)
    // Montée vide : l'historique présent au montage ne s'annonce pas.
    expect(aimed).toContain('<p role="status" aria-live="polite" aria-atomic="true" class="sr-only"></p>')
    // La TV garde son fil annoncé, quel que soit le réglage.
    expect(render({ speeches, variant: 'tv', live: 'aimed' }).startsWith('<ul aria-live="polite"')).toBe(true)
  })

  it('la pastille « Nouvelles paroles » n’existe pas au montage : le fil commence en bas', () => {
    expect(render({ speeches: [sp('b1', 'accuse', 'h')] })).not.toContain('Nouvelles paroles')
  })
})
