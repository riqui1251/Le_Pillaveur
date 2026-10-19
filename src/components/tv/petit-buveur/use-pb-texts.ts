"use client"

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { withAmbiance } from '@/app/[locale]/games/petit-buveur/ambiance'
import type { PetitBuveurT } from '@/app/[locale]/games/petit-buveur/case-config'
import type { PbTexts } from './online-view'

/** Textes du jeu à l'ambiance de la table : en Soft, gages au lieu de gorgées. */
export function usePbTexts(soft: boolean): PbTexts {
  const base = useTranslations('games.petit-buveur') as unknown as PetitBuveurT
  return useMemo(() => ({ t: withAmbiance(base, soft ? 'soft' : 'alcool'), base, soft }), [base, soft])
}
