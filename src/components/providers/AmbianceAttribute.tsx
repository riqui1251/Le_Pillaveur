"use client"

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import {
  AMBIANCE_EVENT,
  normalizeAmbianceMode,
  readLocalAmbianceMode,
  writeLocalAmbianceMode,
  type AmbianceMode,
} from '@/lib/ambiance-mode'

// Les lectures/écritures locales vivent dans lib/ambiance-mode (AuthProvider
// en a besoin, et ce fichier importe useAuth : pas de cycle). Réexportées ici,
// où les composants les cherchent avec le reste de l'ambiance.
export {
  AMBIANCE_STORAGE_KEY,
  normalizeAmbianceMode,
  readLocalAmbianceMode,
  writeLocalAmbianceMode,
  type AmbianceMode,
} from '@/lib/ambiance-mode'

/**
 * LA lecture de l'ambiance : compte s'il existe, sinon repli local.
 *
 * À utiliser partout où l'on lisait `user?.ambianceMode` côté client — sans
 * quoi le mode Soft reste réservé aux comptes.
 */
export function useAmbianceMode(): { mode: AmbianceMode; setMode: (mode: AmbianceMode) => void } {
  const { user, setAmbianceMode } = useAuth()
  // 'alcool' au premier rendu (le serveur ne connaît ni le stockage ni l'app)
  // puis valeur réelle après montage : même sortie serveur/client, aucun écart
  // d'hydratation, et la table sans compte retrouve son réglage aussitôt —
  // 'soft' d'office dans l'app tant que rien n'est choisi.
  const [localMode, setLocalMode] = useState<AmbianceMode>('alcool')

  useEffect(() => {
    const sync = () => setLocalMode(readLocalAmbianceMode())
    sync()
    window.addEventListener(AMBIANCE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(AMBIANCE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setMode = useCallback(
    (mode: AmbianceMode) => {
      writeLocalAmbianceMode(mode)
      if (user) void setAmbianceMode(mode)
    },
    [user, setAmbianceMode]
  )

  return { mode: user ? normalizeAmbianceMode(user.ambianceMode) : localMode, setMode }
}

/**
 * Pose `data-ambiance="soft"` sur <html> en mode Soft : les variables CSS
 * (--felt, --background…) glissent du feutre vert au bleu nuit — toute
 * l'identité « Cartes sur Table » suit, sans re-render global.
 */
export function AmbianceAttribute() {
  const { mode } = useAmbianceMode()
  const soft = mode === 'soft'

  useEffect(() => {
    const el = document.documentElement
    if (soft) el.setAttribute('data-ambiance', 'soft')
    else el.removeAttribute('data-ambiance')
  }, [soft])

  return null
}
