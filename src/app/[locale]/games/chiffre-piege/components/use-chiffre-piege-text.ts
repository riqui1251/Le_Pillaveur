"use client"

import { useMemo } from 'react'
import { useTranslations, type TranslationValues } from 'next-intl'
import type { AmbianceMode } from '@/lib/ambiance-mode'

export type ChiffrePiegeText = (key: string, values?: TranslationValues) => string

/**
 * Textes du jeu selon l'ambiance : en Sans alcool, `soft.<clé>` remplace la
 * clé quand elle existe (gorgées → points de pénalité), sinon la clé d'origine.
 */
export function useChiffrePiegeText(ambiance: AmbianceMode): ChiffrePiegeText {
  const t = useTranslations('games.chiffre-piege')
  return useMemo(() => {
    const soft = ambiance === 'soft'
    return (key: string, values?: TranslationValues) => t(soft && t.has(`soft.${key}`) ? `soft.${key}` : key, values)
  }, [t, ambiance])
}
