import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clearSessionCookieOptions, getCurrentUser, verifyPassword } from '@/lib/auth-server'
import { verifyGoogleIdToken } from '@/lib/google-auth-server'
import { deleteUserAccount } from '@/lib/user-activity-server'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

const DELETE_LIMIT = 5
const DELETE_WINDOW_MS = 60 * 60 * 1000

/**
 * Suppression de compte à l'initiative de l'utilisateur (droit à
 * l'effacement, art. 17 RGPD) — confirmée par mot de passe, ou par jeton
 * d'identité Google pour un compte sans mot de passe. Réutilise la même
 * routine que la suppression administrative (Supervision).
 *
 * POST { password }   → compte avec mot de passe
 * POST { credential } → compte Google (ID token GIS du MÊME email)
 */

type DeleteConfirmationMethod = 'password' | 'google' | 'session'

/** Moyen de confirmation exigé par ce compte, d'après ce qu'il porte en base. */
function confirmationMethod(user: {
  passwordHash: string
  email: string | null
  isGuest: boolean
}): DeleteConfirmationMethod {
  if (user.passwordHash) return 'password'
  // Compte Google : email mais pas de mot de passe. L'invité, lui, n'a ni
  // l'un ni l'autre — sa session est son seul moyen de preuve.
  if (!user.isGuest && user.email) return 'google'
  return 'session'
}

/**
 * Le formulaire doit savoir COMMENT confirmer avant de s'afficher (champ mot
 * de passe ou bouton Google) : le profil /api/auth/me n'expose pas la présence
 * d'un mot de passe. Cette sonde ne révèle rien de plus au titulaire de la
 * session que ce qu'il sait déjà de son propre compte.
 */
export const GET = withApiRoute('auth/delete-account GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, email: true, isGuest: true },
  })
  if (!dbUser) return apiError('auth_required', 401)
  return NextResponse.json({ method: confirmationMethod(dbUser) })
})

export const POST = withApiRoute('auth/delete-account POST', async (request: Request) => {
  try {
    const user = await getCurrentUser()
    if (!user) return apiError('auth_required', 401)

    const rate = checkRateLimit(rateLimitKey(request, 'delete-account', user.id), DELETE_LIMIT, DELETE_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    // Le compte fondateur ne se supprime pas depuis l'interface : c'est lui
    // qui porte l'administration du site (garde-fou contre une fausse manip).
    if (user.role === 'fondateur') return apiError('founder_protected', 403)

    const parsed = await readApiJson<{ password?: unknown; credential?: unknown }>(request)
    if (!parsed.ok) return parsed.response
    const password = typeof parsed.body.password === 'string' ? parsed.body.password : ''
    const credential = typeof parsed.body.credential === 'string' ? parsed.body.credential : ''

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true, email: true, isGuest: true },
    })
    if (!dbUser) return apiError('wrong_password', 403)

    // Même règle que la sonde GET : le client sait donc toujours quelle
    // preuve poster, et les deux ne peuvent pas diverger.
    const method = confirmationMethod(dbUser)
    if (method === 'password') {
      if (!(await verifyPassword(password, dbUser.passwordHash))) {
        return apiError('wrong_password', 403)
      }
    } else if (method === 'google') {
      // Compte Google (passwordHash vide) : la confirmation passe par un jeton
      // d'identité Google frais, dont l'email doit être celui du compte. Sans
      // cela ce compte ne pouvait JAMAIS être supprimé (RGPD art. 17).
      // (Un invité, lui, n'a ni email ni mot de passe : sa session est son seul
      // moyen de preuve, exiger plus lui interdirait d'effacer ses données.)
      const claims = credential ? await verifyGoogleIdToken(credential) : null
      const tokenEmail = claims?.email?.trim().toLowerCase() ?? ''
      if (!tokenEmail || tokenEmail !== (dbUser.email ?? '').trim().toLowerCase()) {
        return apiError('google_confirmation_required', 403)
      }
    }

    await deleteUserAccount(user.id)

    const response = NextResponse.json({ ok: true })
    response.cookies.set(clearSessionCookieOptions())
    return response
  } catch (error) {
    // 503 conservé : l'effacement touche beaucoup de tables, une panne en
    // cours de route se retente. Le journal ne garde que le nom de l'erreur —
    // un message Prisma recopierait l'e-mail de la ligne fautive (RGPD).
    console.error('[api] auth/delete-account POST', error instanceof Error ? error.name : typeof error)
    return apiError('service_unavailable', 503)
  }
})
