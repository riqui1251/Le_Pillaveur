import { NextResponse } from 'next/server'
import { AGE_VERIFIED_COOKIE, AGE_VERIFIED_MAX_AGE } from '@/lib/auth-cookies'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(AGE_VERIFIED_COOKIE, '1', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AGE_VERIFIED_MAX_AGE,
  })
  return response
}
