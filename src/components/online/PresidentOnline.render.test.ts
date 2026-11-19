import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { createPreState, reducePre, toPreClientView, type PreState } from '@/lib/president/engine'
import { PresidentOnline } from './PresidentOnline'

/**
 * L'écran téléphone du Président rendu côté serveur, hooks de salle simulés,
 * avec le VRAI catalogue des 4 langues. Ce qu'on vérifie : un joueur que la
 * donne n'a pas servi (parti au compte à rebours, revenu pendant la manche)
 * lit pourquoi il n'a ni main ni barre — et lui seul.
 */

const room = vi.hoisted(() => ({ current: null as unknown, viewerId: 'p5' }))

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
vi.mock('@/components/online/OnlineEndScreen', () => ({ OnlineEndScreen: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'))
/** Début du bandeau (avant la variante « dernière manche »), commun aux deux cas. */
const sittingOut = (locale: string): string =>
  (catalogue(locale) as { games: { president: { game: { sittingOut: string } } } }).games.president.game.sittingOut
    .split('{last')[0]
    .trim()

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const NOW = Date.now()
const PLAYERS = Array.from({ length: 5 }, (_, i) => ({ id: `p${i + 1}`, name: `Joueur ${i + 1}` }))

/** p5 quitte pendant le compte à rebours, la manche est donnée aux quatre autres, il revient. */
function p5BackAfterTheDeal(manches = 2): PreState {
  let s = createPreState(PLAYERS, 'seed-render', NOW, manches)
  s = reducePre(s, { type: 'LEAVE', playerId: 'p5', at: NOW + 1_000 })
  s = reducePre(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: NOW + 5_000 })
  return reducePre(s, { type: 'REJOIN', playerId: 'p5' })
}

function render(state: PreState, viewerId: string, locale: string = 'fr', errors: unknown[] = []): string {
  room.viewerId = viewerId
  room.current = {
    id: 'r',
    gameId: 'president',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: state.currentTurnId,
    gameStateJson: JSON.stringify(toPreClientView(state, viewerId)),
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
      createElement(PresidentOnline)
    )
  )
}

describe('PresidentOnline : joueur revenu après la donne', () => {
  it('lit qu’il reprend à la prochaine donne, dans les 4 langues, sans clé manquante', () => {
    const state = p5BackAfterTheDeal()
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(state, 'p5', locale, errors)
      expect(errors, locale).toEqual([])
      expect(html, locale).toContain(sittingOut(locale))
    }
  })

  it('n’annonce une prochaine donne que s’il en reste une', () => {
    const more = render(p5BackAfterTheDeal(2), 'p5')
    const last = render(p5BackAfterTheDeal(1), 'p5')

    expect(more).toContain('tu reprends à la prochaine donne')
    expect(last).not.toContain('prochaine donne')
    expect(last).toContain('sans y être classé')
  })

  it('les joueurs servis ne voient pas ce bandeau', () => {
    const html = render(p5BackAfterTheDeal(), 'p1')

    expect(html).not.toContain(sittingOut('fr'))
  })

  it('un joueur sorti (main vidée) garde son message de sortie, pas ce bandeau', () => {
    const state = p5BackAfterTheDeal()
    const out: PreState = {
      ...state,
      players: state.players.map((p) => (p.id === 'p1' ? { ...p, hand: [] } : p)),
      outOrder: ['p1'],
      currentTurnId: 'p2',
    }

    const html = render(out, 'p1')

    expect(html).not.toContain(sittingOut('fr'))
  })
})
