import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import {
  GUEST_SESSION_DAYS,
  createSession,
  clearLocalPlayCookieOptions,
  deleteIncomingSession,
  getCurrentUser,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { createUniqueAccountCode } from '@/lib/account-code'
import {
  displayNameTakenMessage,
  displayNameValidationMessage,
  getDisplayNameValidationError,
  isDisplayNameTaken,
  DISPLAY_NAME_MAX_LENGTH,
} from '@/lib/display-name'
import { resolveRequestLocale } from '@/lib/name-moderation/request-locale'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { logRejectedNameOnServer } from '@/lib/name-moderation-attempt-log'
import { linkVisitorNameModerationAttempts } from '@/lib/name-moderation-attempts-server'
import { VISITOR_COOKIE } from '@/lib/auth-server'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { AGE_VERIFIED_COOKIE } from '@/lib/auth-cookies'
import { isAppLocale, localeCookieOptions, normalizeAppLocale } from '@/lib/locale-server'

const GUEST_LIMIT = 8
const GUEST_WINDOW_MS = 60 * 60 * 1000

/**
 * Compte INVITÉ : créé quand quelqu'un veut jouer tout de suite, sans
 * inscription — en rejoignant une table par son code ou son QR (JoinGate), ou
 * par « Essayer avec des bots » depuis une page de jeu ou de règles
 * (TryBotsGate). Un vrai User (le online exige un userId)
 * mais sans email ni mot de passe, marqué isGuest et en mode online d'office ;
 * purgé automatiquement après inactivité par le retention sweep.
 *
 * Session et cookie de 91 jours glissants (GUEST_SESSION_DAYS) : le cookie est
 * la seule clé du compte.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const requested = typeof body.displayName === 'string' ? body.displayName.trim() : ''

    const rate = checkRateLimit(rateLimitKey(request, 'guest'), GUEST_LIMIT, GUEST_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const cookieStore = await cookies()

    // Porte d'âge côté serveur : un compte ne se crée qu'après la déclaration
    // 18+ (cookie posé par /api/legal/accept-age, portail et bandeau). Les
    // pages de lecture (/regles) n'affichent pas le portail : c'est au client
    // de le présenter sur ce code, puis de réessayer.
    if (!cookieStore.has(AGE_VERIFIED_COOKIE)) {
      return NextResponse.json(
        { error: 'age_gate_required', code: 'age_gate_required' },
        { status: 403 }
      )
    }

    // Déjà une session valide (incident passager de /me côté client, double
    // clic) : pas de second compte, qui rendrait le premier orphelin. On
    // renvoie le compte en place, même forme de réponse que /api/auth/me.
    const currentUser = await getCurrentUser()
    if (currentUser) {
      return NextResponse.json({ user: currentUser, alreadySignedIn: true })
    }

    const bodyLocale = typeof body.locale === 'string' && isAppLocale(body.locale) ? body.locale : null
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
    const requestLocale = await resolveRequestLocale({
      bodyLocale,
      userLocale: bodyLocale ?? cookieLocale,
    })
    const initialLocale = normalizeAppLocale(bodyLocale ?? cookieLocale)

    await ensureServerModerationTermsLoaded()

    const displayNameError = getDisplayNameValidationError(requested)
    if (displayNameError) {
      if (displayNameError === 'profanity') {
        await logRejectedNameOnServer(request, {
          attemptedName: requested,
          reason: displayNameError,
          context: 'guest',
        })
      }
      return NextResponse.json(
        {
          error: displayNameValidationMessage(requested, requestLocale),
          code: displayNameError,
        },
        { status: 400 }
      )
    }

    // Pseudo pris ? On tente des variantes suffixées avant de renvoyer
    // l'erreur — un invité ne doit pas buter sur « Kevin est déjà pris ».
    let displayName: string | null = null
    const candidates = [requested]
    for (let i = 0; i < 3; i++) {
      const suffix = String(Math.floor(10 + Math.random() * 90))
      candidates.push(`${requested.slice(0, DISPLAY_NAME_MAX_LENGTH - suffix.length)}${suffix}`)
    }
    for (const candidate of candidates) {
      if (getDisplayNameValidationError(candidate)) continue
      if (await isDisplayNameTaken(candidate)) continue
      displayName = candidate
      break
    }
    if (!displayName) {
      return NextResponse.json(
        { error: displayNameTakenMessage(requestLocale), code: 'display_name_taken' },
        { status: 409 }
      )
    }

    const accountCode = await createUniqueAccountCode()
    const user = await prisma.user.create({
      data: {
        isGuest: true,
        displayName,
        name: displayName,
        accountCode,
        playMode: 'online',
        locale: initialLocale,
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
      },
    })

    const visitorId = cookieStore.get(VISITOR_COOKIE)?.value
    if (visitorId) {
      await linkVisitorNameModerationAttempts(visitorId, user.id)
    }

    const token = await createSession(user.id, GUEST_SESSION_DAYS)
    // Cookie présent mais session invalide : on nettoie sa ligne éventuelle
    // (compte legacy), une fois la nouvelle posée — même ordre que login.
    await deleteIncomingSession()
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: null,
        displayName: user.displayName,
        onlineDisplayName: null,
        accountCode,
        role: 'user' as const,
        locale: initialLocale,
        playMode: 'online' as const,
        ambianceMode: user.ambianceMode === 'soft' ? 'soft' : 'alcool',
        isGuest: true,
      },
    })
    response.cookies.set(sessionCookieOptions(token, GUEST_SESSION_DAYS))
    response.cookies.set(clearLocalPlayCookieOptions())
    response.cookies.set(localeCookieOptions(initialLocale))
    return response
  } catch (error) {
    console.error('guest auth error:', error)
    return NextResponse.json(
      { error: 'Service momentanément indisponible. Réessaie dans quelques instants.', code: 'service_unavailable' },
      { status: 503 }
    )
  }
}
