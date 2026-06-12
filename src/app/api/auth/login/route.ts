import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  isValidEmail,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth-server'
import { ensureUserAccountCode } from '@/lib/account-code'
import { normalizeRole } from '@/lib/roles'
import { clearExpiredBanIfNeeded, getBanState } from '@/lib/ban-server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

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
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, lastSeenAt: now },
    })

    const token = await createSession(user.id)
    const role = normalizeRole(user.role)
    const accountCode = user.accountCode ?? (await ensureUserAccountCode(user.id))

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        accountCode,
        role,
      },
    })
    response.cookies.set(sessionCookieOptions(token))
    return response
  } catch (error) {
    console.error('login error:', error)
    return NextResponse.json({ error: 'Erreur de connexion' }, { status: 500 })
  }
}
