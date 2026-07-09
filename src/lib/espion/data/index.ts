import { ESPION_LOCATIONS_FR } from './fr'
import { ESPION_LOCATIONS_EN } from './en'
import { ESPION_LOCATIONS_ES } from './es'
import { ESPION_LOCATIONS_IT } from './it'

export type EspionLang = 'fr' | 'en' | 'es' | 'it'

const LOCATIONS_BY_LANG: Record<EspionLang, string[]> = {
  fr: ESPION_LOCATIONS_FR,
  en: ESPION_LOCATIONS_EN,
  es: ESPION_LOCATIONS_ES,
  it: ESPION_LOCATIONS_IT,
}

/**
 * Lieux dans la langue de la SALLE (posée à sa création).
 * ⚠️ SERVER-ONLY : détermine le tirage secret.
 */
export function getEspionLocations(lang: string | null | undefined): string[] {
  return LOCATIONS_BY_LANG[(lang ?? 'fr') as EspionLang] ?? LOCATIONS_BY_LANG.fr
}
