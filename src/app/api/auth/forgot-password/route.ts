import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSessionToken,
  hashToken,
  isValidEmail,
} from '@/lib/auth-server'
import { sendPasswordResetEmail } from '@/lib/email'
import {
  checkRateLimit,
  checkRateLimits,
  emailRateLimitKey,
  networkRateLimitKey,
  rateLimitKey,
  rateLimitResponse,
} from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

const RESET_HOURS = 1
const FORGOT_LIMIT = 5
const FORGOT_WINDOW_MS = 60 * 60 * 1000
// Par réseau (IPv4, ou /64 IPv6), toutes adresses confondues.
const FORGOT_NETWORK_LIMIT = 20
// Par adresse, quelle que soit l'IP : tourner les adresses IPv6 d'un /64 ne
// doit pas inonder une boîte de réception. Compté pour une adresse inconnue
// comme pour un compte : le refus ne dit rien de plus.
const FORGOT_ADDRESS_LIMIT = 3
// E-mails réellement envoyés, tous comptes confondus, comme les confirmations
// de rappel (reminder-server) : c'est le quota d'envoi et la réputation du
// domaine qui paieraient. Au-delà, la réponse reste la même, sans envoi.
const FORGOT_GLOBAL_SEND_LIMIT = 60

export const POST = withApiRoute('auth/forgot-password POST', async (request: Request) => {
  try {
    const parsed = await readApiJson<{ email?: unknown }>(request)
    if (!parsed.ok) return parsed.response
    const email =
      typeof parsed.body.email === 'string' ? parsed.body.email.trim().toLowerCase() : ''

    // Validée avant d'entrer dans une clé de quota : un « e-mail » de 8 Ko
    // n'occupe plus la mémoire du limiteur.
    if (!isValidEmail(email)) return apiError('invalid_email', 400)

    const rate = checkRateLimits([
      { key: rateLimitKey(request, 'forgot-password', email), limit: FORGOT_LIMIT, windowMs: FORGOT_WINDOW_MS },
      {
        key: networkRateLimitKey(request, 'forgot-password-network'),
        limit: FORGOT_NETWORK_LIMIT,
        windowMs: FORGOT_WINDOW_MS,
      },
      {
        key: emailRateLimitKey('forgot-password-address', email),
        limit: FORGOT_ADDRESS_LIMIT,
        windowMs: FORGOT_WINDOW_MS,
      },
    ])
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const user = await prisma.user.findUnique({ where: { email } })

    // Tout compte trouvé reçoit le lien, mot de passe défini ou non : c'est le
    // SEUL chemin pour qu'un compte Google (passwordHash vide) se donne un mot
    // de passe. La réponse reste neutre dans tous les cas.
    const canSend =
      user !== null &&
      checkRateLimit('forgot-password:global', FORGOT_GLOBAL_SEND_LIMIT, FORGOT_WINDOW_MS).ok
    if (user && !canSend) console.warn('[api] auth/forgot-password global send limit reached')
    if (user && canSend) {
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

      // Envoi NON attendu : la réponse partait après l'appel à Resend pour un
      // compte existant seulement, et ce délai disait quelles adresses ont un
      // compte. Jamais bloquant : le jeton existe, le joueur peut redemander.
      // Le journal ne garde que le nom de l'erreur — un message d'envoi
      // recopierait l'adresse du destinataire (RGPD).
      void sendPasswordResetEmail(email, token).catch((err: unknown) => {
        console.error('[api] auth/forgot-password mail', err instanceof Error ? err.name : typeof err)
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    // 503 conservé : la boîte d'envoi ou la base a flanché, pas la demande.
    console.error('[api] auth/forgot-password POST', error instanceof Error ? error.name : typeof error)
    return apiError('service_unavailable', 503)
  }
})
