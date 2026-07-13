import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clearSessionCookieOptions, getCurrentUser, verifyPassword } from '@/lib/auth-server'
import { deleteUserAccount } from '@/lib/user-activity-server'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'

const DELETE_LIMIT = 5
const DELETE_WINDOW_MS = 60 * 60 * 1000

/**
 * Suppression de compte à l'initiative de l'utilisateur (droit à
 * l'effacement, art. 17 RGPD) — confirmée par mot de passe. Réutilise la
 * même routine que la suppression administrative (Supervision).
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }

    const rate = checkRateLimit(rateLimitKey(request, 'delete-account', user.id), DELETE_LIMIT, DELETE_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    // Le compte fondateur ne se supprime pas depuis l'interface : c'est lui
    // qui porte l'administration du site (garde-fou contre une fausse manip).
    if (user.role === 'fondateur') {
      return NextResponse.json({ error: 'founder_protected', code: 'founder_protected' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const password = typeof body.password === 'string' ? body.password : ''

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    })
    if (!dbUser?.passwordHash || !(await verifyPassword(password, dbUser.passwordHash))) {
      return NextResponse.json({ error: 'wrong_password', code: 'wrong_password' }, { status: 403 })
    }

    await deleteUserAccount(user.id)

    const response = NextResponse.json({ ok: true })
    response.cookies.set(clearSessionCookieOptions())
    return response
  } catch (error) {
    console.error('delete account error:', error)
    return NextResponse.json({ error: 'Service momentanément indisponible' }, { status: 503 })
  }
}
