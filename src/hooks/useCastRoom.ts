"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from '@/components/ui/toast'

/**
 * Diffusion d'un jeu LOCAL vers une TV. Crée une salle de cast, y pousse l'état
 * d'affichage (throttlé — le dernier état est toujours envoyé), et la ferme à
 * l'arrêt / au démontage. La TV lit par `/api/tv/[code]`.
 */
const PUSH_INTERVAL_MS = 300

/** Pourquoi la diffusion n'a pas démarré — `auth` = pas de compte (401). */
export type CastError = 'auth' | 'failed'

export function useCastRoom(gameId: string) {
  const t = useTranslations('tv')
  const { showToast } = useToast()
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<CastError | null>(null)
  const codeRef = useRef<string | null>(null)
  const lastPushRef = useRef(0)
  const pendingRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Aucun chemin muet : le bouton « TV » est proposé à TOUT LE MONDE alors que
   * `/api/tv/cast` exige un compte (401) — l'échec doit donc se voir.
   * On remonte un message traduit plutôt que de créer un compte invité à la
   * volée (`/api/auth/guest`) : cette route bascule la session en playMode
   * 'online' et efface le cookie de jeu local, ce qui changerait le mode du
   * joueur EN PLEINE PARTIE locale juste parce qu'il a cliqué sur « TV ».
   * Le toast couvre les trois jeux castables (Plinko, PMU, Petit Buveur) sans
   * dupliquer d'UI ; `error` reste exposé pour un affichage en ligne éventuel.
   */
  const fail = useCallback(
    (kind: CastError) => {
      setError(kind)
      showToast({
        message: kind === 'auth' ? t('castNeedsAccount') : t('castFailed'),
        type: 'error',
        duration: 6000,
      })
      return null
    },
    [showToast, t],
  )

  const start = useCallback(
    async (initialState?: string) => {
      setError(null)
      const res = await fetch('/api/tv/cast', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, state: initialState }),
      }).catch(() => null)
      if (!res || !res.ok) return fail(res?.status === 401 ? 'auth' : 'failed')
      const data = (await res.json().catch(() => ({}))) as { code?: string }
      if (!data.code) return fail('failed')
      codeRef.current = data.code
      setCode(data.code)
      return data.code
    },
    [gameId, fail],
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

  /** Trame de bille (canal éphémère) — le throttle est géré par l'appelant. */
  const pushFrame = useCallback((frame: string) => {
    const c = codeRef.current
    if (!c) return
    void fetch(`/api/tv/cast/${c}/frame`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: frame,
    }).catch(() => {})
  }, [])

  const stop = useCallback(async () => {
    const c = codeRef.current
    codeRef.current = null
    setCode(null)
    setError(null)
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

  return { code, active: code != null, error, start, push, pushFrame, stop }
}
