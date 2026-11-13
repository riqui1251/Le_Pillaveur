/**
 * Règles personnalisées de la table, gardées sur l'appareil (localStorage) :
 * chaque groupe a sa version de la Coupe du Roi et la retrouve à la soirée
 * suivante. Lecture et écriture ne lèvent jamais : un stockage refusé (navigation
 * privée, quota) laisse simplement les règles valoir pour la partie en cours.
 */

import { getSafeStorage } from '@/lib/storage'
import { cleanCoupeOverrides, type CoupeOverrides } from './engine'

export const COUPE_RULES_STORAGE_KEY = 'lp-coupe-du-roi-rules'

/** Contenu brut du stockage → règles propres (rangs connus, textes non vides). */
export function parseStoredCoupeOverrides(raw: string | null): CoupeOverrides {
  if (!raw) return {}
  try {
    return cleanCoupeOverrides(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function readCoupeOverrides(): CoupeOverrides {
  const storage = getSafeStorage()
  if (!storage) return {}
  try {
    return parseStoredCoupeOverrides(storage.getItem(COUPE_RULES_STORAGE_KEY))
  } catch {
    return {}
  }
}

/** Écrit les règles nettoyées ; aucune règle modifiée → la clé disparaît. */
export function writeCoupeOverrides(overrides: CoupeOverrides): void {
  const storage = getSafeStorage()
  if (!storage) return
  const clean = cleanCoupeOverrides(overrides)
  try {
    if (Object.keys(clean).length === 0) storage.removeItem(COUPE_RULES_STORAGE_KEY)
    else storage.setItem(COUPE_RULES_STORAGE_KEY, JSON.stringify(clean))
  } catch {
    // Stockage plein ou refusé : les règles valent pour cette partie seulement.
  }
}
