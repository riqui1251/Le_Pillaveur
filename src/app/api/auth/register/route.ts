import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  hashPassword,
  isValidEmail,
  isValidPassword,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { createUniqueAccountCode } from '@/lib/account-code'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }
    if (!isValidPassword(password)) {
      return NextResponse.json({ error: 'Mot de passe : 8 caractères minimum' }, { status: 400 })
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
          data: { email, passwordHash, displayName, name: displayName, accountCode },
        })
      : await prisma.user.create({
          data: {
            email,
            passwordHash,
            displayName,
            name: displayName,
            accountCode,
            playMode: 'local',
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
    return response
  } catch (error) {
    console.error('register error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'inscription' }, { status: 500 })
  }
}
