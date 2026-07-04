"use client"

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Diffusion d'un jeu LOCAL vers une TV. Crée une salle de cast, y pousse l'état
 * d'affichage (throttlé — le dernier état est toujours envoyé), et la ferme à
 * l'arrêt / au démontage. La TV lit par `/api/tv/[code]`.
 */
const PUSH_INTERVAL_MS = 300

export function useCastRoom(gameId: string) {
  const [code, setCode] = useState<string | null>(null)
  const codeRef = useRef<string | null>(null)
  const lastPushRef = useRef(0)
  const pendingRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = useCallback(
    async (initialState?: string) => {
      const res = await fetch('/api/tv/cast', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, state: initialState }),
      }).catch(() => null)
      if (!res || !res.ok) return null
      const data = (await res.json().catch(() => ({}))) as { code?: string }
      if (!data.code) return null
      codeRef.current = data.code
      setCode(data.code)
      return data.code
    },
    [gameId],
  )

  const doPush = useCallback((state: string) => {
    const c = codeRef.current
    if (!c) return
    lastPushRef.current = Date.now()
    void fetch(`/api/tv/cast/${c}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    }).catch(() => {})
  }, [])

  /** Envoie l'état (throttlé) — coalesce : au plus 1 requête / PUSH_INTERVAL_MS, dernier état garanti. */
  const push = useCallback(
    (state: string) => {
      if (!codeRef.current) return
      pendingRef.current = state
      const since = Date.now() - lastPushRef.current
      if (since >= PUSH_INTERVAL_MS) {
        doPush(state)
        pendingRef.current = null
      } else if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          if (pendingRef.current != null) {
            doPush(pendingRef.current)
            pendingRef.current = null
          }
        }, PUSH_INTERVAL_MS - since)
      }
    },
    [doPush],
  )

  const stop = useCallback(async () => {
    const c = codeRef.current
    codeRef.current = null
    setCode(null)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (c) await fetch(`/api/tv/cast/${c}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
  }, [])

  // Fermeture best-effort si l'utilisateur quitte l'écran sans stopper.
  useEffect(() => {
    return () => {
      const c = codeRef.current
      if (c) {
        void fetch(`/api/tv/cast/${c}`, { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => {})
      }
    }
  }, [])

  return { code, active: code != null, start, push, stop }
}
