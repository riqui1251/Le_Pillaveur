'use client'

import { useCallback, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { refreshOnlineProgression } from '@/hooks/useOnlineProgression'
import { DEFAULT_ONLINE_ICON } from '@/lib/online/cosmetics'
import type { OnlinePreferences } from '@/lib/online-preferences'
import type { PlayerIconFrame, PlayerSpecialEffect } from '@/lib/players'

/** Corps COMPLET envoyé à PATCH /api/auth/online-preferences. */
export type OnlinePreferencesPatch = {
  icon: string
  specialEffect: PlayerSpecialEffect
  iconFrame: PlayerIconFrame
}

/**
 * Le PATCH n'est pas partiel : la route assainit le corps reçu, et un champ
 * absent y retombe sur sa valeur PAR DÉFAUT (icône chope, ni effet ni cadre).
 * Changer la seule icône en n'envoyant qu'elle effaçait donc l'effet et le
 * cadre du joueur. On fusionne ici avec le look courant et on envoie
 * TOUJOURS les trois champs.
 *
 * `undefined` = « pas fourni » (le look courant reste) ; `null` = « retirer »
 * (aucun effet, aucun cadre). Une icône vide retombe sur la chope, comme côté
 * serveur.
 */
export function onlinePreferencesPatch(
  current: { icon?: string | null; specialEffect?: PlayerSpecialEffect; iconFrame?: PlayerIconFrame } | null | undefined,
  partial: Partial<OnlinePreferences>
): OnlinePreferencesPatch {
  const icon = partial.icon !== undefined ? partial.icon : current?.icon
  const specialEffect = partial.specialEffect !== undefined ? partial.specialEffect : current?.specialEffect
  const iconFrame = partial.iconFrame !== undefined ? partial.iconFrame : current?.iconFrame
  return {
    icon: icon || DEFAULT_ONLINE_ICON,
    specialEffect: specialEffect ?? null,
    iconFrame: iconFrame ?? null,
  }
}

/**
 * Enregistre le look EN LIGNE (icône, effet de pseudo, cadre) depuis
 * n'importe quel écran — fiche compte, siège à la Table Ronde, écran de fin —
 * puis relit la session (le look vit dans `user.onlinePreferences`) et la
 * progression partagée, pour que tous les écrans montés le voient.
 *
 * `save` rend `true` si le serveur a accepté. Un cosmétique non débloqué est
 * ignoré par la route (l'équipement précédent est gardé) : la relecture de
 * session montre alors la vérité.
 */
export function useSaveOnlinePreferences(): {
  save: (partial: Partial<OnlinePreferences>) => Promise<boolean>
  saving: boolean
} {
  const { user, refresh } = useAuth()
  const userId = user?.id
  const current = user?.onlinePreferences
  const [saving, setSaving] = useState(false)

  const save = useCallback(
    async (partial: Partial<OnlinePreferences>) => {
      if (!userId) return false
      setSaving(true)
      try {
        const res = await fetch('/api/auth/online-preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(onlinePreferencesPatch(current, partial)),
        })
        if (!res.ok) return false
        await Promise.all([refresh(), refreshOnlineProgression(userId)])
        return true
      } catch {
        return false
      } finally {
        setSaving(false)
      }
    },
    [userId, current, refresh]
  )

  return { save, saving }
}
