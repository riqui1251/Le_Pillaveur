"use client"

import { useEffect, useRef } from 'react'
import { usePathname } from '@/i18n/navigation'
import { isOverlayFreeRoute } from '@/components/legal/AgeGate'
import { initFirstGameDeviceFlag } from '@/lib/first-game-device'

/**
 * Pose le drapeau « avis de première partie » de l'appareil dès la toute
 * PREMIÈRE page vue, avant toute partie (cf. src/lib/first-game-device.ts) :
 * un nouveau visiteur est ainsi 'fresh' avant d'avoir joué, et un habitué
 * 'veteran' dès le déploiement — c'est ce qui permet, en local, de ne
 * solliciter que les vrais débutants.
 *
 * Monté dans Providers, AVANT les pages : les effets d'un frère précédent
 * passent avant ceux de la page, si bien qu'une première visite qui atterrit
 * directement sur un jeu est jugée sur l'état d'AVANT ce jeu.
 *
 * Rien sur l'écran TV : c'est un afficheur passif, pas un appareil de joueur
 * (il n'a jamais d'écran de fin à lui). Ne rend jamais rien.
 */
export function FirstGameDeviceInit() {
  const pathname = usePathname()
  // Une fois posé (ou lu), inutile de relire le stockage à chaque navigation.
  const doneRef = useRef(false)

  useEffect(() => {
    if (doneRef.current || isOverlayFreeRoute(pathname)) return
    doneRef.current = true
    initFirstGameDeviceFlag()
  }, [pathname])

  return null
}
