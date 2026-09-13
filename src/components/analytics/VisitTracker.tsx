"use client"

import { useEffect, useRef } from 'react'
import { usePathname } from '@/i18n/navigation'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { usePagePresence } from '@/hooks/usePagePresence'
import {
  INTERACTION_EVENTS,
  clampToNow,
  hasRecentInteraction,
  isActive,
  isInGame,
  msUntilNextBeat,
  shouldBeat,
} from '@/lib/heartbeat'
import { sendHeartbeat, sendView, syncLocalPlayersNow } from '@/lib/visit-ping-client'

/**
 * Capture : un jeu qui arrête la propagation d'un clic ne cache pas le geste.
 * Passif : jamais de preventDefault, le défilement n'attend pas l'écouteur.
 */
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }

/**
 * Traceur de présence, monté une fois pour tout le site (providers.tsx).
 *
 * - À la première visibilité réelle : une VUE ({ view: true }), qui compte le
 *   lecteur d'une page de règles même s'il ne touche à rien — mais pas un
 *   onglet ouvert en arrière-plan (ctrl+clic, restauration de session, page
 *   préchargée) que personne n'a regardé.
 * - Ensuite : des BATTEMENTS ({ beat: true }) seulement pour une page utilisée
 *   (règles dans lib/heartbeat.ts). Avant, un ping partait toutes les 60 s sans
 *   condition, onglet caché compris : un PC resté ouvert la nuit ou un écran de
 *   jeu maintenu allumé passait pour un joueur « en ligne ».
 *
 * Un seul minuteur, aligné sur le dernier battement (et non un intervalle fixe
 * qui, décalé d'un battement déclenché par un geste, espaçait jusqu'à 120 s).
 * Il est coupé onglet caché, et aussi après 30 min sans interaction : la page
 * inutilisée ne réveille plus rien, le prochain geste relance tout.
 *
 * Seuls deux horodatages vivent en mémoire : ni contenu ni nombre de gestes,
 * rien de stocké. Chaque battement porte le drapeau et, avec le consentement
 * (lot 6, filtré par sendHeartbeat), deux booléens : « actif » (geste depuis
 * 10 min au plus) et « en partie » (lib/heartbeat.ts). Ni URL, ni jeu.
 */
export function VisitTracker() {
  const visible = usePagePresence()
  // Refs : ils survivent aux allers-retours de visibilité (le retour au premier
  // plan doit savoir si le dernier geste date de 30 min au plus).
  const lastInteractionAtRef = useRef<number | null>(null)
  const lastBeatAtRef = useRef<number | null>(null)

  // « En partie » : page de jeu ET (mode local OU salle lancée). Monté sous
  // AuthProvider et OnlineRoomProvider (providers.tsx). Lu par ref au moment du
  // battement : la salle est sondée toutes les 1,5 s en partie, et en faire une
  // dépendance relancerait le minuteur (et un battement) à chaque sondage.
  const pathname = usePathname()
  const { user } = useAuth()
  const { room } = useOnlineRoom()
  const inGame = isInGame({ pathname, playMode: user?.playMode, roomStatus: room?.status })
  const inGameRef = useRef(inGame)
  // Déclaré AVANT l'effet du minuteur : dans un même rendu, la ref est à jour
  // quand son battement immédiat part.
  useEffect(() => {
    inGameRef.current = inGame
  }, [inGame])

  useEffect(() => {
    // usePagePresence part de `true` (rendu serveur) : au montage d'un onglet
    // caché, seul le document dit la vérité. sendView est unique par document.
    if (visible && document.visibilityState === 'visible') sendView()
  }, [visible])

  useEffect(() => {
    // Onglet caché : ni écouteur ni minuteur, aucune boucle en arrière-plan.
    if (!visible) return

    let timer: number | undefined

    const isVisible = () => document.visibilityState === 'visible'

    // Réarme le minuteur pour le prochain battement dû, ou le laisse coupé si
    // la page n'est plus utilisée (ou déjà cachée, avant que l'effet ne tombe).
    function schedule() {
      window.clearTimeout(timer)
      timer = undefined
      const now = Date.now()
      if (!isVisible() || !hasRecentInteraction(lastInteractionAtRef.current, now)) return
      timer = window.setTimeout(tick, msUntilNextBeat(lastBeatAtRef.current, now))
    }

    function tick() {
      timer = undefined
      const now = Date.now()
      // Horloge reculée depuis le dernier geste : recalé sur maintenant, la
      // fenêtre de 30 min ne s'allonge pas de tout l'écart (lib/heartbeat.ts).
      lastInteractionAtRef.current = clampToNow(lastInteractionAtRef.current, now)
      if (
        shouldBeat({
          visible: isVisible(),
          lastInteractionAt: lastInteractionAtRef.current,
          lastBeatAt: lastBeatAtRef.current,
          now,
        })
      ) {
        lastBeatAtRef.current = now
        // Le battement crée la présence du navigateur (avec consentement) : une
        // synchro des pseudos perdue faute de présence part à sa réponse. Une
        // fois la liste confirmée, l'appel ne fait rien.
        void sendHeartbeat({
          active: isActive(lastInteractionAtRef.current, now),
          inGame: inGameRef.current,
        }).then(syncLocalPlayersNow)
      }
      schedule()
    }

    const onInteraction = () => {
      lastInteractionAtRef.current = Date.now()
      // Minuteur armé : le prochain battement est déjà prévu, rien de plus.
      // Coupé (montage, page restée inutilisée) : battement immédiat.
      if (timer === undefined) tick()
    }

    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, onInteraction, LISTENER_OPTIONS)
    }
    // Retour au premier plan (ou montage) : battement immédiat si le dernier
    // geste date de 30 min au plus et que la minute est écoulée ; sinon le
    // minuteur attend la fin de la minute, ou rien s'il n'y a eu aucun geste.
    tick()

    return () => {
      window.clearTimeout(timer)
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, onInteraction, LISTENER_OPTIONS)
      }
    }
  }, [visible])

  return null
}
