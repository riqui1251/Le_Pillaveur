import { ESPION_LOCATION_IDS, type EspionLocationId } from './locations'
import { ESPION_LOCATIONS_FR } from './fr'
import { ESPION_LOCATIONS_EN } from './en'
import { ESPION_LOCATIONS_ES } from './es'
import { ESPION_LOCATIONS_IT } from './it'

export { ESPION_LOCATION_IDS, type EspionLocationId } from './locations'

export type EspionLang = 'fr' | 'en' | 'es' | 'it'

export type EspionLocationEntry = { id: EspionLocationId; name: string }

const ESPION_LANGS: readonly EspionLang[] = ['fr', 'en', 'es', 'it']

const NAMES_BY_LANG: Record<EspionLang, Record<EspionLocationId, string>> = {
  fr: ESPION_LOCATIONS_FR,
  en: ESPION_LOCATIONS_EN,
  es: ESPION_LOCATIONS_ES,
  it: ESPION_LOCATIONS_IT,
}

function namesFor(lang: string | null | undefined): Record<EspionLocationId, string> {
  return (ESPION_LANGS as readonly string[]).includes(lang ?? '') ? NAMES_BY_LANG[lang as EspionLang] : NAMES_BY_LANG.fr
}

/** Casse, accents et espaces de bord ignorés : un nom tapé ou venu d'une autre langue reste reconnu. */
export function normalizeEspionLocationName(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Lieux dans la langue de la SALLE (posée à sa création). Contrairement aux
 * données Quiz/Bluff/Imposteur, cette liste ne contient AUCUN secret (juste
 * les noms de lieux possibles, comme la carte imprimée du Spyfall physique)
 * — sûre à importer côté CLIENT pour construire le sélecteur de l'espion.
 * Le vrai secret (le lieu TIRÉ) ne vit que dans l'état serveur.
 */
export function getEspionLocations(lang: string | null | undefined): string[] {
  const names = namesFor(lang)
  return ESPION_LOCATION_IDS.map((id) => names[id])
}

export function espionLocationsFor(lang: string | null | undefined): EspionLocationEntry[] {
  const names = namesFor(lang)
  return ESPION_LOCATION_IDS.map((id) => ({ id, name: names[id] }))
}

export function espionLocationName(id: EspionLocationId, lang: string | null | undefined): string {
  return namesFor(lang)[id]
}

let idByName: Map<string, EspionLocationId> | null = null

/**
 * L'état ne garde que des noms dans la langue de la salle : l'id s'en déduit
 * en cherchant dans les 4 langues. Un nom commun à deux langues (Casino,
 * Hotel…) désigne toujours le même lieu, ce que verrouille locations.test.
 */
export function espionLocationIdOf(name: string): EspionLocationId | null {
  if (!idByName) {
    idByName = new Map()
    for (const lang of ESPION_LANGS) {
      for (const id of ESPION_LOCATION_IDS) idByName.set(normalizeEspionLocationName(NAMES_BY_LANG[lang][id]), id)
    }
  }
  return idByName.get(normalizeEspionLocationName(name)) ?? null
}
