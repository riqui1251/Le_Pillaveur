import {
  PLAYER_EFFECTS,
  PLAYER_FRAMES,
  PLAYER_ICONS,
  type PlayerPreferences,
} from '@/lib/players'

/**
 * Personnalisation du joueur EN LIGNE (compte) — même vocabulaire que les
 * joueurs locaux (icône, effet de pseudo, cadre staff) pour réutiliser
 * PlayerIcon/PlayerName/PlayerCustomizer tels quels.
 */

export type OnlinePreferences = Pick<
  PlayerPreferences,
  'color' | 'icon' | 'specialEffect' | 'iconFrame'
>

export const DEFAULT_ONLINE_PREFERENCES: OnlinePreferences = {
  color: 'bg-amber-500',
  icon: undefined,
  specialEffect: null,
  iconFrame: null,
}

export function parseOnlinePreferences(json: string | null | undefined): OnlinePreferences {
  if (!json) return { ...DEFAULT_ONLINE_PREFERENCES }
  try {
    const raw = JSON.parse(json) as Partial<OnlinePreferences>
    return sanitizeOnlinePreferences(raw, { allowFrame: true })
  } catch {
    return { ...DEFAULT_ONLINE_PREFERENCES }
  }
}

/** Ne laisse passer que des valeurs connues (icône du set, effet/cadre valides). */
export function sanitizeOnlinePreferences(
  input: Partial<OnlinePreferences>,
  options: { allowFrame: boolean }
): OnlinePreferences {
  const icon =
    typeof input.icon === 'string' && (PLAYER_ICONS as readonly string[]).includes(input.icon)
      ? input.icon
      : undefined
  const specialEffect = PLAYER_EFFECTS.some((e) => e.id === input.specialEffect)
    ? (input.specialEffect ?? null)
    : null
  const iconFrame =
    options.allowFrame && PLAYER_FRAMES.some((f) => f.id === input.iconFrame)
      ? (input.iconFrame ?? null)
      : null
  return {
    color: DEFAULT_ONLINE_PREFERENCES.color,
    icon,
    specialEffect,
    iconFrame,
  }
}
