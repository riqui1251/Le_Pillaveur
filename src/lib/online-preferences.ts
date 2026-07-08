import type { PlayerPreferences } from '@/lib/players'
import { DEFAULT_ONLINE_ICON, ONLINE_EFFECT_IDS, ONLINE_FRAME_IDS, ONLINE_ICON_IDS } from '@/lib/online/cosmetics'

/**
 * Personnalisation du joueur EN LIGNE (compte) — icône, effet de pseudo et
 * cadre. Séparée du catalogue local (PLAYER_ICONS/EFFECTS/FRAMES) : les
 * valeurs valides viennent du catalogue de progression en ligne
 * (src/lib/online/cosmetics.ts), pas de la grille libre du local. Le
 * déblocage par niveau/rôle/grant est vérifié séparément (voir la route
 * PATCH /api/auth/online-preferences) — cette structure ne valide que la
 * FORME (« est-ce un id online reconnu ? »).
 */

export type OnlinePreferences = Pick<
  PlayerPreferences,
  'color' | 'icon' | 'specialEffect' | 'iconFrame'
>

export const DEFAULT_ONLINE_PREFERENCES: OnlinePreferences = {
  color: 'bg-amber-500',
  icon: DEFAULT_ONLINE_ICON,
  specialEffect: null,
  iconFrame: null,
}

export function parseOnlinePreferences(json: string | null | undefined): OnlinePreferences {
  if (!json) return { ...DEFAULT_ONLINE_PREFERENCES }
  try {
    const raw = JSON.parse(json) as Partial<OnlinePreferences>
    return sanitizeOnlinePreferences(raw)
  } catch {
    return { ...DEFAULT_ONLINE_PREFERENCES }
  }
}

/** Ne laisse passer que des valeurs connues du catalogue online (icône/effet/cadre). */
export function sanitizeOnlinePreferences(input: Partial<OnlinePreferences>): OnlinePreferences {
  const icon =
    typeof input.icon === 'string' && (ONLINE_ICON_IDS as readonly string[]).includes(input.icon)
      ? input.icon
      : DEFAULT_ONLINE_ICON
  const specialEffect = (ONLINE_EFFECT_IDS as readonly string[]).includes(input.specialEffect ?? '')
    ? (input.specialEffect ?? null)
    : null
  const iconFrame = (ONLINE_FRAME_IDS as readonly string[]).includes(input.iconFrame ?? '')
    ? (input.iconFrame ?? null)
    : null
  return {
    color: DEFAULT_ONLINE_PREFERENCES.color,
    icon,
    specialEffect,
    iconFrame,
  }
}
