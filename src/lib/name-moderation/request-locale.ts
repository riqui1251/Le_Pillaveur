import { getLocaleFromCookie } from '@/lib/locale-server'
import { isAppLocale, normalizeAppLocale } from '@/lib/locale-utils'
import type { AppLocale } from '@/i18n/routing'

export async function resolveRequestLocale(options?: {
  bodyLocale?: unknown
  userLocale?: string | null
}): Promise<AppLocale> {
  if (typeof options?.bodyLocale === 'string' && isAppLocale(options.bodyLocale)) {
    return normalizeAppLocale(options.bodyLocale)
  }
  if (options?.userLocale) {
    return normalizeAppLocale(options.userLocale)
  }
  return getLocaleFromCookie()
}
