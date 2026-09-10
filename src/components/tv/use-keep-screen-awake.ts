"use client"

import { useEffect } from 'react'

/** Verrou d'écran du navigateur — typé ici, l'API n'est pas dans tous les lib.dom. */
type WakeLockSentinelLike = {
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
}

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
 * (Ce hook vit sous `components/tv/` faute d'un dossier partagé accessible au
 * chantier qui l'a extrait ; sa place naturelle est `src/hooks/`.)
 */
export function useKeepScreenAwake() {
  useEffect(() => {
    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    const wakeLock = nav.wakeLock
    if (!wakeLock) return

    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || sentinel || document.visibilityState !== 'visible') return
      try {
        const next = await wakeLock.request('screen')
        if (cancelled) {
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

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void acquire()
      else release()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      release()
    }
  }, [])
}
