import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getCurrentUser,
  hashPassword,
  isValidEmail,
  isValidPassword,
  passwordRequirementsHint,
} from '@/lib/auth-server'
import { verifyGoogleIdToken } from '@/lib/google-auth-server'
import { normalizeRole } from '@/lib/roles'
import { normalizeAppLocale } from '@/lib/locale-server'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'

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
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }
    if (!user.isGuest) {
      return NextResponse.json(
        { error: 'Ce compte est déjà enregistré', code: 'not_guest' },
        { status: 400 }
      )
    }

    const rate = checkRateLimit(rateLimitKey(request, 'guest-upgrade', user.id), UPGRADE_LIMIT, UPGRADE_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const body = await request.json().catch(() => ({}))
    const credential = typeof body.credential === 'string' ? body.credential : ''

    let email = ''
    let passwordHash = ''

    if (credential) {
      // ── Liaison Google ────────────────────────────────────────────────────
      const claims = await verifyGoogleIdToken(credential)
      if (!claims?.email) {
        return NextResponse.json({ error: 'Connexion Google invalide ou expirée' }, { status: 401 })
      }
      email = claims.email.trim().toLowerCase()
      // Pas de mot de passe : la connexion passera par Google (définissable
      // plus tard via « mot de passe oublié »).
      passwordHash = ''
    } else {
      // ── Email + mot de passe ──────────────────────────────────────────────
      email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
      }
      if (!isValidPassword(password)) {
        return NextResponse.json({ error: passwordRequirementsHint() }, { status: 400 })
      }
      passwordHash = await hashPassword(password)
    }

    // L'email ne doit appartenir à AUCUN autre compte (pas de fusion de
    // comptes : le joueur garde celui-ci, l'autre resterait orphelin).
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        { error: 'Cet email est déjà utilisé par un autre compte', code: 'email_taken' },
        { status: 409 }
      )
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        passwordHash,
        isGuest: false,
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
      },
    })

    return NextResponse.json({
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
  } catch (error) {
    console.error('guest upgrade error:', error)
    return NextResponse.json(
      { error: 'Service momentanément indisponible. Réessaie dans quelques instants.', code: 'service_unavailable' },
      { status: 503 }
    )
  }
}
