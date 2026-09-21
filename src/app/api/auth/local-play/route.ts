import { NextResponse } from 'next/server'
import { localPlayCookieOptions } from '@/lib/auth-server'
import { withApiRoute } from '@/lib/api-route'

export const POST = withApiRoute('auth/local-play POST', async () => {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(localPlayCookieOptions())
  return response
})
