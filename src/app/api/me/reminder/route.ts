import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { getReminderStatus, optInReminder, optOutReminder } from '@/lib/reminder-server'
import { checkRateLimit, userRateLimitKey } from '@/lib/rate-limit'
import { apiError, withApiRoute } from '@/lib/api-route'

export const dynamic = 'force-dynamic'

/**
 * RAPPEL DU VENDREDI — l'accord du compte connecté (src/lib/reminder-server.ts).
 *
 * - GET : { status: 'on' | 'off' | 'pending' | 'unavailable' } —
 *   'unavailable' quand l'envoi d'e-mails n'est pas configuré sur ce serveur,
 *   pour un invité ou un compte sans adresse : la carte et l'interrupteur
 *   disparaissent plutôt que de promettre un e-mail qui ne partira pas ;
 *   'pending' : e-mail de confirmation envoyé, pas encore confirmé ;
 * - POST : demande l'accord. Adresse prouvée (compte Google, ou adresse déjà
 *   confirmée) : accord posé → 'on'. Sinon double opt-in : e-mail de
 *   confirmation → 'pending' (rien n'est accordé avant le clic). 200
 *   { status: 'unavailable' } si l'envoi n'est pas configuré ; 429 si le
 *   plafond d'e-mails de confirmation est atteint ; 503 si l'envoi a échoué ;
 * - DELETE : retire l'accord, idempotent.
 *
 * L'accord vient TOUJOURS d'un geste explicite (bouton de la carte de fin de
 * partie, interrupteur de la page Compte) : cette route n'est appelée par
 * aucun autre écran.
 */

/**
 * Quota des écritures, par COMPTE : un interrupteur qu'on fait basculer à la
 * main ne dépasse pas quelques gestes par minute. Le plafond coupe un script
 * qui ferait écrire la ligne User en boucle (une connexion SQLite partagée).
 * Les e-mails de confirmation ont en plus leur propre délai (un par jour et
 * par compte, reminder-server).
 */
const WRITE_LIMIT = 10
const WINDOW_MS = 60_000

export const GET = withApiRoute('me/reminder GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)
  return NextResponse.json({ status: await getReminderStatus(user.id) })
})

export const POST = withApiRoute('me/reminder POST', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)
  // Refus avant toute lecture : un invité n'a pas d'adresse où écrire.
  if (user.isGuest || !user.email) return apiError('forbidden', 403, { reason: 'email_required' })

  const rate = checkRateLimit(userRateLimitKey('reminder-toggle', user.id), WRITE_LIMIT, WINDOW_MS)
  if (!rate.ok) return apiError('rate_limited', 429, { retryAfterSec: rate.retryAfterSec })

  let result: Awaited<ReturnType<typeof optInReminder>>
  try {
    result = await optInReminder(user.id)
  } catch {
    // E-mail de confirmation refusé (journalisé sans adresse par reminder-server).
    return apiError('service_unavailable', 503)
  }
  if ('retryAfterSec' in result) return apiError('rate_limited', 429, { retryAfterSec: result.retryAfterSec })
  return NextResponse.json({ status: result.status })
})

export const DELETE = withApiRoute('me/reminder DELETE', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const rate = checkRateLimit(userRateLimitKey('reminder-toggle', user.id), WRITE_LIMIT, WINDOW_MS)
  if (!rate.ok) return apiError('rate_limited', 429, { retryAfterSec: rate.retryAfterSec })

  // Ouvert à tous les comptes, invités compris : retirer un accord ne doit
  // jamais être refusé (une ligne déjà à null n'est simplement pas touchée).
  await optOutReminder(user.id)
  return NextResponse.json({ status: user.isGuest || !user.email ? 'unavailable' : 'off' })
})
