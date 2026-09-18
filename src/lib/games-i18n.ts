'use client'

import { useTranslations } from 'next-intl'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { GAMES, type GameMeta } from '@/lib/games'

export type LocalizedGameMeta = GameMeta & {
  title: string
  description: string
}

export function useLocalizedGames(): LocalizedGameMeta[] {
  const t = useTranslations('games.catalog')
  // Le mode d'ambiance, pas le mode de jeu : une table locale qui joue sans
  // alcool doit lire les mêmes titres adoucis qu'une table en ligne, avec ou
  // sans compte (useAmbianceMode retombe sur le réglage de l'appareil).
  const { mode } = useAmbianceMode()
  const isSoft = mode === 'soft'

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
