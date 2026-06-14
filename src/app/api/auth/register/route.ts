import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  clearLocalPlayCookieOptions,
  hashPassword,
  isValidEmail,
  isValidPassword,
  passwordRequirementsHint,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { createUniqueAccountCode } from '@/lib/account-code'
import {
  displayNameTakenMessage,
  displayNameValidationMessage,
  getDisplayNameValidationError,
  isDisplayNameTaken,
} from '@/lib/display-name'
import { resolveRequestLocale } from '@/lib/name-moderation/request-locale'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { logRejectedNameOnServer } from '@/lib/name-moderation-attempt-log'
import { linkVisitorNameModerationAttempts } from '@/lib/name-moderation-attempts-server'
import { VISITOR_COOKIE } from '@/lib/auth-server'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { isAppLocale, localeCookieOptions, normalizeAppLocale } from '@/lib/locale-server'

const REGISTER_LIMIT = 5
const REGISTER_WINDOW_MS = 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''

    const rate = checkRateLimit(rateLimitKey(request, 'register', email), REGISTER_LIMIT, REGISTER_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const cookieStore = await cookies()
    const bodyLocale = typeof body.locale === 'string' && isAppLocale(body.locale) ? body.locale : null
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
    const requestLocale = await resolveRequestLocale({
      bodyLocale,
      userLocale: bodyLocale ?? cookieLocale,
    })
    const initialLocale = normalizeAppLocale(bodyLocale ?? cookieLocale)

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }
    if (!isValidPassword(password)) {
      return NextResponse.json(
        { error: passwordRequirementsHint() },
        { status: 400 }
      )
    }
    await ensureServerModerationTermsLoaded()

    const displayNameError = getDisplayNameValidationError(displayName)
    if (displayNameError) {
      if (displayNameError === 'profanity') {
        await logRejectedNameOnServer(request, {
          attemptedName: displayName,
          reason: displayNameError,
          context: 'register',
        })
      }
      return NextResponse.json(
        {
          error: displayNameValidationMessage(displayName, requestLocale),
          code: displayNameError,
        },
        { status: 400 }
      )
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing?.passwordHash) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
    }

    if (await isDisplayNameTaken(displayName, existing?.id)) {
      return NextResponse.json(
        { error: displayNameTakenMessage(requestLocale), code: 'display_name_taken' },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(password)
    const accountCode = existing?.accountCode ?? (await createUniqueAccountCode())

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            email,
            passwordHash,
            displayName,
            name: displayName,
            accountCode,
            locale: initialLocale,
            lastLoginAt: new Date(),
            lastSeenAt: new Date(),
          },
        })
      : await prisma.user.create({
          data: {
            email,
            passwordHash,
            displayName,
            name: displayName,
            accountCode,
            playMode: 'local',
            locale: initialLocale,
            lastLoginAt: new Date(),
            lastSeenAt: new Date(),
          },
        })

    const visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    if (visitorId) {
      await linkVisitorNameModerationAttempts(visitorId, user.id)
    }

    const token = await createSession(user.id)
    const userLocale = normalizeAppLocale(user.locale)
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        accountCode: user.accountCode ?? accountCode,
        role: 'user' as const,
        locale: userLocale,
      },
    })
    response.cookies.set(sessionCookieOptions(token))
    response.cookies.set(clearLocalPlayCookieOptions())
    response.cookies.set(localeCookieOptions(userLocale))
    return response
  } catch (error) {
    console.error('register error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'inscription' }, { status: 500 })
  }
}
