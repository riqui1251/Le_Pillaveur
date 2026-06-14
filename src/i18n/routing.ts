import { defineRouting } from 'next-intl/routing'

export const locales = ['fr', 'en', 'es', 'it'] as const
export type AppLocale = (typeof locales)[number]

export const routing = defineRouting({
  locales,
  defaultLocale: 'fr',
  localePrefix: 'always',
})

export const localeLabels: Record<AppLocale, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  it: 'Italiano',
}

export const localeFlags: Record<AppLocale, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
  es: '🇪🇸',
  it: '🇮🇹',
}

/** Strip locale prefix from pathname: /fr/jeux → /jeux */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/')
  const maybeLocale = segments[1]
  if (locales.includes(maybeLocale as AppLocale)) {
    const rest = segments.slice(2).join('/')
    return rest ? `/${rest}` : '/'
  }
  return pathname
}
