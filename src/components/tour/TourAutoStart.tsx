"use client"

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { requestAgeVerification } from '@/components/legal/AgeGate'
import { getStoredPlayers } from '@/lib/players'
import { hasSeenTour, markTourSeen } from '@/lib/tour/storage'
import { useTour } from './TourProvider'

/**
 * Propose le tuto à la PREMIÈRE arrivée d'un nouveau joueur sur « Joueurs »,
 * une fois la porte 18 ans passée. « Nouveau » se lit sur l'appareil et sur
 * le compte : ni marque `lp-tour-seen`, ni tuto déjà vu par ce compte
 * ailleurs, ni joueur local déjà enregistré ici (une tablée qui a ses
 * prénoms n'a pas besoin qu'on lui montre où les écrire). Tout le monde peut
 * le relancer par le menu.
 *
 * Tient aussi les deux mémoires d'accord : un tuto vu sur cet appareil avant
 * la connexion est reporté sur le compte, et inversement.
 */
export function TourAutoStart() {
  const { user, loading } = useAuth()
  const { active, startTour } = useTour()
  const userId = user?.id
  const accountSeen = user?.tourSeen === true

  useEffect(() => {
    if (loading || active) return

    if (hasSeenTour()) {
      if (userId && !accountSeen) {
        void fetch('/api/auth/tour-seen', { method: 'POST', credentials: 'include' }).catch(() => undefined)
      }
      return
    }
    if (accountSeen) {
      markTourSeen('done')
      return
    }
    if (getStoredPlayers().length > 0) return

    let cancelled = false
    void requestAgeVerification().then((verified) => {
      if (verified && !cancelled && !hasSeenTour()) startTour()
    })
    return () => {
      cancelled = true
    }
  }, [loading, active, userId, accountSeen, startTour])

  return null
}
