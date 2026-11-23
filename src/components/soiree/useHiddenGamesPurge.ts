"use client"

import { useEffect } from 'react'
import { useGameCatalogSnapshot } from '@/hooks/useGameCatalog'
import { withoutHiddenGames, type Soiree } from '@/lib/soiree/state'

/**
 * Les manches pas encore lancées d'un jeu que l'équipe vient de cacher
 * quittent la soirée enregistrée. La purge est irréversible : elle n'a lieu
 * que sur un état lu du serveur, jamais sur la copie de l'appareil (source
 * « cache »), qui peut être périmée — un jeu remis entre-temps y perdrait ses
 * manches. Relancé à chaque soirée relue (une revanche tire un programme).
 */
export function useHiddenGamesPurge(soiree: Soiree | null, save: (next: Soiree | null) => void) {
  const { state, source } = useGameCatalogSnapshot()
  useEffect(() => {
    if (source !== 'server' || !soiree) return
    const cleaned = withoutHiddenGames(soiree, state.hiddenIds)
    if (cleaned !== soiree) save(cleaned)
  }, [soiree, source, state.hiddenIds, save])
}
