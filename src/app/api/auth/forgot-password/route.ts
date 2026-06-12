import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSessionToken,
  hashToken,
  isValidEmail,
} from '@/lib/auth-server'
import { sendPasswordResetEmail } from '@/lib/email'

const RESET_HOURS = 1

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    if (user?.passwordHash) {
      const token = createSessionToken()
      const tokenHash = hashToken(token)
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + RESET_HOURS)

      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      })

      try {
        await sendPasswordResetEmail(email, token)
      } catch (err) {
        console.error('forgot-password email error:', err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('forgot-password error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
