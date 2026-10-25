import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AppLocale } from '@/i18n/routing'
import { normalizeAppLocale } from '@/lib/locale-utils'
import {
  getModerationErrorMessage,
  validateAccountDisplayName,
  type NameModerationReason,
} from '@/lib/name-moderation'
import { displayNameKey } from '@/lib/name-moderation/confusables'
import frMessages from '../../messages/fr.json'
import enMessages from '../../messages/en.json'
import esMessages from '../../messages/es.json'
import itMessages from '../../messages/it.json'

export const DISPLAY_NAME_MAX_LENGTH = 30

export function normalizeDisplayName(name: string): string {
  return name.trim()
}

export { displayNameKey }

export function getDisplayNameValidationError(name: string): NameModerationReason | null {
  const result = validateAccountDisplayName(name, DISPLAY_NAME_MAX_LENGTH)
  return result.ok ? null : result.reason
}

export function isValidDisplayName(name: string): boolean {
  return getDisplayNameValidationError(name) === null
}

export function displayNameValidationMessage(
  name: string,
  locale: AppLocale | string | null = 'fr'
): string | null {
  const reason = getDisplayNameValidationError(name)
  return reason ? getModerationErrorMessage(reason, locale, 'account') : null
}

/** Ce que LOWER() de SQLite fait d'une chaîne : seules les majuscules ASCII. */
function sqliteLower(text: string): string {
  return text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase())
}

/**
 * Un pseudo est « pris » s'il a la même clé (casse, pleine chasse, invisibles,
 * homoglyphes : displayNameKey) que le pseudo de compte OU le pseudo en ligne
 * de n'importe quel compte actif : mot de passe, Google (email sans mot de
 * passe) ou invité. Sans ça, un homonyme exact permet d'usurper l'identité
 * visuelle d'un joueur à la table (effets, cadres) — seuls les
 * enregistrements fantômes legacy sont ignorés.
 *
 * La clé est comparée à la colonne stockée, jamais à un LOWER() de SQLite,
 * qui ne replie que l'ASCII (« Élodie » passait à côté d'« Élodie »). Ligne
 * sans clé (pseudo non ASCII d'avant la migration, en attendant
 * scripts/backfill-display-name-keys.mjs) : ancienne comparaison, avec la clé
 * ET avec l'entrée repliée comme SQLite la replie, ce qui attrape au moins le
 * doublon exact.
 */
export async function isDisplayNameTaken(
  displayName: string,
  excludeUserId?: string
): Promise<boolean> {
  const key = displayNameKey(displayName)
  if (!key) return false
  const legacyKey = sqliteLower(normalizeDisplayName(displayName))

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "User"
    WHERE ("displayNameKey" = ${key}
        OR "onlineDisplayNameKey" = ${key}
        OR ("displayNameKey" IS NULL AND LOWER(TRIM("displayName")) IN (${key}, ${legacyKey}))
        OR ("onlineDisplayNameKey" IS NULL AND LOWER(TRIM(COALESCE("name", ''))) IN (${key}, ${legacyKey})))
      AND ("passwordHash" != '' OR "email" IS NOT NULL OR "isGuest" = 1)
      ${excludeUserId ? Prisma.sql`AND id != ${excludeUserId}` : Prisma.empty}
    LIMIT 1`

  return rows.length > 0
}

const DISPLAY_NAME_TAKEN: Record<AppLocale, string> = {
  fr: frMessages.auth.register.displayNameTaken,
  en: enMessages.auth.register.displayNameTaken,
  es: esMessages.auth.register.displayNameTaken,
  it: itMessages.auth.register.displayNameTaken,
}

/** @deprecated Préférer displayNameTakenMessage(locale) */
export const DISPLAY_NAME_TAKEN_ERROR = DISPLAY_NAME_TAKEN.fr

export function displayNameTakenMessage(
  locale: AppLocale | string | null = 'fr'
): string {
  return DISPLAY_NAME_TAKEN[normalizeAppLocale(locale)]
}
