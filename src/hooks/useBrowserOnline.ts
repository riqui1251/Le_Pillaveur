import { useEffect, useState } from 'react'

/**
 * Ce que le navigateur dit de sa connexion (navigator.onLine + événements
 * `online` / `offline`) — la part « hors ligne » du verdict de
 * src/hooks/connection-status.ts, utilisable hors d'une salle en ligne.
 *
 * `true` au rendu serveur et au premier rendu client : la page ne doit pas
 * s'ouvrir sur un bandeau « hors ligne » qui disparaît aussitôt, et le HTML
 * rendu au build ne connaît pas la connexion du visiteur. Un `onLine` vrai
 * n'est qu'un espoir (Wi-Fi sans internet) ; un `onLine` faux, lui, dit vrai.
 */
export function useBrowserOnline(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  return online
}
