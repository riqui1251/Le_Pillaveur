import createIntlMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { LOCAL_PLAY_COOKIE, SESSION_COOKIE } from '@/lib/auth-cookies'
import { LOCALE_COOKIE, LOCALE_MAX_AGE } from '@/lib/locale-cookies'
import { routing, stripLocalePrefix } from '@/i18n/routing'

const intlMiddleware = createIntlMiddleware({
  ...routing,
  localeCookie: {
    name: LOCALE_COOKIE,
    maxAge: LOCALE_MAX_AGE,
  },
})

const PUBLIC_PREFIXES = [
  '/compte',
  '/legal',
  // Écran TV : afficheur public d'une salle par code (aucun login requis).
  '/tv',
  '/api/',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/icons',
  '/images',
]

function isPublicPath(pathname: string): boolean {
  const pathWithoutLocale = stripLocalePrefix(pathname)
  return PUBLIC_PREFIXES.some(
    (prefix) =>
      pathWithoutLocale === prefix || pathWithoutLocale.startsWith(prefix)
  )
}

function hasAccess(request: NextRequest): boolean {
  const session = request.cookies.get(SESSION_COOKIE)?.value
  const localPlay = request.cookies.get(LOCAL_PLAY_COOKIE)?.value
  return Boolean(session) || localPlay === '1'
}

function getLocaleFromPath(pathname: string): string {
  const segments = pathname.split('/')
  const maybeLocale = segments[1]
  if (routing.locales.includes(maybeLocale as (typeof routing.locales)[number])) {
    return maybeLocale
  }
  return routing.defaultLocale
}

export function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request)

  const pathname = request.nextUrl.pathname

  if (isPublicPath(pathname)) {
    return intlResponse
  }

  if (hasAccess(request)) {
    return intlResponse
  }

  const locale = getLocaleFromPath(pathname)
  const pathWithoutLocale = stripLocalePrefix(pathname)
  const url = request.nextUrl.clone()
  url.pathname = `/${locale}/compte`
  url.searchParams.set('redirect', pathWithoutLocale)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
