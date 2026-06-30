import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  clearLocalPlayCookieOptions,
  isValidEmail,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth-server'
import { ensureUserAccountCode } from '@/lib/account-code'
import { normalizeRole } from '@/lib/roles'
import { clearExpiredBanIfNeeded, getBanState } from '@/lib/ban-server'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { localeCookieOptions, normalizeAppLocale } from '@/lib/locale-server'
import { cookies } from 'next/headers'
import { linkVisitorNameModerationAttempts } from '@/lib/name-moderation-attempts-server'
import { VISITOR_COOKIE } from '@/lib/auth-cookies'

const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const rate = checkRateLimit(rateLimitKey(request, 'login', email), LOGIN_LIMIT, LOGIN_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
    }

    await clearExpiredBanIfNeeded(user.id)
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } })
    const ban = getBanState(freshUser ?? user)
    if (ban.banned) {
      const until =
        ban.banType === 'temporary' && ban.bannedUntil
          ? ` jusqu'au ${ban.bannedUntil.toLocaleString('fr-FR')}`
          : ''
      return NextResponse.json(
        {
          error: `Compte suspendu${until}.${ban.banComment ? ` Motif : ${ban.banComment}` : ''}`,
        },
        { status: 403 }
      )
    }

    const now = new Date()
    const { country, ip } = resolveGeoFromRequest(request)
    const device = deviceKindFromHeader(request)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastSeenAt: now,
        ...(country ? { lastCountry: country } : {}),
        ...(ip ? { lastIp: ip } : {}),
        ...(device !== 'unknown' ? { lastDevice: device } : {}),
      },
    })

    const token = await createSession(user.id)
    const role = normalizeRole(user.role)
    const accountCode = user.accountCode ?? (await ensureUserAccountCode(user.id))

    const cookieStore = await cookies()
    const visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    if (visitorId) {
      await linkVisitorNameModerationAttempts(visitorId, user.id)
    }

    const userLocale = normalizeAppLocale(freshUser?.locale ?? user.locale)

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        onlineDisplayName:
          typeof user.name === 'string' && user.name.trim().length > 0 && user.name.trim() !== user.displayName
            ? user.name.trim()
            : null,
        accountCode,
        role,
        locale: userLocale,
        playMode: user.playMode === 'online' ? 'online' : 'local',
      },
    })
    response.cookies.set(sessionCookieOptions(token))
    response.cookies.set(clearLocalPlayCookieOptions())
    response.cookies.set(localeCookieOptions(userLocale))
    return response
  } catch (error) {
    console.error('login error:', error)
    return NextResponse.json(
      { error: 'Service momentanément indisponible. Réessaie dans quelques instants.', code: 'service_unavailable' },
      { status: 503 }
    )
  }
}
