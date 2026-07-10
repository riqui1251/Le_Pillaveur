"use client"

import { useEffect } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'

/**
 * Pose `data-ambiance="soft"` sur <html> quand le compte est en mode Soft :
 * les variables CSS (--felt, --background…) glissent du feutre vert au bleu
 * nuit — toute l'identité « Cartes sur Table » suit, sans re-render global.
 */
export function AmbianceAttribute() {
  const { user } = useAuth()
  const soft = user?.ambianceMode === 'soft'

  useEffect(() => {
    const el = document.documentElement
    if (soft) el.setAttribute('data-ambiance', 'soft')
    else el.removeAttribute('data-ambiance')
  }, [soft])

  return null
}
