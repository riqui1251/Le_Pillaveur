'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { stripLocalePrefix } from '@/i18n/routing'
import { useLocalizedGames } from '@/lib/games-i18n'

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

const STATIC_PAGE_KEYS: Record<string, StaticPageKey> = {
  '/joueurs': 'joueurs',
  '/jeux': 'jeux',
  '/classement': 'classement',
  '/compte': 'compte',
  '/supervision': 'supervision',
  '/achievements': 'achievements',
  '/stats': 'stats',
}

/** Resolve page title/subtitle for the navbar from a pathname (with or without locale prefix). */
export function usePageMeta(pathname: string): PageMeta {
  const t = useTranslations('nav')
  const tPages = useTranslations('nav.pages')
  const games = useLocalizedGames()

  return useMemo(() => {
    const path = stripLocalePrefix(pathname)
    const pageKey = STATIC_PAGE_KEYS[path]

    if (pageKey) {
      return {
        title: tPages(`${pageKey}.title`),
        subtitle: tPages(`${pageKey}.subtitle`),
      }
    }

    const game = games.find((g) => path === g.path || path.startsWith(`${g.path}/`))
    if (game) {
      return {
        title: game.title,
        subtitle: tPages('gameInProgress.subtitle'),
      }
    }

    return {
      title: t('brand'),
      subtitle: tPages('default.subtitle'),
    }
  }, [pathname, games, t, tPages])
}
