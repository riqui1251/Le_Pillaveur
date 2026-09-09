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
  // Pas de header « Link: …hreflang » automatique : son x-default pointait
  // vers l'URL SANS préfixe de langue et faisait indexer les doublons nus
  // (/regles/purple à côté de /fr/regles/purple). Les hreflang officiels
  // vivent dans le sitemap + les canonicals par page.
  alternateLinks: false,
})

const PUBLIC_PREFIXES = [
  '/compte',
  '/legal',
  // Écran TV : afficheur public d'une salle par code (aucun login requis).
  '/tv',
  // Vitrines publiques : indispensables au référencement (Googlebot n'a ni
  // session ni cookie mode local). Jouer reste derrière le choix de mode —
  // ces pages n'exposent que le catalogue et les règles.
  '/jeux',
  '/games',
  '/classement',
  '/regles',
  // Page de téléchargement de l'app mobile (liens stores) : publique.
  '/application',
  // Liens d'invitation partagés (aperçu OG + redirection vers /jeux?join=).
  '/invite',
  '/api/',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/icons',
  '/images',
]

/**
 * Premiers segments réellement servis par src/app/[locale] (publics comme
 * protégés). Sert UNIQUEMENT à distinguer « page protégée » de « page qui
 * n'existe pas » : la garde d'accès elle-même ne change pas. À tenir à jour
 * en même temps que les dossiers de src/app/[locale].
 */
const KNOWN_SEGMENTS = new Set([
  'achievements',
  'application',
  'classement',
  'compte',
  'games',
  'invite',
  'jeux',
  'joueurs',
  'legal',
  'online',
  'regles',
  'stats',
  'supervision',
  'test-colors',
  'tv',
])

function isPublicPath(pathname: string): boolean {
  const pathWithoutLocale = stripLocalePrefix(pathname)
  // Racine : la page d'accueil redirige elle-même vers /jeux (public).
  if (pathWithoutLocale === '/') return true
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

  // URL qui ne correspond à AUCUNE route du site : on laisse passer pour que
  // Next serve la 404 localisée. Sans ça, /fr/nimportequoi était redirigé vers
  // /compte comme une page protégée — un visiteur (et Googlebot) ne voyait
  // jamais la 404, et un lien mort ressemblait à un mur de connexion.
  const firstSegment = pathWithoutLocale.split('/')[1] ?? ''
  if (firstSegment && !KNOWN_SEGMENTS.has(firstSegment)) {
    return intlResponse
  }

  const url = request.nextUrl.clone()
  url.pathname = `/${locale}/compte`
  url.searchParams.set('redirect', pathWithoutLocale)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    // icon/apple-icon/opengraph-image/robots.txt/sitemap.xml : routes de
    // métadonnées générées (favicon PWA, SEO…) — jamais localisées, hors
    // middleware i18n.
    '/((?!api|_next/static|_next/image|icon|apple-icon|opengraph-image|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
