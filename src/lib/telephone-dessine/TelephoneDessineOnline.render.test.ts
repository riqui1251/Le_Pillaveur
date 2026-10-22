import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import {
  createTelephoneState,
  currentTelephoneActorId,
  reduceTelephone,
  toTelephoneClientView,
  TELEPHONE_COUNTDOWN_MS,
  type TelephoneState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { TelephoneDessineOnline } from '@/components/online/TelephoneDessineOnline'

/**
 * L'écran téléphone du Téléphone dessiné rendu côté serveur, hooks de salle
 * simulés : manche de dessin (envoi dans la barre du bas, jamais une feuille
 * blanche), puis révélation maillon par maillon pilotée par le meneur.
 */

const room = vi.hoisted(() => ({ current: null as unknown }))
const viewer = vi.hoisted(() => ({ id: 'p0' }))

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
  { id: 'p0', name: 'Riqui' },
  { id: 'p1', name: 'Léa' },
  { id: 'p2', name: 'Marco' },
]
const STARTS: Record<string, string> = { p0: 'Un chat qui fait du ski', p1: 'Mon oncle au mariage', p2: 'Pirate en croisière' }
const GUESSES: Record<string, string> = { p0: 'Chute de Riqui', p1: 'Chute de Léa', p2: 'Chute de Marco' }
const STROKE = { points: [0.1, 0.1, 0.9, 0.9], color: '#24201A', width: 6 }

function drawRound(): TelephoneState {
  const raw = createTelephoneState(PLAYERS, 'seed', T0 - TELEPHONE_COUNTDOWN_MS)
  let s = reduceTelephone(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  for (const p of PLAYERS) s = reduceTelephone(s, { type: 'WRITE', playerId: p.id, text: STARTS[p.id], now: T0 })
  return s
}

function revealStart(): TelephoneState {
  let s = drawRound()
  for (const p of PLAYERS) s = reduceTelephone(s, { type: 'SUBMIT', playerId: p.id, strokes: [STROKE], now: T0 })
  for (const p of PLAYERS) s = reduceTelephone(s, { type: 'WRITE', playerId: p.id, text: GUESSES[p.id], now: T0 })
  return s
}

const next = (s: TelephoneState) => reduceTelephone(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })

function render(state: TelephoneState, viewerId: string): string {
  viewer.id = viewerId
  room.current = {
    id: 'r',
    gameId: 'telephone-dessine',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: currentTelephoneActorId(state),
    members: [],
    gameStateJson: JSON.stringify(toTelephoneClientView(state, viewerId)),
  }
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale: 'fr', messages, timeZone: 'Europe/Paris', onError: () => {} },
      createElement(TelephoneDessineOnline)
    )
  )
}

/** Balise ouvrante du bouton qui porte ce libellé (ou null). */
function buttonTag(html: string, label: RegExp): string | null {
  for (const match of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) {
    if (label.test(match[1])) return match[0].slice(0, match[0].indexOf('>') + 1)
  }
  return null
}

// Clés ajoutées par ce lot : tant que le catalogue ne les a pas, next-intl
// rend leur chemin — les deux formes sont acceptées.
const NEXT_LINK = /Dévoiler la suite|reveal\.nextLink/

describe('TelephoneDessineOnline — manche de dessin', () => {
  it('montre la phrase reçue et garde « Valider le dessin » éteint sur une feuille blanche', () => {
    const s = drawRound()
    expect(s.round).toBe(1)
    const html = render(s, 'p0')
    // p0 dessine la chaîne de p2 (rotation fixe).
    expect(html).toContain(STARTS.p2)
    expect(html).not.toContain(STARTS.p1)
    const submit = buttonTag(html, /Valider le dessin/)
    expect(submit).not.toBeNull()
    expect(submit).toMatch(/\bdisabled\b/)
    expect(html).toContain('<canvas')
  })

  it('reste dans le thème : ni texte blanc ni fond gris codé en dur', () => {
    const html = render(drawRound(), 'p1')
    expect(html).not.toMatch(/text-white|bg-gray-950/)
    expect(html).not.toMatch(/\b(?:text|bg|border)-[a-z]+(?:-\d+)?\/(?:15|35|45|55|65|85)\b/)
  })
})

describe('TelephoneDessineOnline — révélation maillon par maillon', () => {
  it("n'affiche que le premier maillon, et seul le meneur a le bouton dans la barre", () => {
    const s = revealStart()
    expect(currentTelephoneActorId(s)).toBe('p0')
    const owner = s.revealOrder[0]
    const leader = render(s, 'p0')
    expect(leader).toContain(STARTS[owner])
    expect(leader).toContain('Maillon 1')
    expect(leader).not.toContain('Maillon 2')
    for (const guess of Object.values(GUESSES)) expect(leader).not.toContain(guess)
    expect(buttonTag(leader, NEXT_LINK)).not.toBeNull()

    const other = render(s, 'p1')
    expect(other).toContain(STARTS[owner])
    expect(buttonTag(other, NEXT_LINK)).toBeNull()
    expect(other).toMatch(/Riqui (dévoile la suite|fait défiler)/)
  })

  it('dévoile la suite à chaque cran, puis propose la chaîne suivante et enfin la fin', () => {
    let s = next(revealStart())
    let html = render(s, 'p0')
    expect(html).toContain('Maillon 2')
    expect(html).not.toContain('Maillon 3')
    // Le dessin qui arrive n'est peint qu'une fois la carte retournée à plat :
    // une toile mesurée en pleine rotation restait floue.
    expect(html).not.toContain('<canvas')
    expect(html).toContain('aspect-[4/3]')

    s = next(s)
    html = render(s, 'p0')
    const owner = s.revealOrder[0]
    expect(html).toContain(GUESSES[s.players[(s.players.findIndex((p) => p.id === owner) + 2) % 3].id])
    expect(buttonTag(html, /Chaîne suivante/)).not.toBeNull()
    expect(buttonTag(html, NEXT_LINK)).toBeNull()

    for (let i = 0; i < 6; i += 1) s = next(s)
    expect([s.revealIdx, s.revealLinkIdx]).toEqual([2, 2])
    html = render(s, 'p0')
    expect(buttonTag(html, /Voir la fin/)).not.toBeNull()
    // Retour possible à la chaîne précédente, en icône nommée.
    expect(html).toMatch(/<button[^>]*aria-label="Chaîne précédente"/)
  })
})
