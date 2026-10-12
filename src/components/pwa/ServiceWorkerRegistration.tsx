"use client"

import { useEffect } from 'react'
import { useLocale } from 'next-intl'

/**
 * Enregistre le service worker du site (/sw.js, généré par
 * src/app/sw.js/route.ts) : les jeux « un seul téléphone » restent jouables
 * sans réseau, dans l'app Android comme en PWA — voir src/lib/offline/.
 *
 * - Après `load` : le préchargement (une dizaine de pages, quelques dizaines
 *   de fichiers) ne doit pas concurrencer le premier affichage.
 * - L'URL porte la langue de la page (`?l=fr`) : le worker ne précharge que
 *   les pages de cette langue. Changer de langue enregistre l'autre URL, qui
 *   remplace la première (même portée « / »).
 * - En développement, pas d'enregistrement — et tout worker laissé par un
 *   build de production sur le même port est retiré : il masquerait le
 *   rechargement à chaud et servirait de vieux fichiers.
 *
 * Ne rend rien. Un refus (navigateur sans worker, navigation privée sur
 * certains moteurs, portée refusée) est silencieux : le site marche sans.
 */
export function ServiceWorkerRegistration() {
  const locale = useLocale()

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    const workers = navigator.serviceWorker
    if (process.env.NODE_ENV !== 'production') {
      void workers
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {})
      return
    }
    const register = () => {
      void workers.register(`/sw.js?l=${encodeURIComponent(locale)}`, { scope: '/' }).catch(() => {})
    }
    if (document.readyState === 'complete') {
      register()
      return
    }
    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [locale])

  return null
}
