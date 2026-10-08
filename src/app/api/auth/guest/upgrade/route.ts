import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  deleteIncomingSession,
  getCurrentUser,
  hashPassword,
  isValidEmail,
  isValidPassword,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { verifyGoogleIdToken } from '@/lib/google-auth-server'
import { normalizeRole } from '@/lib/roles'
import { normalizeAppLocale } from '@/lib/locale-server'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

const UPGRADE_LIMIT = 8
const UPGRADE_WINDOW_MS = 60 * 60 * 1000

/**
 * PÉRENNISATION d'un compte invité — le joueur GARDE son compte (id, pseudo,
 * XP, cosmétiques, amis, historique) : on lui attache simplement un moyen de
 * connexion durable, ce qui le sort de la purge automatique des invités.
 *
 * POST { email, password }  → email + mot de passe classiques
 * POST { credential }       → liaison Google (ID token GIS)
 */
export const POST = withApiRoute('auth/guest/upgrade POST', async (request: Request) => {
  try {
    const user = await getCurrentUser()
    if (!user) return apiError('auth_required', 401)
    if (!user.isGuest) return apiError('not_guest', 400)

    const rate = checkRateLimit(rateLimitKey(request, 'guest-upgrade', user.id), UPGRADE_LIMIT, UPGRADE_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const parsed = await readApiJson<{
      credential?: unknown
      email?: unknown
      password?: unknown
    }>(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body
    const credential = typeof body.credential === 'string' ? body.credential : ''

    let email = ''
    let passwordHash = ''

    if (credential) {
      // ── Liaison Google ────────────────────────────────────────────────────
      const claims = await verifyGoogleIdToken(credential)
      if (!claims?.email) return apiError('google_invalid', 401)
      email = claims.email.trim().toLowerCase()
      // Pas de mot de passe : la connexion passera par Google (définissable
      // plus tard via « mot de passe oublié »).
      passwordHash = ''
    } else {
      // ── Email + mot de passe ──────────────────────────────────────────────
      email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!isValidEmail(email)) return apiError('invalid_email', 400)
      if (!isValidPassword(password)) return apiError('invalid_password', 400)
      passwordHash = await hashPassword(password)
    }

    // L'email ne doit appartenir à AUCUN autre compte (pas de fusion de
    // comptes : le joueur garde celui-ci, l'autre resterait orphelin) — et
    // surtout, sans ce garde-fou on s'emparerait d'un compte existant (dont un
    // compte Google au passwordHash vide) en le « pérennisant » depuis un
    // invité. Message neutre : il ne dit pas si l'adresse est déjà prise.
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing && existing.id !== user.id) return apiError('email_taken', 409)

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        // Liaison Google : aucun mot de passe à enregistrer — on n'écrit donc
        // pas de hash vide (il se définira via « mot de passe oublié »).
        ...(passwordHash ? { passwordHash } : {}),
        // Liaison Google : adresse vérifiée par Google (le rappel par e-mail
        // l'exige, reminder-server). Une adresse saisie à la main, elle, ne
        // prouve rien tant qu'elle n'a pas été confirmée.
        ...(credential ? { emailVerified: new Date() } : {}),
        isGuest: false,
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
      },
    })

    // Plus un invité : sa session d'invité (91 jours) laisse place à une
    // session de compte (30 jours glissants, la durée annoncée), avec un
    // NOUVEAU jeton maintenant qu'un identifiant durable y est attaché.
    // Nouvelle session d'abord, ancienne ensuite. Le compte est déjà
    // pérennisé à ce stade : un échec ici ne fait pas échouer la réponse (un
    // nouvel essai répondrait « déjà enregistré »), l'ancienne session reste
    // simplement valable.
    let token: string | null = null
    try {
      token = await createSession(updated.id)
      await deleteIncomingSession()
    } catch (error) {
      console.error('[api] auth/guest/upgrade rotate', error instanceof Error ? error.name : typeof error)
    }

    const response = NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        onlineDisplayName:
          typeof updated.name === 'string' &&
          updated.name.trim().length > 0 &&
          updated.name.trim() !== updated.displayName
            ? updated.name.trim()
            : null,
        accountCode: updated.accountCode,
        role: normalizeRole(updated.role),
        locale: normalizeAppLocale(updated.locale),
        playMode: updated.playMode === 'online' ? 'online' : 'local',
        ambianceMode: updated.ambianceMode === 'soft' ? 'soft' : 'alcool',
        isGuest: false,
      },
    })
    if (token) response.cookies.set(sessionCookieOptions(token))
    return response
  } catch (error) {
    // 503 conservé : le compte invité est intact, le joueur peut réessayer.
    console.error('[api] auth/guest/upgrade POST', error instanceof Error ? error.name : typeof error)
    return apiError('service_unavailable', 503)
  }
})
