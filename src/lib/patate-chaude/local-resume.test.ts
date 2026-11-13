import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import fr from '../../../messages/fr.json'
import type { Player } from '@/lib/players'
import { parseLocalGameSave } from '@/lib/game-session'
import Game from '@/app/[locale]/games/patate-chaude/components/game'
import {
  PC_DEFAULT_SETTINGS,
  PC_SAVE_VERSION,
  createGame,
  nextRound,
  resolveIfExpired,
  startRound,
  toPcSave,
  type PcChallengeSource,
  type PcSettings,
} from './engine'

/**
 * Reprise locale vue de l'écran : après un rechargement, le pré-lobby revient aux réglages par
 * défaut. La sauvegarde d'une partie lancée avec d'autres réglages doit pourtant être PROPOSÉE,
 * puis REPRISE sans être jetée. La lecture du stockage est remplacée par une doublure qui expose
 * le prédicat passé par l'écran et son geste « Reprendre ».
 */

;(globalThis as { React?: typeof React }).React = React

type Session = {
  ready: boolean
  pending: unknown
  accept: () => unknown
  discard: () => void
  save: (state: unknown) => void
  clear: () => void
}

const harness = vi.hoisted(() => ({
  session: null as unknown,
  isResumable: undefined as ((state: unknown) => boolean) | undefined,
  onResume: null as (() => void) | null,
}))

vi.mock('@/lib/game-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/game-session')>()),
  useResumableLocalGame: (_gameId: string, _version: number, isResumable?: (state: unknown) => boolean) => {
    harness.isResumable = isResumable
    return harness.session
  },
}))
vi.mock('@/components/game/ResumeGamePrompt', () => ({
  ResumeGamePrompt: (props: { onResume: () => void }) => {
    harness.onResume = props.onResume
    return null
  },
}))
vi.mock('@/components/game/ConfirmActionDialog', () => ({ useConfirmAction: () => [null, async () => false] }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/', useRouter: () => ({ push: () => {} }) }))
// Le dessin de la bombe (styled-jsx) n'a rien à vérifier ici.
vi.mock('@/app/[locale]/games/patate-chaude/components/bomb', async () => {
  const react = await import('react')
  return {
    BombArt: react.forwardRef(function BombArt() {
      return null
    }),
    BoomBurst: () => null,
  }
})

const T0 = 1_700_000_000_000
const TABLE = ['alice', 'bob', 'chloe']
const SOURCE: PcChallengeSource = {
  themes: [{ id: 'fruits', text: 'Un fruit' }],
  letters: ['B'],
  syllables: ['TRA'],
}
/** Réglages de la partie sauvegardée, loin des défauts du pré-lobby. */
const OWN: PcSettings = { challenge: 'letter', fuse: 'short', rounds: 5 }

const playersOf = (ids: readonly string[]) => ids.map((id) => ({ id, name: id })) as unknown as Player[]

/** Une manche jouée, puis la sauvegarde telle que la relit la page rechargée. */
function savedGame(playerIds: readonly string[] = TABLE): unknown {
  const created = createGame({ playerIds, settings: OWN, seed: 'soirée' })
  if (!created.ok) throw new Error(created.error)
  const lit = startRound(created.state, T0, SOURCE)
  if (!lit.ok) throw new Error(lit.error)
  const next = nextRound(resolveIfExpired(lit.state, lit.state.explodeAt ?? T0))
  if (!next.ok) throw new Error(next.error)
  const raw = JSON.stringify({ version: PC_SAVE_VERSION, savedAt: T0, state: toPcSave(next.state) })
  return parseLocalGameSave<unknown>(raw, PC_SAVE_VERSION, T0 + 1_000)
}

/** Oublie ce que le rendu précédent a exposé. */
function forgetCaptures(): void {
  harness.isResumable = undefined
  harness.onResume = null
}

function session(overrides: Partial<Session> = {}): Session {
  return { ready: false, pending: null, accept: () => null, discard: vi.fn(), save: vi.fn(), clear: vi.fn(), ...overrides }
}

/** L'écran tel que le monte la page rechargée : pré-lobby aux réglages par défaut. */
function renderGame(): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      {
        locale: 'fr',
        messages: fr as unknown as AbstractIntlMessages,
        timeZone: 'Europe/Paris',
        onError: () => undefined,
      } as unknown as ComponentProps<typeof NextIntlClientProvider>,
      createElement(Game, {
        players: playersOf(TABLE),
        settings: PC_DEFAULT_SETTINGS,
        ambiance: 'alcool',
        bank: SOURCE,
        onGameEnd: () => undefined,
        updatePlayerStats: () => undefined,
      })
    )
  )
}

describe('Patate Chaude locale — reprise après rechargement', () => {
  it('la partie aux réglages hors défaut est proposée, même pré-lobby revenu aux défauts', () => {
    forgetCaptures()
    harness.session = session()
    renderGame()
    expect(harness.isResumable).toBeTypeOf('function')
    expect(harness.isResumable?.(savedGame())).toBe(true)
  })

  it('la partie d’une autre table, ou illisible, ne l’est pas', () => {
    forgetCaptures()
    harness.session = session()
    renderGame()
    expect(harness.isResumable?.(savedGame(['alice', 'bob', 'dan']))).toBe(false)
    expect(harness.isResumable?.({ phase: 'ready' })).toBe(false)
  })

  it('« Reprendre » reprend la partie sans jeter la sauvegarde', () => {
    const save = savedGame()
    const accept = vi.fn(() => save)
    const discard = vi.fn()
    forgetCaptures()
    harness.session = session({ ready: true, pending: save, accept, discard })
    renderGame()
    expect(harness.onResume).toBeTypeOf('function')
    harness.onResume?.()
    expect(accept).toHaveBeenCalledTimes(1)
    expect(discard).not.toHaveBeenCalled()
  })
})
