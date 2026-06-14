import { prisma } from '@/lib/prisma'

export const DISPLAY_NAME_MAX_LENGTH = 30

export function normalizeDisplayName(name: string): string {
  return name.trim()
}

export function displayNameKey(name: string): string {
  return normalizeDisplayName(name).toLowerCase()
}

export function isValidDisplayName(name: string): boolean {
  const normalized = normalizeDisplayName(name)
  return normalized.length > 0 && normalized.length <= DISPLAY_NAME_MAX_LENGTH
}

/** Comptes avec email + mot de passe (pseudo public unique, casse ignorée). */
export async function isDisplayNameTaken(
  displayName: string,
  excludeUserId?: string
): Promise<boolean> {
  const key = displayNameKey(displayName)
  if (!key) return false

  const rows = excludeUserId
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "User"
        WHERE LOWER(TRIM("displayName")) = ${key}
          AND "passwordHash" != ''
          AND "email" IS NOT NULL
          AND id != ${excludeUserId}
        LIMIT 1`
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "User"
        WHERE LOWER(TRIM("displayName")) = ${key}
          AND "passwordHash" != ''
          AND "email" IS NOT NULL
        LIMIT 1`

  return rows.length > 0
}

export const DISPLAY_NAME_TAKEN_ERROR = 'Ce pseudo est déjà utilisé'
