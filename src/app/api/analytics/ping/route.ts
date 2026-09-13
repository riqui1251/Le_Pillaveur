import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  VISITOR_COOKIE,
  createVisitorId,
  getCurrentSession,
  renewSessionIfStale,
  sessionCookieOptions,
  visitorCookieOptions,
} from '@/lib/auth-server'
import { ANALYTICS_CONSENT_COOKIE } from '@/lib/auth-cookies'
import { recordAccountPresence, recordVisitorPing } from '@/lib/analytics-server'
import { runRetentionSweep } from '@/lib/retention-sweep'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'
import { parseLocalPlayerNamesInput } from '@/lib/visitor-local-players'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    let visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    const hasConsent = cookieStore.get(ANALYTICS_CONSENT_COOKIE)?.value === '1'
    const { country, ip } = resolveGeoFromRequest(request)
    const device = deviceKindFromHeader(request)
    const session = await getCurrentSession()
    const currentUser = session?.user ?? null

    // Session glissante (au plus une écriture par jour) : appliquée juste avant
    // CHACUNE des deux réponses, avec ou sans consentement — le cookie de
    // session est strictement nécessaire. En dernier, pour qu'une erreur des
    // écritures précédentes (→ 500 sans cookie) ne laisse jamais une base
    // prolongée derrière un cookie qui expire quand même.
    const withRenewedSession = async (response: NextResponse) => {
      const days = session ? await renewSessionIfStale(session) : null
      if (session && days) response.cookies.set(sessionCookieOptions(session.token, days))
      return response
    }

    // Ménage RGPD au passage (throttlé) : purge des données au-delà des
    // durées annoncées dans la politique de confidentialité.
    void runRetentionSweep()

    // Sans consentement analytics (art. 82 loi I&L) : aucun suivi visiteur.
    // Pour un compte connecté, seule la présence côté compte est mise à jour
    // (sécurité/modération — intérêt légitime, déclaré dans la politique).
    if (!hasConsent) {
      if (currentUser) {
        await recordAccountPresence(currentUser.id, { country, ip, device })
      }
      return await withRenewedSession(NextResponse.json({ ok: true }))
    }

    let localPlayerNames: string[] | undefined
    let forceLocalPlayerSync = false
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json()
        localPlayerNames = parseLocalPlayerNamesInput(body?.localPlayerNames)
        forceLocalPlayerSync = body?.syncLocalPlayers === true
      } catch {
        /* corps vide ou invalide */
      }
    }

    const response = NextResponse.json({ ok: true })

    if (!visitorId) {
      visitorId = createVisitorId()
      response.cookies.set(visitorCookieOptions(visitorId))
    }

    await recordVisitorPing(visitorId, {
      country,
      ip,
      userId: currentUser?.id ?? null,
      localPlayerNames,
      forceLocalPlayerSync,
      device,
    })
    return await withRenewedSession(response)
  } catch (error) {
    console.error('analytics ping error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
