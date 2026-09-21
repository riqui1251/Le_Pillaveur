import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSessionToken,
  hashToken,
  isValidEmail,
} from '@/lib/auth-server'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

const RESET_HOURS = 1
const FORGOT_LIMIT = 5
const FORGOT_WINDOW_MS = 60 * 60 * 1000

export const POST = withApiRoute('auth/forgot-password POST', async (request: Request) => {
  try {
    const parsed = await readApiJson<{ email?: unknown }>(request)
    if (!parsed.ok) return parsed.response
    const email =
      typeof parsed.body.email === 'string' ? parsed.body.email.trim().toLowerCase() : ''

    const rate = checkRateLimit(rateLimitKey(request, 'forgot-password', email), FORGOT_LIMIT, FORGOT_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    if (!isValidEmail(email)) return apiError('invalid_email', 400)

    const user = await prisma.user.findUnique({ where: { email } })

    // Tout compte trouvé reçoit le lien, mot de passe défini ou non : c'est le
    // SEUL chemin pour qu'un compte Google (passwordHash vide) se donne un mot
    // de passe. La réponse reste neutre dans tous les cas.
    if (user) {
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
        // L'envoi d'e-mail n'est jamais bloquant : le jeton existe, le joueur
        // peut redemander. Le journal ne garde que le nom de l'erreur — un
        // message d'envoi recopierait l'adresse du destinataire (RGPD).
        console.error('[api] auth/forgot-password mail', err instanceof Error ? err.name : typeof err)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    // 503 conservé : la boîte d'envoi ou la base a flanché, pas la demande.
    console.error('[api] auth/forgot-password POST', error instanceof Error ? error.name : typeof error)
    return apiError('service_unavailable', 503)
  }
})
