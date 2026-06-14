'use client'

import { useTranslations } from 'next-intl'
import { GAMES, type GameMeta } from '@/lib/games'

export type LocalizedGameMeta = GameMeta & {
  title: string
  description: string
}

export function useLocalizedGames(): LocalizedGameMeta[] {
  const t = useTranslations('games.catalog')

  return GAMES.map((game) => ({
    ...game,
    title: t(`${game.id}.title`),
    description: t(`${game.id}.description`),
  }))
}

export function useLocalizedGame(id: string): LocalizedGameMeta | undefined {
  const games = useLocalizedGames()
  return games.find((g) => g.id === id)
}
