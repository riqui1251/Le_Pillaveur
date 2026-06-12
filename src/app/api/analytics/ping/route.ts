import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  VISITOR_COOKIE,
  createVisitorId,
  getCurrentUser,
  visitorCookieOptions,
} from '@/lib/auth-server'
import { recordVisitorPing } from '@/lib/analytics-server'
import { getCountryFromRequest } from '@/lib/geo-server'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    let visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    const country = getCountryFromRequest(request)
    const currentUser = await getCurrentUser()

    const response = NextResponse.json({ ok: true })

    if (!visitorId) {
      visitorId = createVisitorId()
      response.cookies.set(visitorCookieOptions(visitorId))
    }

    await recordVisitorPing(visitorId, {
      country,
      userId: currentUser?.id ?? null,
    })
    return response
  } catch (error) {
    console.error('analytics ping error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
