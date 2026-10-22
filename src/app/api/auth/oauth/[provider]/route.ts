import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { isAppLocale, normalizeAppLocale } from '@/lib/locale-utils'
import { parseRequestedAmbianceMode } from '@/lib/ambiance-mode'
import { safeAuthRedirect } from '@/lib/auth-redirect'
import { isOAuthIntent, isOAuthProvider } from '@/lib/oauth'
import {
  newOAuthStateToken,
  oauthAuthorizeUrl,
  oauthCredentials,
  oauthStateCookieOptions,
} from '@/lib/oauth-server'

const START_LIMIT = 30
const START_WINDOW_MS = 15 * 60 * 1000

/**
 * ALLER du flux Discord / Facebook / Apple : pose l'état anti-rejeu (cookie) et
 * renvoie l'adresse du fournisseur, que le client ouvre lui-même.
 *
 * POST et non lien GET : une suppression de compte ne doit pas pouvoir se
 * déclencher depuis un lien d'un autre site. Le cookie de session (Lax)
 * n'accompagne pas un POST venu d'ailleurs : `upgrade` et `delete`, qui
 * exigent la session, ne partent donc que de nos pages.
 *
 * POST { intent?, redirect?, locale?, ambianceMode? } → { url }
 */
export const POST = withApiRoute(
  'auth/oauth/[provider] POST',
  async (request: Request, { params }: { params: Promise<{ provider: string }> }) => {
    const { provider } = await params
    if (!isOAuthProvider(provider)) return apiError('not_found', 404)
    const creds = oauthCredentials(provider)
    if (!creds) return apiError('oauth_unavailable', 503)

    const rate = checkRateLimit(rateLimitKey(request, 'oauth-start'), START_LIMIT, START_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const parsed = await readApiJson<{
      intent?: unknown
      redirect?: unknown
      locale?: unknown
      ambianceMode?: unknown
    }>(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body
    const intent = isOAuthIntent(body.intent) ? body.intent : 'login'

    let userId: string | null = null
    if (intent !== 'login') {
      const user = await getCurrentUser()
      if (!user) return apiError('auth_required', 401)
      if (intent === 'upgrade' && !user.isGuest) return apiError('not_guest', 400)
      if (intent === 'delete') {
        if (user.role === 'fondateur') return apiError('founder_protected', 403)
        const linked = await prisma.oAuthAccount.findFirst({
          where: { userId: user.id, provider },
          select: { id: true },
        })
        if (!linked) return apiError('oauth_not_linked', 403)
        // Même règle que delete-account : un mot de passe, s'il existe, est la preuve exigée.
        const owner = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
        if (!owner || owner.passwordHash) return apiError('wrong_password', 403)
      }
      userId = user.id
    }

    const cookieStore = await cookies()
    const locale =
      typeof body.locale === 'string' && isAppLocale(body.locale)
        ? body.locale
        : normalizeAppLocale(cookieStore.get(LOCALE_COOKIE)?.value)
    const state = newOAuthStateToken()

    const response = NextResponse.json({ url: oauthAuthorizeUrl(provider, creds.clientId, state, intent) })
    response.cookies.set(
      oauthStateCookieOptions({
        state,
        provider,
        intent,
        redirect: safeAuthRedirect(typeof body.redirect === 'string' ? body.redirect : null),
        locale,
        ambianceMode: parseRequestedAmbianceMode(body.ambianceMode),
        userId,
      })
    )
    return response
  }
)
