import { VDN_THEMES, type VdnTheme } from './data/types'

/**
 * Réglages de table d'À Vue de Nez, lisibles partout : la route PUT /settings
 * (liste blanche), le lobby commun (boutons) et le lanceur. Module NEUTRE, sans
 * moteur ni banque : il part dans la page de chaque jeu en ligne avec le lobby.
 */

export { VDN_THEMES }
export type { VdnTheme }

/** Choix du lobby ; les mêmes que VDN_QUESTION_COUNTS du moteur (un test le garde). */
export const VDN_LOBBY_COUNTS = [5, 10, 15] as const
export type VdnLobbyCount = (typeof VDN_LOBBY_COUNTS)[number]
export const VDN_LOBBY_DEFAULT_COUNT: VdnLobbyCount = 10

const THEME_SET: ReadonlySet<string> = new Set(VDN_THEMES)

/**
 * Thèmes reçus d'un client : null si la valeur est refusée (le réglage ne
 * bouge pas), sinon les thèmes sans doublon, dans l'ordre canonique. [] veut
 * dire « tout mélanger » — une liste vide comme les sept cochés.
 */
export function readVdnThemesSetting(value: unknown): VdnTheme[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every((theme) => typeof theme === 'string' && THEME_SET.has(theme))) return null
  const picked = VDN_THEMES.filter((theme) => value.includes(theme))
  return picked.length === VDN_THEMES.length ? [] : picked
}

export function readVdnCountSetting(value: unknown): VdnLobbyCount {
  return (VDN_LOBBY_COUNTS as readonly unknown[]).includes(value) ? (value as VdnLobbyCount) : VDN_LOBBY_DEFAULT_COUNT
}

/**
 * Ce que le lanceur retient des réglages de la salle ; les défauts sont ceux
 * du jeu local. `object` : `RoomSettings` n'a pas encore ces champs tant que le
 * jeu n'est pas branché, et toute valeur se relit ici de toute façon.
 */
export function readVdnRoomSettings(settings: object): { questionCount: VdnLobbyCount; themes: VdnTheme[] } {
  const { vdnCount, vdnThemes } = settings as { vdnCount?: unknown; vdnThemes?: unknown }
  return {
    questionCount: readVdnCountSetting(vdnCount),
    themes: readVdnThemesSetting(vdnThemes) ?? [],
  }
}
