import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { createDilState, reduceDil, toDilClientView, type DilCard, type DilState } from './engine'
import { DilemmesOnline } from '@/components/online/DilemmesOnline'

/**
 * L'écran téléphone de Dilemmes rendu côté serveur, hooks de salle simulés :
 * vote en deux temps (rien ne part d'un toucher sur la carte), et révélation
 * d'un « Qui de la table » qui nomme le plus désigné — moi compris, alors que
 * la grille de vote m'exclut.
 */

const room = vi.hoisted(() => ({ current: null as unknown }))
const viewer = vi.hoisted(() => ({ id: 'h' }))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: viewer.id, ambianceMode: 'normal' } }),
}))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({ room: room.current, voteRematch: async () => {}, leaveRoom: async () => {} }),
}))
vi.mock('@/hooks/useGameAction', () => ({
  useGameAction: () => ({ busy: false, actionError: null, sendAction: async () => ({ ok: true }) }),
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

const messages = JSON.parse(
  readFileSync(new URL('../../../messages/fr.json', import.meta.url), 'utf8')
) as AbstractIntlMessages

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const T0 = 1_000_000
const PLAYERS = [
  { id: 'h', name: 'Riqui' },
  { id: 'l', name: 'Léa' },
  { id: 'm', name: 'Marco' },
  { id: 'z', name: 'Zoé' },
]

/** Première carte ouverte au vote. */
function voteOpen(card: DilCard): DilState {
  const start = createDilState(PLAYERS, [card], 'seed', T0, 1)
  return reduceDil(start, {
    type: 'ADVANCE',
    claimedKey: toDilClientView(start, 'h').phaseKey,
    now: start.phaseEndsAt!,
  })
}

function vote(state: DilState, playerId: string, choice: string): DilState {
  return reduceDil(state, { type: 'VOTE', playerId, choice, now: T0 + 6_000 })
}

function render(state: DilState, viewerId = 'h'): string {
  viewer.id = viewerId
  room.current = {
    id: 'r',
    gameId: 'dilemmes',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: null,
    members: [],
    gameStateJson: JSON.stringify(toDilClientView(state, viewerId)),
  }
  return renderToStaticMarkup(
    createElement(IntlProvider, { locale: 'fr', messages, timeZone: 'Europe/Paris', onError: () => {} }, createElement(DilemmesOnline))
  )
}

const WHO: DilCard = { kind: 'who', text: 'finirait en garde à vue ?' }

describe('DilemmesOnline — vote en deux temps', () => {
  it('« Tu préfères » : deux cartes à bascule, bouton d’envoi éteint tant que rien n’est choisi', () => {
    const html = render(voteOpen({ kind: 'prefer', a: 'Option chat', b: 'Option chien' }))
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2)
    expect(html).toContain('role="status"')
    expect(html).not.toMatch(/\btext-white\b/)
    // Aucune opacité morte de Tailwind 3.3 sur un état.
    expect(html).not.toMatch(/\bopacity-(15|35|45|55|65|85)\b/)
  })

  it('« Qui de la table » : la grille de vote ne propose pas de se désigner soi-même', () => {
    const html = render(voteOpen(WHO))
    expect(html).toContain('Léa')
    expect(html).toContain('Marco')
    // Riqui n'apparaît que dans la rangée « qui a voté », pas comme cible.
    const start = html.indexOf('grid grid-cols-2')
    expect(start).toBeGreaterThan(-1)
    // Les cartes de la grille ne contiennent que des <span> : le premier
    // </div> ferme la grille.
    const grid = html.slice(start, html.indexOf('</div>', start))
    expect(grid).toContain('Léa')
    expect(grid).not.toContain('Riqui')
    expect(grid).not.toContain('disabled=""')
  })

  it('parti en pleine manche : la grille reste inerte (le moteur refuserait le vote)', () => {
    const state = reduceDil(voteOpen(WHO), { type: 'LEAVE', playerId: 'h', at: T0 + 6_000 })
    const html = render(state)
    const start = html.indexOf('grid grid-cols-2')
    const grid = html.slice(start, html.indexOf('</div>', start))
    expect(grid.match(/<button/g)).toHaveLength(3)
    expect(grid.match(/disabled=""/g)).toHaveLength(3)
  })
})

describe('DilemmesOnline — révélation de « Qui de la table »', () => {
  it('le plus désigné est nommé, même quand c’est moi, avec mes voix au classement', () => {
    let state = voteOpen(WHO)
    state = vote(state, 'l', 'h')
    state = vote(state, 'm', 'h')
    state = vote(state, 'z', 'l')
    state = vote(state, 'h', 'z')
    expect(state.phase).toBe('reveal')
    const html = render(state)
    const verdict = html.slice(html.indexOf('id="dil-verdict"'), html.indexOf('id="dil-ranking"'))
    expect(verdict).toContain('Riqui')
    expect(verdict).not.toContain('Léa')
    // Classement de toute la table : moi en tête, les autres derrière.
    const ranking = html.slice(html.indexOf('id="dil-ranking"'))
    const order = ['Riqui', 'Léa', 'Zoé', 'Marco'].map((n) => ranking.indexOf(n))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect(order[0]).toBeLessThan(order[1])
    expect(order[1]).toBeLessThan(order[3])
    // L'enchaînement (« Terminer » sur la dernière carte) vit dans la barre
    // fixe du pouce, plus dans le flux.
    const barAt = html.indexOf('fixed inset-x-0 bottom-0')
    expect(barAt).toBeGreaterThan(html.indexOf('id="dil-ranking"'))
    expect(html.slice(barAt)).toContain('Terminer')
    expect(html.slice(0, barAt)).not.toContain('Terminer')
  })

  it('égalité : les deux premiers sont nommés', () => {
    let state = voteOpen(WHO)
    state = vote(state, 'h', 'l')
    state = vote(state, 'l', 'm')
    state = vote(state, 'm', 'l')
    state = vote(state, 'z', 'm')
    const html = render(state)
    const verdict = html.slice(html.indexOf('id="dil-verdict"'), html.indexOf('id="dil-ranking"'))
    expect(verdict).toContain('Léa')
    expect(verdict).toContain('Marco')
    expect(verdict).not.toContain('Zoé')
  })
})

describe('DilemmesOnline — révélation d’un « Tu préfères »', () => {
  function revealed(): DilState {
    let state = voteOpen({ kind: 'prefer', a: 'Option chat', b: 'Option chien' })
    state = vote(state, 'h', 'B')
    state = vote(state, 'l', 'A')
    state = vote(state, 'm', 'A')
    state = vote(state, 'z', 'A')
    expect(state.phase).toBe('reveal')
    return state
  }

  it('des cartes posées (plus des boutons), pourcentages et votants lisibles', () => {
    const html = render(revealed())
    expect(html).not.toContain('aria-pressed')
    expect(html).toContain('75 %')
    expect(html).toContain('25 %')
    // Le camp minoritaire (B, le mien) porte sa pastille rouge carreau sur crème.
    const cardB = html.slice(html.indexOf('Option chien'))
    expect(cardB).toContain('border-suit-red')
    expect(html.slice(html.indexOf('Option chat'), html.indexOf('Option chien'))).not.toContain('border-suit-red')
  })

  it('un membre arrivé après le lancement ne voit pas « Carte suivante » (le moteur le refuserait)', () => {
    const html = render(revealed(), 'spectateur')
    expect(html).toContain('75 %')
    expect(html).not.toContain('fixed inset-x-0 bottom-0')
    expect(html).not.toContain('Terminer')
  })
})
