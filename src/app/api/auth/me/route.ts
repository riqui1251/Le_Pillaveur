import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  SESSION_COOKIE,
  alignedSessionCookieOptions,
  clearSessionCookieOptions,
  getCurrentSession,
  renewSessionIfStale,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { withApiRoute } from '@/lib/api-route'

export const GET = withApiRoute('auth/me GET', async () => {
  const session = await getCurrentSession()
  if (!session) {
    const response = NextResponse.json({ user: null }, { status: 401 })
    // Cookie présent mais session invalide (expirée, purgée, compte banni) :
    // on l'efface, sinon le middleware continue de croire à une session.
    // Une panne de base lève avant d'arriver ici (500) : le cookie est gardé.
    const cookieStore = await cookies()
    if (cookieStore.get(SESSION_COOKIE)?.value) {
      response.cookies.set(clearSessionCookieOptions())
    }
    return response
  }

  // Appelée à chaque chargement complet (AuthProvider) : second point de
  // renouvellement de la session glissante, si le ping est bloqué.
  const response = NextResponse.json({ user: session.user })
  const renewedDays = await renewSessionIfStale(session)
  if (renewedDays) {
    response.cookies.set(sessionCookieOptions(session.token, renewedDays))
  } else {
    // Rien à prolonger : le cookie est quand même recalé sur l'échéance en
    // base (sans écriture), au cas où la réponse d'un renouvellement précédent
    // se serait perdue en route.
    const aligned = alignedSessionCookieOptions(session)
    if (aligned) response.cookies.set(aligned)
  }
  return response
})
