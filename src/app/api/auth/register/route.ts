import { NextResponse } from 'next/server'
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
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'

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

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }
    if (!isValidPassword(password)) {
      return NextResponse.json(
        { error: passwordRequirementsHint() },
        { status: 400 }
      )
    }
    if (!displayName || displayName.length > 30) {
      return NextResponse.json({ error: 'Pseudo requis (30 caractères max)' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing?.passwordHash) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 })
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
            lastLoginAt: new Date(),
            lastSeenAt: new Date(),
          },
        })

    const token = await createSession(user.id)
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        accountCode: user.accountCode ?? accountCode,
        role: 'user' as const,
      },
    })
    response.cookies.set(sessionCookieOptions(token))
    response.cookies.set(clearLocalPlayCookieOptions())
    return response
  } catch (error) {
    console.error('register error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'inscription' }, { status: 500 })
  }
}
