import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  hashPassword,
  hashToken,
  isValidPassword,
  revokeAllUserSessions,
} from '@/lib/auth-server'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

export const POST = withApiRoute('auth/reset-password POST', async (request: Request) => {
  const parsed = await readApiJson<{ token?: unknown; password?: unknown }>(request)
  if (!parsed.ok) return parsed.response
  const token = typeof parsed.body.token === 'string' ? parsed.body.token.trim() : ''
  const password = typeof parsed.body.password === 'string' ? parsed.body.password : ''

  if (!token) return apiError('invalid_reset_token', 400)
  if (!isValidPassword(password)) return apiError('invalid_password', 400)

  const tokenHash = hashToken(token)
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  // Jeton inconnu, déjà consommé ou périmé : même refus dans les trois cas.
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return apiError('invalid_reset_token', 400)
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
})
