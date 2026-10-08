'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Rappel « On remet ça ? » du vendredi, vu du client : lecture de l'accord
 * (GET /api/me/reminder), puis accord (POST) ou retrait (DELETE). Partagé par
 * la carte de fin de partie (RematchNightCard) et l'interrupteur de la page
 * Compte (FridayReminderSetting) — jamais montés ensemble, donc sans store.
 *
 * - 'loading' : lecture en cours ;
 * - 'on' / 'off' : accord donné ou non ;
 * - 'pending' : e-mail de confirmation envoyé (double opt-in), pas encore
 *   confirmé — rien ne partira avant le clic ;
 * - 'unavailable' : envoi d'e-mails non configuré sur le serveur, invité ou
 *   compte sans adresse (rien à proposer, rien à afficher) ;
 * - 'error' : lecture impossible — l'appelant n'offre alors AUCUN geste,
 *   plutôt qu'un interrupteur dans un état peut-être faux.
 */
export type FridayReminderState = 'loading' | 'on' | 'off' | 'pending' | 'unavailable' | 'error'

/** États que le serveur peut rendre. */
export type FridayReminderStatus = 'on' | 'off' | 'pending' | 'unavailable'

/** Lecture tolérante de la réponse (un serveur d'une autre version ne casse rien). Pure, testée. */
export function parseReminderStatus(json: unknown): FridayReminderStatus | null {
  const status = (json as { status?: unknown } | null)?.status
  return status === 'on' || status === 'off' || status === 'pending' || status === 'unavailable'
    ? status
    : null
}

export function useFridayReminder({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<FridayReminderState>(enabled ? 'loading' : 'unavailable')
  const [pending, setPending] = useState(false)
  // Échec du dernier geste (accord ou retrait) — distinct d'une lecture ratée.
  const [failed, setFailed] = useState(false)
  // Verrou synchrone : deux touchers dans la même image passent tous deux
  // avant le rendu qui désactive le bouton (même raison que useGuardedAction
  // de l'écran de fin) — sans lui, deux écritures.
  const lockRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setState('unavailable')
      return
    }
    let cancelled = false
    setState('loading')
    fetch('/api/me/reminder', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return
        setState(parseReminderStatus(json) ?? 'error')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  /**
   * Accord (true) ou retrait (false). Rend l'état que le serveur a confirmé
   * — 'on', ou 'pending' quand un e-mail de confirmation est parti —, null
   * sur échec.
   */
  const setReminder = useCallback(async (on: boolean): Promise<FridayReminderStatus | null> => {
    if (lockRef.current) return null
    lockRef.current = true
    setPending(true)
    setFailed(false)
    try {
      const res = await fetch('/api/me/reminder', {
        method: on ? 'POST' : 'DELETE',
        credentials: 'include',
      })
      const status = res.ok ? parseReminderStatus(await res.json().catch(() => null)) : null
      if (!status) {
        setFailed(true)
        return null
      }
      setState(status)
      return status
    } catch {
      setFailed(true)
      return null
    } finally {
      lockRef.current = false
      setPending(false)
    }
  }, [])

  return { state, pending, failed, setReminder }
}
