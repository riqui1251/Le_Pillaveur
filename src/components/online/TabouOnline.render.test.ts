import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  createTabouState,
  reduceTabou,
  toTabouClientView,
  TABOU_COUNTDOWN_MS,
  TABOU_ROUND_MS,
  type TabouEntry,
  type TabouState,
} from '@/lib/tabou/engine'
import { TabouOnline } from './TabouOnline'

/**
 * L'écran téléphone du Tabou rendu côté serveur, hooks de salle simulés, avec
 * le VRAI catalogue des 4 langues. Ce qu'on vérifie : une manche écourtée
 * (personne pour deviner, décrivant absent) dit pourquoi elle ne dure que
 * quelques secondes — et une manche normale ne dit rien.
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
// L'en-tête de l'écran de fin est rendu tel quel : c'est lui qui annonce le vainqueur.
vi.mock('@/components/online/OnlineEndScreen', () => ({
  OnlineEndScreen: ({ header }: { header: unknown }) => header,
}))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const shortRound = (locale: string): string =>
  (catalogue(locale) as { games: { tabou: { game: { shortRound: string } } } }).games.tabou.game.shortRound

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const WORDS: TabouEntry[] = [
  { word: 'Pizza', taboo: ['Italie', 'fromage', 'four', 'tranche'], diff: 1 },
  { word: 'Chat', taboo: ['miauler', 'griffe', 'félin', 'ronronner'], diff: 1 },
  { word: 'Plage', taboo: ['sable', 'mer', 'soleil', 'serviette'], diff: 1 },
]
const NOW = Date.now()

/** p0 et p2 en équipe A, p1 et p3 en B. Manche 1 ouverte : p0 décrit. */
function firstRound(): TabouState {
  const players = Array.from({ length: 4 }, (_, i) => ({
    id: `p${i}`,
    name: `Joueur ${i}`,
    team: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
  }))
  const raw = createTabouState(players, WORDS, 'seed-render', NOW - TABOU_COUNTDOWN_MS, 20)
  return reduceTabou(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: NOW })
}

/** p3 quitte, puis vient le tour de p1 : il est là, mais plus personne ne peut deviner pour lui. */
function p1AloneInTeam(): TabouState {
  let s = reduceTabou(firstRound(), { type: 'LEAVE', playerId: 'p3', at: NOW + 1_000 })
  s = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: NOW + TABOU_ROUND_MS })
  s = reduceTabou(s, { type: 'CONTINUE', playerId: 'p0', now: NOW + TABOU_ROUND_MS + 1_000 })
  expect(s.describerId).toBe('p1')
  return s
}

function render(state: TabouState, viewerId: string, locale: string = 'fr', errors: unknown[] = []): string {
  room.viewerId = viewerId
  room.current = {
    id: 'r',
    gameId: 'tabou',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: state.describerId,
    gameStateJson: JSON.stringify(toTabouClientView(state, viewerId)),
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
      createElement(TabouOnline)
    )
  )
}

/** 2 contre 2, un départ de chaque côté, les partis remplacés par des bots : bilan d'une partie bloquée. */
function stalledBilan(pointsA: number): TabouState {
  let s = firstRound()
  for (let i = 0; i < pointsA; i += 1) s = reduceTabou(s, { type: 'FOUND', playerId: 'p2', now: NOW + 1_000 + i })
  s = reduceTabou(s, { type: 'LEAVE', playerId: 'p2', at: NOW + 5_000 })
  s = reduceTabou(s, { type: 'LEAVE', playerId: 'p3', at: NOW + 6_000 })
  s = reduceTabou(s, { type: 'REPLACE_LEFT', now: NOW + 200_000, graceMs: 180_000 })
  expect(s.phase).toBe('roundEnd')
  return s
}

const game = (locale: string) =>
  (catalogue(locale) as { games: { tabou: { game: { victory: Record<string, string>; roundEnd: Record<string, string> } } } })
    .games.tabou.game

describe('TabouOnline : partie arrêtée faute de joueurs', () => {
  it('au bilan : la raison est écrite et le bouton mène au résultat, dans les 4 langues', () => {
    const bilan = stalledBilan(2)
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(bilan, 'p0', locale, errors)
      expect(errors, locale).toEqual([])
      expect(html, locale).toContain(game(locale).victory.stopped)
      expect(html, locale).toContain(game(locale).roundEnd.seeResult)
    }
  })

  it('à la fin : le meilleur score l’emporte, et l’arrêt est expliqué', () => {
    const over = reduceTabou(stalledBilan(2), { type: 'CONTINUE', playerId: 'p0', now: NOW + 201_000 })
    expect(over.phase).toBe('finished')
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(over, 'p0', locale, errors)
      expect(errors, locale).toEqual([])
      // Le rendu échappe l'apostrophe droite de « L'équipe ».
      expect(html, locale).toContain(game(locale).victory.teamAWin.replace(/'/g, '&#x27;'))
      expect(html, locale).toContain(game(locale).victory.stopped)
    }
  })

  it('à égalité : ni vainqueur ni équipe B par défaut', () => {
    const over = reduceTabou(stalledBilan(0), { type: 'CONTINUE', playerId: 'p0', now: NOW + 201_000 })
    for (const locale of LOCALES) {
      const html = render(over, 'p1', locale)
      expect(html, locale).toContain(game(locale).victory.draw)
      expect(html, locale).not.toContain(game(locale).victory.teamBWin)
    }
  })

  it('partis depuis plus de 3 min, jamais remplacés : le bouton annonce le résultat, comme le moteur', () => {
    let s = firstRound()
    // Délai de retour écoulé depuis longtemps, aucun téléphone ne les a convertis.
    s = reduceTabou(s, { type: 'LEAVE', playerId: 'p2', at: NOW - 400_000 })
    s = reduceTabou(s, { type: 'LEAVE', playerId: 'p3', at: NOW - 400_000 })
    expect(s.phase).toBe('roundEnd')

    const html = render(s, 'p0')

    // Le moteur arrêterait la partie au clic : l'écran ne promet plus la manche suivante.
    expect(html).toContain(game('fr').victory.stopped)
    expect(html).toContain(game('fr').roundEnd.seeResult)
  })

  it('partis depuis moins de 3 min : le bouton lance bien la manche suivante', () => {
    let s = firstRound()
    s = reduceTabou(s, { type: 'LEAVE', playerId: 'p2', at: Date.now() - 10_000 })
    s = reduceTabou(s, { type: 'LEAVE', playerId: 'p3', at: Date.now() - 10_000 })

    const html = render(s, 'p0')

    expect(html).not.toContain(game('fr').victory.stopped)
    expect(html).not.toContain(game('fr').roundEnd.seeResult)
  })

  it('un bilan ordinaire n’annonce pas d’arrêt', () => {
    const state = firstRound()
    const bilan = reduceTabou(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: state.phaseEndsAt ?? NOW })

    const html = render(bilan, 'p0')

    expect(html).not.toContain(game('fr').victory.stopped)
    expect(html).not.toContain(game('fr').roundEnd.seeResult)
  })
})

describe('TabouOnline : manche écourtée', () => {
  it('dit pourquoi la manche ne dure que quelques secondes, dans les 4 langues, sans clé manquante', () => {
    const state = p1AloneInTeam()
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(state, 'p1', locale, errors)
      expect(errors, locale).toEqual([])
      expect(html, locale).toContain(shortRound(locale))
    }
  })

  it('le dit à toute la table, adversaires compris', () => {
    const state = p1AloneInTeam()

    for (const viewer of ['p0', 'p2']) expect(render(state, viewer), viewer).toContain(shortRound('fr'))
  })

  it('une manche jouable n’affiche pas ce bandeau', () => {
    const state = firstRound()

    for (const viewer of ['p0', 'p1', 'p2']) expect(render(state, viewer), viewer).not.toContain(shortRound('fr'))
  })

  it('partie d’avant le correctif, manche pleine en cours : pas de bandeau à 55 s de la fin', () => {
    const full = firstRound()
    // État tel que l'ancien moteur le laissait : coéquipier parti, 60 s qui
    // courent, aucune durée mémorisée.
    const { roundMs: _roundMs, ...legacy } = {
      ...full,
      phaseEndsAt: Date.now() + 55_000,
      players: full.players.map((p) => (p.id === 'p2' ? { ...p, leftAt: NOW + 1_000 } : p)),
    }
    void _roundMs

    for (const viewer of ['p0', 'p1']) expect(render(legacy, viewer), viewer).not.toContain(shortRound('fr'))
  })

  it('personne ne décrit : le bouton « trouvé » du coéquipier est désactivé', () => {
    const found = (catalogue('fr') as { games: { tabou: { game: { foundButton: string } } } }).games.tabou.game
      .foundButton
    const button = (html: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${found}`, 's'))?.[0]
    // p1, décrivant du créneau, est parti : p3 est là mais n'a rien à deviner.
    let away = reduceTabou(firstRound(), { type: 'LEAVE', playerId: 'p1', at: NOW + 1_000 })
    away = reduceTabou(away, { type: 'ADVANCE', claimedKey: phaseKey(away), now: NOW + TABOU_ROUND_MS })
    away = reduceTabou(away, { type: 'CONTINUE', playerId: 'p0', now: NOW + TABOU_ROUND_MS + 1_000 })

    expect(button(render(away, 'p3'))).toMatch(/\sdisabled(=""|\s|>)/)
    expect(button(render(firstRound(), 'p2'))).not.toMatch(/\sdisabled(=""|\s|>)/)
  })

  it('le bilan qui suit n’affiche pas ce bandeau', () => {
    const state = p1AloneInTeam()
    const bilan = reduceTabou(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: state.phaseEndsAt ?? NOW })

    expect(bilan.phase).toBe('roundEnd')
    expect(render(bilan, 'p1')).not.toContain(shortRound('fr'))
  })
})
