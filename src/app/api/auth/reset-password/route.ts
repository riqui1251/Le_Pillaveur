import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  hashPassword,
  hashToken,
  isValidPassword,
  revokeAllUserSessions,
} from '@/lib/auth-server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!token) {
      return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 400 })
    }
    if (!isValidPassword(password)) {
      return NextResponse.json({ error: 'Mot de passe : 8 caractères minimum' }, { status: 400 })
    }

    const tokenHash = hashToken(token)
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    })

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          id: { not: resetToken.id },
        },
      }),
    ])

    await revokeAllUserSessions(resetToken.userId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('reset-password error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
