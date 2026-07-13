import { NextResponse } from 'next/server'
import {
  AGE_VERIFIED_COOKIE,
  AGE_VERIFIED_MAX_AGE,
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_MAX_AGE,
  VISITOR_COOKIE,
} from '@/lib/auth-cookies'

export async function POST(request: Request) {
  let analytics = false
  try {
    const body = await request.json()
    analytics = body?.analytics === true
  } catch {
    // Corps vide (ancien client) : refus par défaut, le consentement ne se présume pas.
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(AGE_VERIFIED_COOKIE, '1', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AGE_VERIFIED_MAX_AGE,
  })
  response.cookies.set(ANALYTICS_CONSENT_COOKIE, analytics ? '1' : '0', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ANALYTICS_CONSENT_MAX_AGE,
  })
  if (!analytics) {
    // Refus : on retire aussi l'identifiant visiteur déjà posé, sinon le
    // suivi continuerait avec un cookie hérité d'avant le choix.
    response.cookies.delete(VISITOR_COOKIE)
  }
  return response
}
