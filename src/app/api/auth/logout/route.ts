import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { SESSION_COOKIE, clearSessionCookieOptions, deleteSession } from '@/lib/auth-server'
import { withApiRoute } from '@/lib/api-route'

export const POST = withApiRoute('auth/logout POST', async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) await deleteSession(token)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(clearSessionCookieOptions())
  return response
})
