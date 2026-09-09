"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { resolveOnlineErrorCode, type OnlineErrorCode } from '@/lib/online-errors'

/**
 * ENVOI D'UNE INTENTION JOUEUR — AVEC RETOUR VISIBLE EN CAS DE REFUS.
 *
 * Historiquement chaque composant *Online.tsx faisait `await fetch(...)` sans
 * jamais lire la réponse : un combo illégal, un tour qui n'est pas le nôtre,
 * une expulsion pour inactivité… tout cela ne produisait AUCUN retour. Le
 * bouton se réactivait et il ne se passait rien — le joueur reclique ou croit
 * à un bug.
 *
 * Ce hook centralise l'envoi, lit le statut + le code d'erreur, et expose un
 * message court traduit (3 s). Les 409 restent MUETS : ce sont les ticks de
 * service concurrents (bot, advance, remplacement) qui perdent la course de
 * compare-and-swap — un fonctionnement normal, pas une erreur de joueur.
 */

/** Durée d'affichage du message d'erreur d'action. */
export const GAME_ACTION_ERROR_MS = 3000

export type GameActionResult = {
  /** Statut HTTP ; 0 quand l'appel réseau lui-même a échoué. */
  status: number
  ok: boolean
  /** Corps JSON de la réponse (vue de jeu, code d'erreur, `count`…). */
  data: { ok?: boolean; error?: string; count?: number } & Record<string, unknown>
}

/**
 * Code d'erreur à AFFICHER pour une réponse d'action, ou null pour rester muet.
 * - < 400 : succès, ou issue normale du jeu (GUESS_WRONG au Crobard) ;
 * - 409   : conflit de version bénin (ticks concurrents) → aucun message ;
 * - reste : code stable, ou générique traduit si le moteur n'en a pas.
 */
export function gameActionErrorCode(
  status: number,
  raw?: string | null
): OnlineErrorCode | null {
  if (status < 400) return null
  if (status === 409) return null
  return resolveOnlineErrorCode(raw) ?? 'action_failed'
}

export function useGameAction(roomId: string | null | undefined) {
  const t = useTranslations('onlineLobby.errors')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  /**
   * Verrou d'envoi en REF (et pas via `busy`) : l'état React n'est pas encore
   * à jour quand deux clics partent dans le même tick de rendu.
   */
  const sendingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Le minuteur d'effacement doit mourir avec le composant (fin de partie,
  // retour au lobby) : sinon setState sur un composant démonté.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const showError = useCallback((message: string) => {
    setActionError(message)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setActionError(null), GAME_ACTION_ERROR_MS)
  }, [])

  const sendAction = useCallback(
    async (body: Record<string, unknown>): Promise<GameActionResult | null> => {
      if (!roomId || sendingRef.current) return null
      sendingRef.current = true
      setBusy(true)
      try {
        const res = await fetch(`/api/online/rooms/${roomId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const data = ((await res.json().catch(() => ({}))) ?? {}) as GameActionResult['data']
        const code = gameActionErrorCode(res.status, data.error)
        if (code) {
          // Les codes à trou (bornes de joueurs) reçoivent leur nombre du serveur.
          showError(t(code, typeof data.count === 'number' ? { count: data.count } : undefined))
        }
        return { status: res.status, ok: res.ok, data }
      } catch {
        showError(t('network'))
        return { status: 0, ok: false, data: {} }
      } finally {
        sendingRef.current = false
        setBusy(false)
      }
    },
    [roomId, showError, t]
  )

  return { busy, actionError, sendAction }
}
