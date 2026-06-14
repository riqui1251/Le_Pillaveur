import { LOCALE_COOKIE, LOCALE_MAX_AGE } from '@/lib/locale-cookies'
import { locales, type AppLocale } from '@/i18n/routing'

export function isAppLocale(value: string): value is AppLocale {
  return locales.includes(value as AppLocale)
}

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  if (value && isAppLocale(value)) return value
  return 'fr'
}

export function localeCookieOptions(locale: AppLocale) {
  return {
    name: LOCALE_COOKIE,
    value: locale,
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: LOCALE_MAX_AGE,
  }
}
