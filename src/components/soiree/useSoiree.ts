"use client"

import { useCallback, useEffect, useState } from 'react'
import { readSoiree, SOIREE_EVENT, SOIREE_STORAGE_KEY, writeSoiree } from '@/lib/soiree/storage'
import { soireeCap } from '@/lib/soiree/catalog'
import { playingRoundOf, type Soiree, type SoireeRound } from '@/lib/soiree/state'

/**
 * La soirée en cours, relue à chaque écriture : un jeu local qui remonte ses
 * gorgées (src/lib/soiree/storage.ts) ou un autre onglet. Null tant que le
 * stockage n'est pas lu (`ready` faux) : le serveur ne le connaît pas.
 */
export function useSoiree() {
  const [soiree, setSoiree] = useState<Soiree | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sync = () => setSoiree(readSoiree())
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === SOIREE_STORAGE_KEY) sync()
    }
    sync()
    setReady(true)
    window.addEventListener(SOIREE_EVENT, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SOIREE_EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const save = useCallback((next: Soiree | null) => {
    writeSoiree(next)
    setSoiree(next)
  }, [])

  return { soiree, ready, save }
}

/** La manche de soirée qui se joue sur ce jeu, ou null (null aussi tant que le stockage n'est pas lu). */
export function useSoireeRound(gameId: string): SoireeRound | null {
  const { soiree } = useSoiree()
  return playingRoundOf(soiree, gameId)
}

/** Mode Soirée : la borne qui clôt une partie de ce jeu (soireeCap), seulement pendant une de ses manches. */
export function useSoireeCap(gameId: string): number | null {
  return useSoireeRound(gameId) ? soireeCap(gameId) : null
}
