import type { DurationReliability } from '@/lib/online/game-sessions'

/**
 * Unités d'une durée. Françaises par défaut ; la Supervision, traduite en
 * 4 langues, passe les siennes (clés supervision.units.*) : « 1 j 7 h » n'a
 * pas de sens en anglais, en espagnol ni en italien.
 */
export type DurationUnits = { s: string; min: string; h: string; d: string }

const FRENCH_UNITS: DurationUnits = { s: 's', min: 'min', h: 'h', d: 'j' }

export function formatPresenceDuration(totalSeconds: number, units: DurationUnits = FRENCH_UNITS): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return `${s} ${units.s}`
  const mins = Math.floor(s / 60)
  if (mins < 60) return `${mins} ${units.min}`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 24) {
    return remMins > 0 ? `${hours} ${units.h} ${remMins} ${units.min}` : `${hours} ${units.h}`
  }
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days} ${units.d} ${remHours} ${units.h}` : `${days} ${units.d}`
}

/**
 * Durée de table affichée : « ≈ » devant une fin estimée, « ? » pour une fin
 * inconnue que rien ne date (fermée à son début). Une ligne ancienne à la
 * fiabilité inconnue garde sa durée brute, le badge dit ce qu'elle vaut.
 */
export function tableDurationLabel(
  durationSeconds: number,
  reliability: DurationReliability,
  units: DurationUnits
): string {
  if (reliability === 'unknown' && durationSeconds === 0) return '?'
  const label = formatPresenceDuration(durationSeconds, units)
  return reliability === 'estimated' ? `≈ ${label}` : label
}
