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
import { checkRateLimit, networkRateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { AGE_VERIFIED_COOKIE, readConsentedVisitorId } from '@/lib/auth-cookies'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'
import { recordIpSeen } from '@/lib/ip-history-server'
import { isAppLocale, localeCookieOptions, normalizeAppLocale } from '@/lib/locale-server'
import { parseRequestedAmbianceMode } from '@/lib/ambiance-mode'

// Quota de création d'invités par RÉSEAU (networkRateLimitKey : IPv4 entière,
// IPv6 ramenée à son /64), pas par adresse : le réseau, c'est la tablée —
// derrière une box IPv4 tous les téléphones sortent avec la même adresse ; en
// IPv6 chacun a la sienne dans le même /64. 40 par heure : une salle accueille
// jusqu'à 16 joueurs, deux tablées peuvent partager le Wi-Fi d'un bar, et
// chaque essai compte (pseudo refusé, double clic). L'ancienne limite de 8 par
// adresse renvoyait un 429 à la neuvième personne d'une même tablée, et aux
// inconnus regroupés derrière le CGNAT d'un opérateur mobile.
const GUEST_LIMIT = 40
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
export const POST = withApiRoute('auth/guest POST', async (request: Request) => {
  try {
    const parsed = await readApiJson<{ displayName?: unknown; locale?: unknown; ambianceMode?: unknown }>(request)
    if (!parsed.ok) return parsed.response
    const body = parsed.body
    const requested = typeof body.displayName === 'string' ? body.displayName.trim() : ''

    const rate = checkRateLimit(networkRateLimitKey(request, 'guest'), GUEST_LIMIT, GUEST_WINDOW_MS)
    if (!rate.ok) return rateLimitResponse(rate.retryAfterSec)

    const cookieStore = await cookies()

    // Porte d'âge côté serveur : un compte ne se crée qu'après la déclaration
    // 18+ (cookie posé par /api/legal/accept-age, portail et bandeau). Les
    // pages de lecture (/regles) n'affichent pas le portail : c'est au client
    // de le présenter sur ce code, puis de réessayer.
    // Forme inchangée (`error` ET `code` valent age_gate_required) : JoinGate
    // et TryBotsGate la reconnaissent pour ouvrir le portail sur place.
    if (!cookieStore.has(AGE_VERIFIED_COOKIE)) return apiError('age_gate_required', 403)

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
      // Refus de pseudo : `error` garde une phrase, mais elle est DÉJÀ rendue
      // dans la langue de la requête (requestLocale) et dit ce qui cloche —
      // un code générique perdrait ce détail. `code` porte la raison.
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

    // Ambiance de l'appareil (« Sans alcool » d'office dans l'app) : lue ici,
    // à la création seulement — la session déjà en place, renvoyée plus haut,
    // garde son réglage. Valeur inconnue : défaut du schéma.
    const ambianceMode = parseRequestedAmbianceMode(body.ambianceMode)
    const accountCode = await createUniqueAccountCode()
    const user = await prisma.user.create({
      data: {
        isGuest: true,
        displayName,
        name: displayName,
        accountCode,
        playMode: 'online',
        locale: initialLocale,
        ...(ambianceMode ? { ambianceMode } : {}),
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
      },
    })

    // Réseau de création : « combien d'invités depuis le même réseau en une
    // heure ? » est le signal de multi-compte le plus simple pour un site à QR
    // code. Un navigateur l'enverrait au premier battement ; un invité créé par
    // script, sans JavaScript, n'en envoie jamais. Même collecte qu'une
    // connexion (IP, pays, appareil, déjà déclarés). Jamais bloquant : le
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
      console.error('[api] auth/guest trace', error instanceof Error ? error.name : typeof error)
    }

    // Tentatives de pseudo du navigateur : lp_vid sous l'accord courant seulement.
    const visitorId = readConsentedVisitorId(cookieStore)
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
    // 503 conservé : la porte d'entrée sans inscription doit dire « réessaie »,
    // pas « erreur serveur ».
    console.error('[api] auth/guest POST', error instanceof Error ? error.name : typeof error)
    return apiError('service_unavailable', 503)
  }
})
