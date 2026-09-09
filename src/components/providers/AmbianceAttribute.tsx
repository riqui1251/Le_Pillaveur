"use client"

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'

export type AmbianceMode = 'alcool' | 'soft'

/**
 * Repli LOCAL de l'ambiance, pour le public que le réglage vise vraiment : un
 * téléphone posé au milieu de la table, sans compte. Le mode Soft ne vivait
 * que sur `user.ambianceMode` — la bascule ne s'affichait donc que pour un
 * connecté, et le groupe qui joue sans alcool ne la voyait jamais.
 *
 * Règle : le COMPTE reste la source de vérité quand il y en a un (le réglage
 * suit le joueur d'un appareil à l'autre) ; sans compte, l'appareil se
 * souvient tout seul. On écrit dans les deux cas, pour qu'une déconnexion ne
 * fasse pas resurgir l'alcool sur une table qui n'en veut pas.
 */
export const AMBIANCE_STORAGE_KEY = 'lp-ambiance-mode'

/**
 * Le stockage ne prévient PAS l'onglet qui écrit ('storage' ne sert qu'aux
 * autres onglets) : sans cet événement maison, la bascule changerait le
 * réglage sans que l'attribut d'ambiance ni les jeux ouverts s'en aperçoivent.
 */
const AMBIANCE_EVENT = 'lp-ambiance-change'

/** Toute valeur inconnue (stockage bricolé, ancienne version) = alcool. */
export function normalizeAmbianceMode(value: string | null | undefined): AmbianceMode {
  return value === 'soft' ? 'soft' : 'alcool'
}

/** Ambiance retenue sur CET appareil. 'alcool' hors navigateur ou si bloqué. */
export function readLocalAmbianceMode(): AmbianceMode {
  if (typeof window === 'undefined') return 'alcool'
  try {
    return normalizeAmbianceMode(window.localStorage.getItem(AMBIANCE_STORAGE_KEY))
  } catch {
    // navigation privée / stockage refusé : le réglage vaut pour la session
    return 'alcool'
  }
}

/** Mémorise l'ambiance sur l'appareil et réveille les lecteurs de la page. */
export function writeLocalAmbianceMode(mode: AmbianceMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(AMBIANCE_STORAGE_KEY, mode)
  } catch {
    // rien à mémoriser : la bascule reste utilisable pour la visite en cours
  }
  window.dispatchEvent(new Event(AMBIANCE_EVENT))
}

/**
 * LA lecture de l'ambiance : compte s'il existe, sinon repli local.
 *
 * À utiliser partout où l'on lisait `user?.ambianceMode` côté client — sans
 * quoi le mode Soft reste réservé aux comptes.
 */
export function useAmbianceMode(): { mode: AmbianceMode; setMode: (mode: AmbianceMode) => void } {
  const { user, setAmbianceMode } = useAuth()
  // 'alcool' au premier rendu (le serveur ne connaît pas le stockage) puis
  // valeur réelle après montage : même sortie serveur/client, aucun écart
  // d'hydratation, et la table sans compte retrouve son réglage aussitôt.
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
