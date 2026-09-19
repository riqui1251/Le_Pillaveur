"use client"

import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { resolveOnlineErrorCode, type OnlineErrorCode } from '@/lib/online-errors'
import { OnlineRoomContext } from '@/hooks/useOnlineRoom'
import type { ServerView } from '@/hooks/online-room-polling'

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
 *
 * Il prévient aussi la salle (OnlineRoomContext) qu'une action est en vol :
 * l'écho SSE de cette action n'a plus à déclencher un GET /state, puisque la
 * réponse porte déjà la vue — cf. beginGameAction/endGameAction.
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

/**
 * Vue de partie portée par la réponse d'une action, ou null si elle n'est pas
 * STRICTEMENT celle que renverrait GET /state : même chaîne `viewJson` (la
 * sérialisation `clientViewJson` de l'adaptateur, cf. game-adapters.ts) ET
 * `currentTurnUserId`. Appliquer moins que ça figerait un morceau de la salle
 * jusqu'au prochain sondage — les composants lisent `room.currentTurnUserId`
 * pour savoir qui a la main (arbitre de bot, chef de manche, tour du joueur),
 * et un tour resté sur nous après notre coup, c'est un bot qui ne joue pas.
 *
 * La route renvoie les deux depuis le lot « un POST par coup » (Petit Buveur
 * compris : son adaptateur ajoute `viewJson` à son objet `view`). Si une
 * réponse ne les portait pas — adaptateur oublié, ancienne version du serveur
 * pendant un déploiement — rien n'est appliqué et le sondage garde son rôle.
 */
export function serverViewFromActionResponse(
  roomId: string,
  data: Record<string, unknown>
): ServerView | null {
  const { stateVersion, viewJson, currentTurnUserId } = data
  if (typeof stateVersion !== 'number' || !Number.isFinite(stateVersion)) return null
  if (typeof viewJson !== 'string') return null
  if (currentTurnUserId !== null && typeof currentTurnUserId !== 'string') return null
  return { roomId, stateVersion, gameStateJson: viewJson, currentTurnUserId }
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
  /**
   * Salle partagée, lue via une ref : la valeur du contexte est un objet
   * neuf à chaque rendu du provider, et l'y accrocher en dépendance ferait
   * changer l'identité de `sendAction` à chaque mise à jour de la salle.
   * Nullable : le hook reste utilisable hors provider, il n'y a alors juste
   * personne à prévenir.
   */
  const roomApi = useContext(OnlineRoomContext)
  const roomApiRef = useRef(roomApi)
  roomApiRef.current = roomApi

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
      // La même instance de salle ouvre et clôt l'action : si le provider
      // changeait entre-temps, le compteur d'actions en vol resterait faux.
      const room = roomApiRef.current
      room?.beginGameAction()
      let view: ServerView | null = null
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
        if (res.ok) view = serverViewFromActionResponse(roomId, data)
        return { status: res.status, ok: res.ok, data }
      } catch {
        showError(t('network'))
        return { status: 0, ok: false, data: {} }
      } finally {
        // Toujours clôturer, vue ou pas : sans ça, un raté réseau laisserait
        // la salle croire à une action en vol et retarderait chaque écho SSE.
        room?.endGameAction(view)
        sendingRef.current = false
        setBusy(false)
      }
    },
    [roomId, showError, t]
  )

  return { busy, actionError, sendAction }
}
