import { prisma } from '@/lib/prisma'
import type { AppLocale } from '@/i18n/routing'
import { normalizeAppLocale } from '@/lib/locale-utils'
import {
  getModerationErrorMessage,
  validateAccountDisplayName,
  type NameModerationReason,
} from '@/lib/name-moderation'
import frMessages from '../../messages/fr.json'
import enMessages from '../../messages/en.json'
import esMessages from '../../messages/es.json'
import itMessages from '../../messages/it.json'

export const DISPLAY_NAME_MAX_LENGTH = 30

export function normalizeDisplayName(name: string): string {
  return name.trim()
}

export function displayNameKey(name: string): string {
  return normalizeDisplayName(name).toLowerCase()
}

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

/**
 * Un pseudo est « pris » s'il correspond (casse/espaces ignorés) au pseudo de
 * compte OU au pseudo en ligne de n'importe quel compte actif : mot de passe,
 * Google (email sans mot de passe) ou invité. Sans ça, un homonyme exact
 * permet d'usurper l'identité visuelle d'un joueur à la table (effets,
 * cadres) — seuls les enregistrements fantômes legacy sont ignorés.
 */
export async function isDisplayNameTaken(
  displayName: string,
  excludeUserId?: string
): Promise<boolean> {
  const key = displayNameKey(displayName)
  if (!key) return false

  const rows = excludeUserId
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "User"
        WHERE (LOWER(TRIM("displayName")) = ${key} OR LOWER(TRIM(COALESCE("name", ''))) = ${key})
          AND ("passwordHash" != '' OR "email" IS NOT NULL OR "isGuest" = 1)
          AND id != ${excludeUserId}
        LIMIT 1`
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "User"
        WHERE (LOWER(TRIM("displayName")) = ${key} OR LOWER(TRIM(COALESCE("name", ''))) = ${key})
          AND ("passwordHash" != '' OR "email" IS NOT NULL OR "isGuest" = 1)
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
