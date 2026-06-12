import { NextResponse } from 'next/server'
import { localPlayCookieOptions } from '@/lib/auth-server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(localPlayCookieOptions())
  return response
}
