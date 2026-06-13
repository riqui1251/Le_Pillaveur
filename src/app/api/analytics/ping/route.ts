import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  VISITOR_COOKIE,
  createVisitorId,
  getCurrentUser,
  visitorCookieOptions,
} from '@/lib/auth-server'
import { recordVisitorPing } from '@/lib/analytics-server'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { parseLocalPlayerNamesInput } from '@/lib/visitor-local-players'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    let visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    const { country, ip } = resolveGeoFromRequest(request)
    const currentUser = await getCurrentUser()

    let localPlayerNames: string[] | undefined
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json()
        localPlayerNames = parseLocalPlayerNamesInput(body?.localPlayerNames)
      } catch {
        /* corps vide ou invalide */
      }
    }

    const response = NextResponse.json({ ok: true })

    if (!visitorId) {
      visitorId = createVisitorId()
      response.cookies.set(visitorCookieOptions(visitorId))
    }

    await recordVisitorPing(visitorId, {
      country,
      ip,
      userId: currentUser?.id ?? null,
      localPlayerNames,
    })
    return response
  } catch (error) {
    console.error('analytics ping error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
