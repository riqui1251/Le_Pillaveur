import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  clearLocalPlayCookieOptions,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { GOOGLE_CLIENT_ID } from '@/lib/google-auth'
import { createUniqueAccountCode, ensureUserAccountCode } from '@/lib/account-code'
import { normalizeRole } from '@/lib/roles'
import { clearExpiredBanIfNeeded, getBanState } from '@/lib/ban-server'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { isAppLocale, localeCookieOptions, normalizeAppLocale } from '@/lib/locale-server'
import { getDisplayNameValidationError, isDisplayNameTaken, DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { linkVisitorNameModerationAttempts } from '@/lib/name-moderation-attempts-server'
import { VISITOR_COOKIE } from '@/lib/auth-cookies'

const GOOGLE_LIMIT = 15
const GOOGLE_WINDOW_MS = 15 * 60 * 1000

/**
 * Vérifie l'ID token Google côté serveur via l'endpoint tokeninfo (signature,
 * expiration et intégrité contrôlées par Google — pas besoin de valider le
 * JWT nous-mêmes). On re-vérifie ensuite l'audience et l'émetteur.
 */
type GoogleTokenClaims = {
  aud?: string
  iss?: string
  sub?: string
  email?: string
  email_verified?: string
  name?: string
  given_name?: string
}

async function verifyGoogleIdToken(credential: string): Promise<GoogleTokenClaims | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: controller.signal, cache: 'no-store' }
    )
    if (!res.ok) return null
    const claims = (await res.json()) as GoogleTokenClaims
    if (claims.aud !== GOOGLE_CLIENT_ID) return null
    if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') return null
    if (claims.email_verified !== 'true') return null
    if (!claims.email || !claims.sub) return null
    return claims
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

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

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const credential = typeof body.credential === 'string' ? body.credential : ''

    const rate = checkRateLimit(rateLimitKey(request, 'google-auth'), GOOGLE_LIMIT, GOOGLE_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    if (!credential) {
      return NextResponse.json({ error: 'Connexion Google invalide' }, { status: 400 })
    }

    const claims = await verifyGoogleIdToken(credential)
    if (!claims?.email) {
      return NextResponse.json({ error: 'Connexion Google invalide ou expirée' }, { status: 401 })
    }
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
    }

    await clearExpiredBanIfNeeded(user.id)
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } })
    const ban = getBanState(freshUser ?? user)
    if (ban.banned) {
      const until =
        ban.banType === 'temporary' && ban.bannedUntil
          ? ` jusqu'au ${ban.bannedUntil.toLocaleString('fr-FR')}`
          : ''
      return NextResponse.json(
        {
          error: `Compte suspendu${until}.${ban.banComment ? ` Motif : ${ban.banComment}` : ''}`,
        },
        { status: 403 }
      )
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

    const visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    if (visitorId) {
      await linkVisitorNameModerationAttempts(visitorId, user.id)
    }

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
    console.error('google auth error:', error)
    return NextResponse.json(
      { error: 'Service momentanément indisponible. Réessaie dans quelques instants.', code: 'service_unavailable' },
      { status: 503 }
    )
  }
}
