import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { createEspionState, reduceEspion, toEspionClientView, type EspionState } from '@/lib/espion/engine'
import { getEspionLocations } from '@/lib/espion/data'
import { EspionOnline } from '../EspionOnline'

/**
 * Le téléphone de l'Espion rendu côté serveur, hooks de salle simulés :
 * l'espion accusé garde « Je devine le lieu », démasqué il devine pendant sa
 * dernière chance (les autres attendent), et « Manche suivante » reste grisé
 * jusqu'au plancher de lecture.
 */

const room = vi.hoisted(() => ({ current: null as unknown }))
const auth = vi.hoisted(() => ({ userId: 'h' }))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: auth.userId, locale: 'fr' } }),
}))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({ room: room.current, voteRematch: () => {}, leaveRoom: () => {} }),
}))
vi.mock('@/hooks/useGameAction', () => ({
  useGameAction: () => ({ busy: false, actionError: null, sendAction: async () => {} }),
}))
vi.mock('@/hooks/useBotReferee', () => ({ useBotReferee: () => {}, useAdvanceTick: () => {} }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/', useRouter: () => ({ push: () => {} }) }))
vi.mock('@/components/online/GameTutorialModal', () => ({
  useGameTutorial: () => ({ open: false }),
  GameTutorialModal: () => null,
  TutorialReopenButton: () => null,
}))
vi.mock('@/components/online/GameOnlineLobby', () => ({ GameOnlineLobby: () => null }))
vi.mock('@/components/online/OnlineEndScreen', () => ({ OnlineEndScreen: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))

type Game = {
  guessButton: string
  guessWhich: string
  guess: { pickFirst: string }
  reveal: { continue: string }
  accusation: { youAreAccused: string }
  lastChance: { spyHint: string; othersHint: string }
}
const messages = JSON.parse(
  readFileSync(new URL('../../../../messages/fr.json', import.meta.url), 'utf8')
) as AbstractIntlMessages
const game = (messages as unknown as { games: { espion: { game: Game } } }).games.espion.game

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const NAMES: Record<string, string> = { h: 'Riqui', u2: 'Léa', u3: 'Max', u4: 'Zoé' }

/** Quatre humains en discussion, `spyId` espion, à l'horloge réelle (les décomptes lisent l'heure serveur). */
function table(spyId: string, now = Date.now()): EspionState {
  const players = Object.entries(NAMES).map(([id, name]) => ({ id, name }))
  const raw = createEspionState(players, getEspionLocations('fr'), 'ecran', now - 5_000, 180_000)
  const s = reduceEspion(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now })
  return { ...s, players: s.players.map((p) => ({ ...p, role: p.id === spyId ? 'spy' : 'crew' })) }
}

function render(state: EspionState, viewerId: string): string {
  auth.userId = viewerId
  room.current = {
    id: 'r',
    gameId: 'espion',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: null,
    members: [],
    gameStateJson: JSON.stringify(toEspionClientView(state, viewerId)),
  }
  return renderToStaticMarkup(
    createElement(IntlProvider, { locale: 'fr', messages, timeZone: 'Europe/Paris' }, createElement(EspionOnline))
  )
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ')
/** La barre fixe du bas (OnlineActionBar), jusqu'à la fin du rendu. */
const barOf = (html: string) => html.slice(html.indexOf('fixed inset-x-0 bottom-0'))

describe('EspionOnline : l’espion accusé peut encore deviner', () => {
  it('accusé, l’espion a « Je devine le lieu » dans sa barre ; un équipier accusé, non', () => {
    const now = Date.now()
    const spyAccused = reduceEspion(table('h', now), { type: 'ACCUSE', playerId: 'u2', targetId: 'h', now })
    const spyBar = text(barOf(render(spyAccused, 'h')))
    expect(spyBar).toContain(game.accusation.youAreAccused)
    expect(spyBar).toContain(game.guessButton)
    const crewAccused = reduceEspion(table('u3', now), { type: 'ACCUSE', playerId: 'u2', targetId: 'h', now })
    const crewBar = text(barOf(render(crewAccused, 'h')))
    expect(crewBar).toContain(game.accusation.youAreAccused)
    expect(crewBar).not.toContain(game.guessButton)
  })

  it('démasqué : la grille de devinette sur son seul téléphone, les autres attendent sa dernière chance', () => {
    const now = Date.now()
    let s = reduceEspion(table('h', now), { type: 'ACCUSE', playerId: 'u2', targetId: 'h', now })
    for (const id of ['u3', 'u4']) s = reduceEspion(s, { type: 'SUPPORT', playerId: id, now })
    expect(s.phase).toBe('lastChance')
    const spy = text(render(s, 'h'))
    expect(spy).toContain(game.lastChance.spyHint)
    expect(spy).toContain(game.guessWhich)
    expect(spy).toContain(game.guess.pickFirst)
    const other = text(render(s, 'u3'))
    expect(other).toContain(game.lastChance.othersHint.replace('{name}', 'Riqui'))
    expect(other).not.toContain(game.guessWhich)
    expect(other).not.toContain(game.guess.pickFirst)
  })
})

describe('EspionOnline : temps de lecture de la révélation', () => {
  it('« Manche suivante » grisé, avec son décompte, jusqu’au plancher ; libre ensuite', () => {
    const fresh = table('u2')
    const justRevealed = reduceEspion(fresh, { type: 'ADVANCE', claimedKey: phaseKey(fresh), now: fresh.phaseEndsAt! })
    const locked = barOf(render({ ...justRevealed, revealAt: Date.now() }, 'h'))
    expect(locked).toMatch(/<button[^>]*disabled=""/)
    expect(text(locked)).toMatch(/Manche suivante dans \d s/)
    const readable = barOf(render({ ...justRevealed, revealAt: Date.now() - 10_000 }, 'h'))
    expect(readable).not.toMatch(/<button[^>]*disabled=""/)
    expect(text(readable)).toContain(game.reveal.continue)
    expect(text(readable)).not.toMatch(/dans \d s/)
  })
})
