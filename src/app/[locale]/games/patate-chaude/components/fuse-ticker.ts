"use client"

import { useEffect, useRef } from 'react'
import { pcTickIntervalMs } from '@/lib/patate-chaude/tick'

/**
 * Tic-tac de la mèche pour l'écran en ligne et la TV, qui ne connaissent que l'allumage public
 * (`roundStartedAt`, horloge serveur) et la borne HAUTE de la plage : le rythme accélère avec le
 * temps écoulé, sans jamais trahir l'échéance. Mis en pause onglet caché (iOS gèle les minuteurs),
 * repris au retour.
 */
export function useFuseTicker(options: {
  active: boolean
  roundStartedAt: number | null
  maxFuseMs: number
  onTick: () => void
}) {
  const { active, roundStartedAt, maxFuseMs, onTick } = options
  // Le minuteur appelle toujours le DERNIER geste reçu, sans se réarmer à chaque rendu.
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  useEffect(() => {
    if (!active || roundStartedAt === null) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      const elapsed = Math.max(0, Date.now() - roundStartedAt)
      timer = setTimeout(() => {
        if (document.hidden) return
        onTickRef.current()
        schedule()
      }, pcTickIntervalMs(elapsed, maxFuseMs))
    }
    const onVisibility = () => {
      if (document.hidden) clearTimeout(timer)
      else schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, roundStartedAt, maxFuseMs])
}
