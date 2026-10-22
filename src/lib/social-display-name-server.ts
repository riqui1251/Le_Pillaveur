import {
  DISPLAY_NAME_MAX_LENGTH,
  getDisplayNameValidationError,
  isDisplayNameTaken,
} from '@/lib/display-name'

/**
 * Fabrique un pseudo disponible à partir du prénom transmis par Google,
 * Discord ou Facebook : on tente le nom tel quel, puis avec un suffixe
 * numérique, avant un repli neutre. Le pseudo reste modifiable ensuite depuis
 * la page Compte.
 */
export async function pickAvailableDisplayName(preferred: string): Promise<string> {
  const base = preferred.trim().slice(0, DISPLAY_NAME_MAX_LENGTH).trim()
  const candidates: string[] = []
  if (base) {
    candidates.push(base)
    for (let i = 0; i < 3; i++) {
      const suffix = String(Math.floor(10 + Math.random() * 90))
      candidates.push(`${base.slice(0, DISPLAY_NAME_MAX_LENGTH - suffix.length)}${suffix}`)
    }
  }
  for (let i = 0; i < 5; i++) {
    candidates.push(`Joueur${Math.floor(1000 + Math.random() * 9000)}`)
  }
  for (const candidate of candidates) {
    if (getDisplayNameValidationError(candidate)) continue
    if (await isDisplayNameTaken(candidate)) continue
    return candidate
  }
  // Dernier recours : un identifiant quasi unique (validation garantie).
  return `Joueur${Date.now() % 100000}`
}
