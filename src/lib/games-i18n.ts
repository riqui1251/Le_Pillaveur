'use client'

import { useTranslations } from 'next-intl'
import { useAuth } from '@/components/providers/AuthProvider'
import { GAMES, type GameMeta } from '@/lib/games'

export type LocalizedGameMeta = GameMeta & {
  title: string
  description: string
}

export function useLocalizedGames(): LocalizedGameMeta[] {
  const t = useTranslations('games.catalog')
  const { user } = useAuth()
  const isSoft = user?.playMode === 'online' && user?.ambianceMode === 'soft'

  return GAMES.map((game) => {
    const softTitleKey = `${game.id}.softTitle`
    const softDescriptionKey = `${game.id}.softDescription`
    return {
      ...game,
      title: isSoft && t.has(softTitleKey) ? t(softTitleKey) : t(`${game.id}.title`),
      description: isSoft && t.has(softDescriptionKey) ? t(softDescriptionKey) : t(`${game.id}.description`),
    }
  })
}

export function useLocalizedGame(id: string): LocalizedGameMeta | undefined {
  const games = useLocalizedGames()
  return games.find((g) => g.id === id)
}
