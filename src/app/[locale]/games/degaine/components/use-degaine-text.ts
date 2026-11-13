import { useMemo } from 'react'
import { useTranslations, type TranslationValues } from 'next-intl'
import type { AmbianceMode } from '@/lib/ambiance-mode'

export type DegaineText = (key: string, values?: TranslationValues) => string

/** Textes du jeu ; sans alcool, chaque clé tente d'abord sa variante `soft.<clé>`. */
export function useDegaineText(ambiance: AmbianceMode): DegaineText {
  const t = useTranslations('games.degaine')
  return useMemo(() => {
    const soft = ambiance === 'soft'
    return (key: string, values?: TranslationValues) => t(soft && t.has(`soft.${key}`) ? `soft.${key}` : key, values)
  }, [t, ambiance])
}
