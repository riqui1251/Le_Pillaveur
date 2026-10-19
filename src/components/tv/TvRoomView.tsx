"use client"

import { useEffect, useRef } from 'react'
import { useTvRoom } from '@/hooks/useTvRoom'
import { TvRoomScreen } from './TvRoomScreen'

/** Orchestrateur TV : lit la salle par code et affiche l'écran adapté (lobby / jeu / victoire). */
export function TvRoomView({ code }: { code: string }) {
  const normalized = code.toUpperCase()
  const { room, notFound, frame } = useTvRoom(normalized)
  const countedRef = useRef(false)

  /**
   * Mesure d'usage du mode TV : un simple « une TV de plus s'est allumée
   * aujourd'hui », sans identifiant ni code de table (voir
   * /api/tv/opened). Une seule fois par écran ouvert — le garde-fou couvre le
   * double montage du mode strict en développement.
   */
  useEffect(() => {
    if (countedRef.current) return
    countedRef.current = true
    void fetch('/api/tv/opened', { method: 'POST' }).catch(() => {})
  }, [])

  return <TvRoomScreen code={normalized} room={room} notFound={notFound} frame={frame} />
}
