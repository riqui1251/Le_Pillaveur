import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { LOCAL_PLAY_COOKIE, SESSION_COOKIE } from '@/lib/auth-cookies'

const PUBLIC_PREFIXES = [
  '/compte',
  '/api/',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/icons',
  '/images',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  )
}

function hasAccess(request: NextRequest): boolean {
  const session = request.cookies.get(SESSION_COOKIE)?.value
  const localPlay = request.cookies.get(LOCAL_PLAY_COOKIE)?.value
  return Boolean(session) || localPlay === '1'
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  if (hasAccess(request)) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/compte'
  url.searchParams.set('redirect', pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
