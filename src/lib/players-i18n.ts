'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import {
  PLAYER_EFFECTS,
  PLAYER_FRAMES,
} from '@/lib/players'

export function usePlayerEffectLabels() {
  const t = useTranslations('players.effects')

  return useMemo(
    () =>
      PLAYER_EFFECTS.map((effect) => ({
        id: effect.id,
        label: effect.id === null ? t('classic') : t(effect.id),
      })),
    [t]
  )
}

export function usePlayerFrameLabels() {
  const t = useTranslations('players.frames')

  return useMemo(
    () =>
      PLAYER_FRAMES.map((frame) => ({
        id: frame.id,
        label: frame.id === null ? t('none') : t(frame.id),
      })),
    [t]
  )
}