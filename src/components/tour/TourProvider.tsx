"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { isTourRunning, setTourRunning } from '@/lib/tour/storage'

/**
 * Tuto des nouveaux joueurs — point d'entrée, monté une fois pour tout le site.
 *
 * Volontairement minuscule : il ne porte qu'un booléen et la fonction qui
 * lance le tuto (page « Joueurs » à la première visite, entrée « Revoir le
 * tuto » du menu). Tout le reste — bulle, moteur, écrans de démonstration,
 * textes — vit dans TourLayer, un morceau téléchargé SEULEMENT quand le tuto
 * s'ouvre : un joueur qui ne le voit jamais n'en reçoit pas un octet.
 */

type TourContextValue = {
  /** Un tuto est à l'écran. */
  active: boolean
  startTour: () => void
}

const TourContext = createContext<TourContextValue>({ active: false, startTour: () => {} })

export function useTour(): TourContextValue {
  return useContext(TourContext)
}

const TourLayer = dynamic(() => import('./TourLayer').then((m) => m.TourLayer), { ssr: false })

export function TourProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<{ resume: boolean } | null>(null)

  // Un tuto était en cours dans cet onglet (rechargement de page) : on le
  // reprend, à l'étape de l'écran où se trouve le joueur.
  useEffect(() => {
    if (isTourRunning()) setRun({ resume: true })
  }, [])

  const startTour = useCallback(() => setRun((current) => current ?? { resume: false }), [])
  const close = useCallback(() => {
    setTourRunning(false)
    setRun(null)
  }, [])

  const value = useMemo(() => ({ active: run !== null, startTour }), [run, startTour])

  return (
    <TourContext.Provider value={value}>
      {children}
      {run && <TourLayer resume={run.resume} onClose={close} />}
    </TourContext.Provider>
  )
}
