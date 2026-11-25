'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { stripLocalePrefix } from '@/i18n/routing'
import { useLocalizedGames } from '@/lib/games-i18n'
import { useAuth } from '@/hooks/useAuth'

export type PageMeta = {
  title: string
  subtitle: string
}

type StaticPageKey =
  | 'joueurs'
  | 'jeux'
  | 'classement'
  | 'compte'
  | 'supervision'
  | 'achievements'
  | 'stats'
  | 'application'
  | 'regles'
  | 'idees'
  | 'soiree'
  | 'decouvrir'

const STATIC_PAGE_KEYS: Record<string, StaticPageKey> = {
  // L'accueil (Mode Soirée ou Jeu libre) porte la devise de la maison, comme /decouvrir.
  '/': 'decouvrir',
  '/joueurs': 'joueurs',
  '/jeux': 'jeux',
  '/classement': 'classement',
  '/compte': 'compte',
  '/supervision': 'supervision',
  '/achievements': 'achievements',
  '/stats': 'stats',
  '/application': 'application',
  '/regles': 'regles',
  '/idees': 'idees',
  '/soiree': 'soiree',
  '/decouvrir': 'decouvrir',
}

/**
 * Sections dont les sous-pages gardent le titre de la section : un article
 * /regles/<id> appartient à l'index des règles (sans ça, le header affichait
 * le titre de marque et « Jeux à boire entre amis », y compris sur la
 * collection « sans alcool »).
 */
const SECTION_PREFIXES: ReadonlyArray<readonly [prefix: string, key: StaticPageKey]> = [
  ['/regles/', 'regles'],
  ['/idees/', 'idees'],
  ['/jeux/', 'jeux'],
  ['/soiree/', 'soiree'],
]

/** La page fixe dont la navbar reprend titre et sous-titre, pour un chemin sans langue. */
export function staticPageKey(path: string): StaticPageKey | undefined {
  return STATIC_PAGE_KEYS[path] ?? SECTION_PREFIXES.find(([prefix]) => path.startsWith(prefix))?.[1]
}

/**
 * Sous-titre de la navbar sur la page d'un jeu : OÙ il se joue, pas son état.
 * « Partie en cours » s'affichait dès la vitrine et le pré-lobby, avant toute
 * partie — et la navbar ne peut pas savoir si une partie est montée (chaque
 * page de jeu tient cet état pour elle). Le mode, lui, est toujours vrai :
 * un jeu en ligne seulement, ou un jeu ouvert en mode en ligne alors qu'il a
 * sa salle, se joue « un téléphone chacun » ; tout le reste sur un seul.
 */
export function gameSubtitleKey(
  game: { onlineOnly?: boolean; onlineReady?: boolean },
  playMode: 'local' | 'online' | undefined
): 'game.online' | 'game.local' {
  const online = Boolean(game.onlineOnly) || (playMode === 'online' && Boolean(game.onlineReady))
  return online ? 'game.online' : 'game.local'
}

/** Resolve page title/subtitle for the navbar from a pathname (with or without locale prefix). */
export function usePageMeta(pathname: string): PageMeta {
  const t = useTranslations('nav')
  const tPages = useTranslations('nav.pages')
  const games = useLocalizedGames()
  const { user } = useAuth()

  return useMemo(() => {
    const path = stripLocalePrefix(pathname)
    const pageKey = staticPageKey(path)

    if (pageKey) {
      // « Connexion et profil » n'a de sens que déconnecté.
      const subtitleKey =
        pageKey === 'compte' && user ? 'compte.subtitleConnected' : `${pageKey}.subtitle`
      return {
        title: tPages(`${pageKey}.title`),
        subtitle: tPages(subtitleKey),
      }
    }

    const game = games.find((g) => path === g.path || path.startsWith(`${g.path}/`))
    if (game) {
      return {
        title: game.title,
        subtitle: tPages(gameSubtitleKey(game, user?.playMode)),
      }
    }

    return {
      title: t('brand'),
      subtitle: tPages('default.subtitle'),
    }
  }, [pathname, games, t, tPages, user])
}
