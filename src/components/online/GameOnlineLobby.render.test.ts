import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { GameOnlineLobby } from './GameOnlineLobby'

/**
 * Le guichet d'un jeu en ligne (pas encore assis) rendu côté serveur, hooks
 * de salle simulés : son titre est celui du catalogue TRADUIT — « The Big
 * Bluff » pour un joueur anglophone, et le titre adouci en ambiance Sans
 * alcool —, plus le titre français codé en dur dans GAMES.
 */

const env = vi.hoisted(() => ({ ambiance: 'alcool' as 'alcool' | 'soft' }))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1', playMode: 'online', onlinePreferences: null } }),
}))
vi.mock('@/components/providers/AmbianceAttribute', () => ({
  useAmbianceMode: () => ({ mode: env.ambiance, setMode: () => {} }),
}))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({
    room: null,
    loading: false,
    error: null,
    connection: 'online',
    setError: () => {},
    joinRoom: async () => null,
    createRoom: async () => null,
  }),
}))
vi.mock('@/hooks/useOpenLobbies', () => ({
  useOpenLobbies: () => ({ lobbies: [], liveGames: [], liveGamesTotal: 0 }),
}))
vi.mock('@/hooks/useFriends', () => ({
  useFriends: () => ({ friends: [], incoming: [], outgoing: [], sendRequestToUser: async () => {}, acceptRequest: async () => {} }),
}))
vi.mock('@/hooks/useOnlineProgression', () => ({ useOnlineProgression: () => ({ progression: null }) }))
vi.mock('@/hooks/useSaveOnlinePreferences', () => ({ useSaveOnlinePreferences: () => ({ save: async () => {} }) }))
vi.mock('@/i18n/navigation', () => ({
  Link: () => null,
  usePathname: () => '/games/bluff',
  useRouter: () => ({ push: () => {}, replace: () => {} }),
}))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@/components/online/ConnectionBanner', () => ({ ConnectionBanner: () => null }))
vi.mock('@/components/online/RejoinBanner', () => ({ RejoinBanner: () => null }))
vi.mock('@/components/online/FriendInviteBanner', () => ({ FriendInviteBanner: () => null }))
vi.mock('@/components/online/GameBriefing', () => ({ GameBriefing: () => null }))
vi.mock('@/components/voice/VoiceDockButton', () => ({ VoiceDockButton: () => null }))
vi.mock('@/components/tv/JoinQR', () => ({ JoinQR: () => null }))

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

function messagesOf(locale: string): AbstractIntlMessages {
  return JSON.parse(
    readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8')
  ) as AbstractIntlMessages
}

function heading(locale: string, gameId: string): string {
  const html = renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: messagesOf(locale), timeZone: 'Europe/Paris', onError: () => {} },
      createElement(GameOnlineLobby, { gameId })
    )
  )
  const match = html.match(/<h1[^>]*>(.*?)<\/h1>/)
  if (!match) throw new Error('titre du guichet introuvable')
  return match[1]
}

describe('GameOnlineLobby — titre du guichet', () => {
  it('traduit pour un joueur anglophone', () => {
    env.ambiance = 'alcool'
    expect(heading('en', 'bluff')).toBe('The Big Bluff')
  })

  it('reste le titre français en français', () => {
    env.ambiance = 'alcool'
    expect(heading('fr', 'bluff')).toBe('Le Grand Bluff')
  })

  it('prend le titre adouci en ambiance Sans alcool', () => {
    env.ambiance = 'soft'
    expect(heading('fr', 'quiz')).toBe('Quiz Party')
    env.ambiance = 'alcool'
  })
})
