"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'
import type { VdnTag } from '@/lib/vue-de-nez/engine'
import { createVdnNumberFormats, type VdnNumberFormats } from '@/lib/vue-de-nez/format'

/**
 * UI d'À Vue de Nez partagée par le jeu local (./game) et la version en ligne
 * (@/components/online/VueDeNezOnline, qui l'importe — jamais l'inverse : le
 * jeu local doit tourner hors ligne).
 */

/** Or pour qui distribue (ou marque), rouge pour qui boit (ou perd un point). */
export const TAG_TONE: Record<VdnTag, 'win' | 'lose'> = { bullseye: 'win', closest: 'win', farthest: 'lose' }

export function useNumberFormats(locale: string): VdnNumberFormats {
  return useMemo(() => createVdnNumberFormats(locale), [locale])
}

/** Révélation terminée : toutes les estimations posées, la réponse tombée. */
export const VDN_ALL_SHOWN = Number.MAX_SAFE_INTEGER
/** Un marqueur toutes les ~0,4 s, plus vite à grande table : la pose entière tient en 4 s environ. */
const REVEAL_BUDGET_MS = 3_600
const BEAT_MIN_MS = 220
const BEAT_MAX_MS = 450
/** Le suspense avant que la réponse tombe. */
const ANSWER_DELAY_MS = 800

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Pose animée d'une révélation EN LIGNE (téléphone et TV) : les marqueurs
 * arrivent un à un puis la réponse tombe — seulement quand on a VU la
 * révélation arriver (question → révélation). Une reconnexion en pleine
 * révélation, ou `prefers-reduced-motion`, pose tout d'un coup. Rend le
 * nombre de marqueurs à montrer, VDN_ALL_SHOWN une fois la réponse tombée.
 */
export function useOnlineRevealBeat(options: {
  phaseKey: string | null
  phase: string | null
  count: number
  reduceMotion: boolean
  /** Au moment où la réponse tombe (son, vibration…), pour une révélation vue en direct. */
  onAnswer?: () => void
}): number {
  const { phaseKey, phase } = options
  const [beat, setBeat] = useState(VDN_ALL_SHOWN)
  const seenRef = useRef<string | null>(null)
  const latestRef = useRef(options)
  latestRef.current = options

  // Avant la peinture : sinon l'image « règle complète » s'affichait un instant avant la pose.
  useIsoLayoutEffect(() => {
    const previous = seenRef.current
    seenRef.current = phaseKey
    const { count, reduceMotion, onAnswer } = latestRef.current
    const arrived = phase === 'reveal' && previous !== null && previous !== phaseKey && previous.startsWith('answering#')
    if (!arrived || reduceMotion || count === 0) {
      setBeat(VDN_ALL_SHOWN)
      if (arrived) onAnswer?.()
      return
    }
    const beatMs = Math.max(BEAT_MIN_MS, Math.min(BEAT_MAX_MS, Math.round(REVEAL_BUDGET_MS / count)))
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = (next: number) => {
      timer = setTimeout(
        () => {
          if (next <= count) {
            setBeat(next)
            schedule(next + 1)
          } else {
            timer = null
            setBeat(VDN_ALL_SHOWN)
            latestRef.current.onAnswer?.()
          }
        },
        next <= count ? beatMs : ANSWER_DELAY_MS
      )
    }
    // iOS gèle les minuteurs d'un onglet caché : au retour, la règle se pose d'un coup.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && timer) {
        clearTimeout(timer)
        timer = null
        setBeat(VDN_ALL_SHOWN)
      }
    }
    setBeat(1)
    schedule(2)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (timer) clearTimeout(timer)
      setBeat(VDN_ALL_SHOWN)
    }
  }, [phaseKey, phase])

  return beat
}

export function QuestionCard({
  number,
  theme,
  text,
  compact = false,
}: {
  number: number
  theme: string
  text: string
  compact?: boolean
}) {
  return (
    <PlayingCard suit="heart" rank={String(number)} className="w-full px-6 pb-5 pt-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-suit-red">{theme}</p>
      <p
        className={cn(
          'mt-1.5 font-display font-bold text-[#24201A]',
          compact ? 'text-lg leading-snug' : 'text-xl leading-snug sm:text-2xl sm:leading-snug'
        )}
      >
        {text}
      </p>
    </PlayingCard>
  )
}
