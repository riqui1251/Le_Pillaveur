"use client"

import { useEffect } from 'react'
import { INTERACTION_EVENTS } from '@/lib/heartbeat'

/** Verrou d'écran du navigateur — typé ici, l'API n'est pas dans tous les lib.dom. */
type WakeLockSentinelLike = {
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

/** Écouteurs passifs, en capture : un jeu qui arrête la propagation ne cache pas le geste. */
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true }

/**
 * Empêche l'écran de s'éteindre.
 *
 * Deux usages, une seule implémentation : le téléphone posé au milieu de la
 * table pendant une partie (il se verrouille pendant qu'on discute, et il faut
 * l'empreinte de son propriétaire pour le rallumer), et la télé ou le PC
 * branché en HDMI qui affiche l'écran TV (l'économiseur d'écran tombe au bout
 * de quelques minutes de lobby). C'est l'interface standard du navigateur,
 * aucune dépendance.
 *
 * Trois cas se gèrent seuls : API absente (webview, Safari ancien) ou demande
 * refusée (batterie faible, page non visible) → on ne fait rien, aucun jeu n'en
 * dépend ; page passée en arrière-plan → le navigateur relâche le verrou de
 * lui-même, on le redemande au retour ; démontage → on relâche.
 *
 * `idleReleaseMs` (pages de jeu) : verrou relâché après ce délai sans aucune
 * interaction (clic, touche, toucher, molette), repris au geste suivant. Un PC
 * ou un téléphone oublié sur une page de jeu retrouve sa mise en veille. Sans
 * option (écran TV, qu'on regarde sans le toucher) : verrou tant que la page
 * est visible.
 *
 * (Ce hook vit sous `components/tv/` faute d'un dossier partagé accessible au
 * chantier qui l'a extrait ; sa place naturelle est `src/hooks/`.)
 */
export function useKeepScreenAwake(options?: { idleReleaseMs?: number }) {
  const idleReleaseMs = options?.idleReleaseMs

  useEffect(() => {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    const wakeLock = nav.wakeLock
    if (!wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false
    // Page restée sans interaction au-delà de idleReleaseMs : plus de verrou
    // jusqu'au prochain geste (le retour au premier plan n'en est pas un).
    let idle = false
    let idleTimer: number | undefined

    const acquire = async () => {
      if (cancelled || idle || sentinel || document.visibilityState !== 'visible') return
      try {
        const next = await wakeLock.request('screen')
        if (cancelled || idle) {
          void next.release().catch(() => {})
          return
        }
        sentinel = next
        // Le navigateur peut relâcher tout seul (écran verrouillé par
        // l'utilisateur, onglet caché) : on oublie la référence morte pour
        // pouvoir en redemander une au retour au premier plan.
        next.addEventListener?.('release', () => {
          if (sentinel === next) sentinel = null
        })
      } catch {
        // Refusé (batterie faible, permission, page cachée) : sans effet.
      }
    }

    const release = () => {
      const current = sentinel
      sentinel = null
      void current?.release().catch(() => {})
    }

    // Minuteur réarmé à chaque geste (et au montage : on vient d'arriver sur
    // la page). Un minuteur plutôt qu'une comparaison d'horloges : insensible
    // à une horloge système qui recule.
    const armIdleTimer = () => {
      if (idleReleaseMs === undefined) return
      window.clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => {
        idle = true
        release()
      }, idleReleaseMs)
    }

    const onInteraction = () => {
      armIdleTimer()
      if (idle) {
        idle = false
        void acquire()
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire()
      else release()
    }

    armIdleTimer()
    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (idleReleaseMs !== undefined) {
      for (const type of INTERACTION_EVENTS) {
        window.addEventListener(type, onInteraction, LISTENER_OPTIONS)
      }
    }
    return () => {
      cancelled = true
      window.clearTimeout(idleTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      for (const type of INTERACTION_EVENTS) {
        window.removeEventListener(type, onInteraction, LISTENER_OPTIONS)
      }
      release()
    }
  }, [idleReleaseMs])
}
