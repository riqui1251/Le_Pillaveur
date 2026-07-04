"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TvRoomDto } from '@/lib/online-room'
import type { CastFrame } from '@/lib/cast-types'

/**
 * Abonnement LECTURE SEULE d'un écran TV à une salle, par CODE. Calqué sur le
 * chemin lecture de `useOnlineRoom` mais sans aucune action : fetch de l'état
 * public + SSE temps réel (`/api/tv/[code]/stream`) + polling de secours.
 */
const POLL_MS = 1500

export function useTvRoom(code: string) {
  const [room, setRoom] = useState<TvRoomDto | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Dernière trame reçue (cast d'un jeu local) — billes Plinko / chevaux PMU.
  const [frame, setFrame] = useState<CastFrame | null>(null)

  const inFlightRef = useRef(false)
  const lastSigRef = useRef('')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchState = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch(`/api/tv/${encodeURIComponent(code)}/state`, { cache: 'no-store' })
      if (res.status === 404 || res.status === 400) {
        setNotFound(true)
        setRoom(null)
        return
      }
      if (!res.ok) {
        setError('load-error')
        return
      }
      const data = (await res.json()) as { room?: TvRoomDto }
      const next = data.room ?? null
      setNotFound(false)
      setError(null)
      // Dédup : ne re-render que si quelque chose a réellement changé.
      const sig = next ? JSON.stringify(next) : ''
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig
        setRoom(next)
      }
    } catch {
      setError('network')
    } finally {
      inFlightRef.current = false
    }
  }, [code])

  // Polling de secours (le SSE assure la réactivité immédiate).
  useEffect(() => {
    let stopped = false
    const tick = async () => {
      if (stopped) return
      await fetchState()
      if (!stopped) pollRef.current = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      stopped = true
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [fetchState])

  // Temps réel : SSE pousse les changements → on rafraîchit l'état.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
    const es = new EventSource(`/api/tv/${encodeURIComponent(code)}/stream`)
    const onEvent = () => {
      void fetchState()
    }
    const onFrame = (e: MessageEvent) => {
      try {
        setFrame(JSON.parse(e.data) as CastFrame)
      } catch {
        /* trame illisible ignorée */
      }
    }
    es.addEventListener('changed', onEvent)
    es.addEventListener('lobby', onEvent)
    es.addEventListener('finished', onEvent)
    es.addEventListener('castframe', onFrame as EventListener)
    return () => {
      es.close()
    }
  }, [code, fetchState])

  return { room, notFound, error, frame }
}
