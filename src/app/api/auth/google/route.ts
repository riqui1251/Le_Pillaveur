import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  clearLocalPlayCookieOptions,
  deleteIncomingSession,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { verifyGoogleIdToken } from '@/lib/google-auth-server'
import { createUniqueAccountCode, ensureUserAccountCode } from '@/lib/account-code'
import { normalizeRole } from '@/lib/roles'
import { clearExpiredBanIfNeeded, getBanState } from '@/lib/ban-server'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'
import { recordIpSeen } from '@/lib/ip-history-server'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { isAppLocale, localeCookieOptions, normalizeAppLocale } from '@/lib/locale-server'
import { getDisplayNameValidationError, isDisplayNameTaken, DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { linkVisitorNameModerationAttempts } from '@/lib/name-moderation-attempts-server'
import { readConsentedVisitorId } from '@/lib/auth-cookies'

const GOOGLE_LIMIT = 15
const GOOGLE_WINDOW_MS = 15 * 60 * 1000

/**
 * Fabrique un pseudo disponible à partir du prénom Google : on tente le nom
 * tel quel, puis avec un suffixe numérique, avant un repli neutre. Le pseudo
 * reste modifiable ensuite depuis la page Compte.
 */
async function pickAvailableDisplayName(preferred: string): Promise<string> {
  const base = preferred.trim().slice(0, DISPLAY_NAME_MAX_LENGTH).trim()
  const candidates: string[] = []
  if (base) {
    candidates.push(base)
    for (let i = 0; i < 3; i++) {
      const suffix = String(Math.floor(10 + Math.random() * 90))
      candidates.push(`${base.slice(0, DISPLAY_NAME_MAX_LENGTH - suffix.length)}${suffix}`)
    }
  }
  for (let i = 0; i < 5; i++) {
    candidates.push(`Joueur${Math.floor(1000 + Math.random() * 9000)}`)
  }
  for (const candidate of candidates) {
    if (getDisplayNameValidationError(candidate)) continue
    if (await isDisplayNameTaken(candidate)) continue
    return candidate
  }
  // Dernier recours : un identifiant quasi unique (validation garantie).
  return `Joueur${Date.now() % 100000}`
}

export const POST = withApiRoute('auth/google POST', async (request: Request) => {
  try {
    const parsed = await readApiJson<{ credential?: unknown; locale?: unknown }>(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body
    const credential = typeof body.credential === 'string' ? body.credential : ''

    const rate = checkRateLimit(rateLimitKey(request, 'google-auth'), GOOGLE_LIMIT, GOOGLE_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    if (!credential) return apiError('google_credential_required', 400)

    const claims = await verifyGoogleIdToken(credential)
    if (!claims?.email) return apiError('google_invalid', 401)
    const email = claims.email.trim().toLowerCase()

    const cookieStore = await cookies()
    const bodyLocale = typeof body.locale === 'string' && isAppLocale(body.locale) ? body.locale : null
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
    const initialLocale = normalizeAppLocale(bodyLocale ?? cookieLocale)

    let user = await prisma.user.findUnique({ where: { email } })
    let createdNow = false

    if (!user) {
      await ensureServerModerationTermsLoaded()
      const displayName = await pickAvailableDisplayName(
        claims.given_name || claims.name || email.split('@')[0]
      )
      const accountCode = await createUniqueAccountCode()
      user = await prisma.user.create({
        data: {
          email,
          // Pas de mot de passe : la connexion passe par Google (un mot de
          // passe pourra être défini plus tard via « mot de passe oublié »).
          passwordHash: '',
          displayName,
          name: displayName,
          accountCode,
          playMode: 'local',
          locale: initialLocale,
          lastLoginAt: new Date(),
          lastSeenAt: new Date(),
        },
      })
      createdNow = true

      // Réseau de création (anti-abus : comptes en série depuis un même
      // réseau). Une connexion l'écrit plus bas ; une création passait à côté
      // jusqu'au premier battement, qu'un script sans JavaScript n'envoie
      // jamais. Même collecte qu'une connexion (IP, pays, appareil, déjà
      // déclarés), plus l'historique d'IP du compte. Jamais bloquant : le
      // compte existe, une trace manquée ne doit pas le faire échouer.
      try {
        const { country, ip } = resolveGeoFromRequest(request)
        const device = deviceKindFromHeader(request)
        await prisma.user.update({
          where: { id: user.id },
          data: {
            ...(country ? { lastCountry: country } : {}),
            ...(ip ? { lastIp: ip } : {}),
            ...(device !== 'unknown' ? { lastDevice: device } : {}),
          },
        })
        await recordIpSeen(user.id, '', ip, country)
      } catch (error) {
        console.error('[api] auth/google trace', error instanceof Error ? error.name : typeof error)
      }
    }

    await clearExpiredBanIfNeeded(user.id)
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } })
    const ban = getBanState(freshUser ?? user)
    if (ban.banned) {
      // Même refus qu'à la connexion par mot de passe : un code traduisible,
      // l'échéance et le motif à part plutôt qu'une phrase française cousue.
      return apiError('account_suspended', 403, {
        bannedUntil: ban.banType === 'temporary' && ban.bannedUntil ? ban.bannedUntil.toISOString() : null,
        banComment: ban.banComment ?? null,
      })
    }

    if (!createdNow) {
      const now = new Date()
      const { country, ip } = resolveGeoFromRequest(request)
      const device = deviceKindFromHeader(request)
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: now,
          lastSeenAt: now,
          ...(country ? { lastCountry: country } : {}),
          ...(ip ? { lastIp: ip } : {}),
          ...(device !== 'unknown' ? { lastDevice: device } : {}),
        },
      })
    }

    const token = await createSession(user.id)
    const role = normalizeRole(user.role)
    const accountCode = user.accountCode ?? (await ensureUserAccountCode(user.id))

    // Tentatives de pseudo du navigateur : lp_vid sous l'accord courant seulement.
    const visitorId = readConsentedVisitorId(cookieStore)
    if (visitorId) {
      await linkVisitorNameModerationAttempts(visitorId, user.id)
    }

    // Connexion par-dessus une autre session (invité compris) : l'ancienne
    // ligne est supprimée, pas seulement son cookie écrasé. En dernier, après
    // toutes les écritures qui peuvent lever : un 503 (sans cookie) ne doit
    // jamais laisser le navigateur sur une session déjà supprimée.
    await deleteIncomingSession()

    const userLocale = normalizeAppLocale(freshUser?.locale ?? user.locale)

    const response = NextResponse.json({
      created: createdNow,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        onlineDisplayName:
          typeof user.name === 'string' && user.name.trim().length > 0 && user.name.trim() !== user.displayName
            ? user.name.trim()
            : null,
        accountCode,
        role,
        locale: userLocale,
        playMode: user.playMode === 'online' ? 'online' : 'local',
        ambianceMode: user.ambianceMode === 'soft' ? 'soft' : 'alcool',
      },
    })
    response.cookies.set(sessionCookieOptions(token))
    response.cookies.set(clearLocalPlayCookieOptions())
    response.cookies.set(localeCookieOptions(userLocale))
    return response
  } catch (error) {
    // 503 conservé : la vérification du jeton dépend d'un service tiers.
    console.error('[api] auth/google POST', error instanceof Error ? error.name : typeof error)
    return apiError('service_unavailable', 503)
  }
})
