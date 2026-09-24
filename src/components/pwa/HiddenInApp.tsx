"use client"

import { useEffect, useState, type ReactNode } from 'react'
import { isCapacitorApp } from '@/lib/native-app'

/**
 * Rend ses enfants partout SAUF dans la coquille Capacitor. Sur /application,
 * les avantages de l'installation, les stores « bientôt » et la note n'ont
 * pas de sens pour qui est déjà dans l'app : il n'y voit que le mot
 * d'InstallButton, comme avant le passage de la page en composant serveur.
 *
 * Les enfants restent rendus côté serveur (dans le HTML, pour tout le monde)
 * et au premier rendu client ; la coquille n'est connue qu'après montage —
 * même bascule qu'avant, au même moment.
 */
export function HiddenInApp({ children }: { children: ReactNode }) {
  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    setInApp(isCapacitorApp())
  }, [])
  return inApp ? null : <>{children}</>
}
