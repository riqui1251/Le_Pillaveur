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
 * Lieux dans la langue de la SALLE (posée à sa création). Contrairement aux
 * données Quiz/Bluff/Imposteur, cette liste ne contient AUCUN secret (juste
 * les noms de lieux possibles, comme la carte imprimée du Spyfall physique)
 * — sûre à importer côté CLIENT pour construire le sélecteur de l'espion.
 * Le vrai secret (le lieu TIRÉ) ne vit que dans l'état serveur.
 */
export function getEspionLocations(lang: string | null | undefined): string[] {
  return LOCATIONS_BY_LANG[(lang ?? 'fr') as EspionLang] ?? LOCATIONS_BY_LANG.fr
}
