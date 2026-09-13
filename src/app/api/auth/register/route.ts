import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  clearLocalPlayCookieOptions,
  deleteIncomingSession,
  hashPassword,
  isValidEmail,
  isValidPassword,
  passwordRequirementsHint,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { createUniqueAccountCode } from '@/lib/account-code'
import {
  displayNameTakenMessage,
  displayNameValidationMessage,
  getDisplayNameValidationError,
  isDisplayNameTaken,
} from '@/lib/display-name'
import { resolveRequestLocale } from '@/lib/name-moderation/request-locale'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { logRejectedNameOnServer } from '@/lib/name-moderation-attempt-log'
import { linkVisitorNameModerationAttempts } from '@/lib/name-moderation-attempts-server'
import { readConsentedVisitorId } from '@/lib/auth-cookies'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'
import { recordIpSeen } from '@/lib/ip-history-server'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { isAppLocale, localeCookieOptions, normalizeAppLocale } from '@/lib/locale-server'

const REGISTER_LIMIT = 5
const REGISTER_WINDOW_MS = 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''

    const rate = checkRateLimit(rateLimitKey(request, 'register', email), REGISTER_LIMIT, REGISTER_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const cookieStore = await cookies()
    const bodyLocale = typeof body.locale === 'string' && isAppLocale(body.locale) ? body.locale : null
    const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
    const requestLocale = await resolveRequestLocale({
      bodyLocale,
      userLocale: bodyLocale ?? cookieLocale,
    })
    const initialLocale = normalizeAppLocale(bodyLocale ?? cookieLocale)

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    }
    if (!isValidPassword(password)) {
      return NextResponse.json(
        { error: passwordRequirementsHint() },
        { status: 400 }
      )
    }
    await ensureServerModerationTermsLoaded()

    const displayNameError = getDisplayNameValidationError(displayName)
    if (displayNameError) {
      if (displayNameError === 'profanity') {
        await logRejectedNameOnServer(request, {
          attemptedName: displayName,
          reason: displayNameError,
          context: 'register',
        })
      }
      return NextResponse.json(
        {
          error: displayNameValidationMessage(displayName, requestLocale),
          code: displayNameError,
        },
        { status: 400 }
      )
    }

    // Un email déjà connu bloque l'inscription QUEL QUE SOIT son passwordHash :
    // un compte Google a un hash vide, et le reprendre ici reviendrait à en
    // prendre le contrôle avec la seule connaissance de l'adresse. Le chemin
    // légitime pour lui donner un mot de passe est « mot de passe oublié ».
    // Message volontairement neutre : il ne distingue pas un email pris d'un
    // email libre (pas d'énumération d'adresses).
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      return NextResponse.json(
        {
          error:
            "Inscription impossible avec ces informations. Si tu as déjà un compte, connecte-toi ou utilise « Mot de passe oublié ».",
          code: 'registration_refused',
        },
        { status: 409 }
      )
    }

    if (await isDisplayNameTaken(displayName)) {
      return NextResponse.json(
        { error: displayNameTakenMessage(requestLocale), code: 'display_name_taken' },
        { status: 409 }
      )
    }

    const passwordHash = await hashPassword(password)
    const accountCode = await createUniqueAccountCode()

    // Uniquement une CRÉATION : plus aucun écrasement d'un compte existant.
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName,
        name: displayName,
        accountCode,
        playMode: 'local',
        locale: initialLocale,
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
      },
    })

    // Réseau de création (anti-abus : comptes en série depuis un même réseau).
    // Un navigateur l'enverrait au premier battement ; un compte créé par
    // script, sans JavaScript, n'en envoie jamais. Même collecte qu'une
    // connexion (IP, pays, appareil des connexions, déjà déclarés). Jamais
    // bloquant : le compte existe, une trace manquée ne doit pas le faire échouer.
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
      console.error('register network trace error:', error)
    }

    // Tentatives de pseudo du navigateur : lp_vid sous l'accord courant seulement.
    const visitorId = readConsentedVisitorId(cookieStore)
    if (visitorId) {
      await linkVisitorNameModerationAttempts(visitorId, user.id)
    }

    const token = await createSession(user.id)
    // Inscription depuis une autre session (invité compris) : l'ancienne
    // ligne est supprimée, pas seulement son cookie écrasé — une fois la
    // nouvelle session créée, pour qu'un 503 ne déconnecte jamais.
    await deleteIncomingSession()
    const userLocale = normalizeAppLocale(user.locale)
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        onlineDisplayName:
          typeof user.name === 'string' && user.name.trim().length > 0 && user.name.trim() !== user.displayName
            ? user.name.trim()
            : null,
        accountCode: user.accountCode ?? accountCode,
        role: 'user' as const,
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
    console.error('register error:', error)
    return NextResponse.json(
      { error: 'Service momentanément indisponible. Réessaie dans quelques instants.', code: 'service_unavailable' },
      { status: 503 }
    )
  }
}
