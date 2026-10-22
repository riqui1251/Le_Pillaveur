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
const ambiance = vi.hoisted(() => ({ mode: 'normal' }))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'h', ambianceMode: ambiance.mode } }),
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
// L'écran de fin partagé ne rend ici que ce que le jeu lui passe : son titre et son classement.
vi.mock('@/components/online/OnlineEndScreen', async () => {
  const { createElement: h } = await import('react')
  return {
    OnlineEndScreen: ({ header, ranking }: { header?: unknown; ranking?: unknown }) =>
      h('div', { 'data-end-screen': '' }, header as never, ranking as never),
  }
})
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))

const messages = JSON.parse(
  readFileSync(new URL('../../../../messages/fr.json', import.meta.url), 'utf8')
) as AbstractIntlMessages
const game = (
  messages as {
    games: { menteur: { game: { dudo: string; bid: string; yourDice: string; reveal: { continue: string } } } }
  }
).games.menteur.game

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

/** La barre fixe du bas (OnlineActionBar), jusqu'à la fin du rendu. */
const barOf = (html: string) => html.slice(html.indexOf('fixed inset-x-0 bottom-0'))

describe('MenteurOnline : ergonomie à 375 px', () => {
  it('à mon tour, Menteur ! et Enchérir sont dans la barre fixe, en 56 px, crème sur rouge et encre sur or', () => {
    const bar = barOf(render(bidding()))
    const buttons = [...bar.matchAll(/<button[^>]*class="([^"]*)"[^>]*>(.*?)<\/button>/g)]
    const dudo = buttons.find(([, , label]) => label.includes(game.dudo))
    const bid = buttons.find(([, , label]) => label.includes(game.bid))
    expect(dudo?.[1].split(' ')).toContain('h-14')
    expect(dudo?.[1]).toContain('bg-suit-red')
    expect(dudo?.[1]).toContain('text-cream')
    expect(bid?.[1].split(' ')).toContain('h-14')
    expect(bid?.[1]).toContain('bg-amber-500')
    expect(bid?.[1]).toContain('text-[#24201A]')
    // Plus aucun bouton de 36 px ni de fond gris dans la barre.
    for (const [, cls] of buttons) expect(cls.split(' ')).not.toContain('h-9')
    expect(bar).not.toContain('bg-gray-950')
    // Les six faces font 48 px de haut ; les steppers ont une surface visible.
    expect(bar.match(/aria-pressed="(true|false)"[^>]*class="flex h-12/g)).toHaveLength(6)
    expect(bar).toContain('border-gold/30 bg-felt-deep/70 text-gold')
  })

  it('au tour d’un autre : mes dés restent sous le pouce, sans aucune commande d’enchère', () => {
    const bar = barOf(render({ ...bidding(), turnIdx: 1 }))
    expect(bar).toContain(game.yourDice)
    expect(bar).not.toContain(game.dudo)
    expect(bar).not.toContain(game.bid)
  })

  it('à la révélation : les dés qui comptent cerclés d’or, les autres atténués et grisés ; « Manche suivante » dans la barre', () => {
    const html = render(reduceMenteur(bidding(), { type: 'DUDO', playerId: 'h', now: 1_000_000 }))
    // Chacun a un seul 4 (aucun joker) : 3 dés comptent sur 15.
    expect(html.match(/ring-2 ring-gold ring-offset-1/g)).toHaveLength(3)
    expect(html.match(/opacity-30 grayscale/g)).toHaveLength(12)
    expect(html).not.toContain('opacity-35')
    expect(barOf(html)).toContain(game.reveal.continue)
  })
})

describe('MenteurOnline : ambiance Sans alcool', () => {
  /** Gépéto a perdu deux dés (1 + 2 = 3 gorgées) ; la partie est en cours. */
  const sipped = (): MenteurState => {
    const state = bidding()
    return { ...state, players: state.players.map((p) => (p.id === 'g' ? { ...p, lostCount: 2 } : p)) }
  }
  /** Riqui gagne : Gépéto et Suzette ont perdu leurs cinq dés (15 gorgées chacun). */
  const finished = (): MenteurState => ({
    ...bidding(),
    phase: 'finished',
    winnerId: 'h',
    currentBid: null,
    bids: [],
    players: [
      seat('h', 'Riqui', false),
      { ...seat('g', 'Gépéto', true), dice: [], lostCount: 5 },
      { ...seat('s', 'Suzette', true), dice: [], lostCount: 5 },
    ],
  })
  const inMode = (mode: string, state: MenteurState) => {
    ambiance.mode = mode
    try {
      return render(state)
    } finally {
      ambiance.mode = 'normal'
    }
  }

  it('Apéro : les gorgées bues se lisent sous le joueur et au classement final', () => {
    expect(inMode('normal', sipped())).toContain('🍺 3')
    const end = inMode('normal', finished())
    expect(end).toContain('data-end-screen')
    expect(end).toContain('lucide-beer')
  })

  it('Soft : ni chope ni gorgées, ni sous le joueur ni au classement final', () => {
    expect(inMode('soft', sipped())).not.toContain('🍺')
    const end = inMode('soft', finished())
    expect(end).toContain('data-end-screen')
    expect(end).not.toContain('lucide-beer')
    expect(end).not.toContain('🍺')
  })
})
