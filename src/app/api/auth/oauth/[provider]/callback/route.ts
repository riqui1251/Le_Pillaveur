import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import {
  clearLocalPlayCookieOptions,
  clearSessionCookieOptions,
  createSession,
  deleteIncomingSession,
  getCurrentUser,
  sessionCookieOptions,
} from '@/lib/auth-server'
import { createUniqueAccountCode } from '@/lib/account-code'
import { clearExpiredBanIfNeeded, getBanState } from '@/lib/ban-server'
import { resolveGeoFromRequest } from '@/lib/geo-server'
import { deviceKindFromHeader } from '@/lib/device-from-user-agent'
import { recordIpSeen } from '@/lib/ip-history-server'
import { checkRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { apiError, withApiRoute } from '@/lib/api-route'
import { appBaseUrl } from '@/lib/email'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { localeCookieOptions, normalizeAppLocale } from '@/lib/locale-utils'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { linkVisitorNameModerationAttempts } from '@/lib/name-moderation-attempts-server'
import { readConsentedVisitorId } from '@/lib/auth-cookies'
import { pickAvailableDisplayName } from '@/lib/social-display-name-server'
import { deleteUserAccount } from '@/lib/user-activity-server'
import { impliesOnlineMode } from '@/lib/auth-redirect'
import { isOAuthProvider, oauthErrorParam, type OAuthIntent, type OAuthProvider } from '@/lib/oauth'
import type { OnlineErrorCode } from '@/lib/online-errors'
import {
  OAUTH_NAME_COOKIE,
  OAUTH_STATE_COOKIE,
  clearOAuthNameCookieOptions,
  clearOAuthStateCookieOptions,
  decodeOAuthState,
  fetchOAuthProfile,
  oauthCredentials,
  oauthNameCookieOptions,
  readOAuthNameCookie,
  type OAuthProfile,
  type OAuthState,
} from '@/lib/oauth-server'

const CALLBACK_LIMIT = 20
const CALLBACK_WINDOW_MS = 15 * 60 * 1000
// Même plafond que POST /api/auth/delete-account.
const DELETE_LIMIT = 5
const DELETE_WINDOW_MS = 60 * 60 * 1000

/**
 * RETOUR du flux Discord / Facebook / Apple (voir POST /api/auth/oauth/[provider]).
 * Navigation de premier niveau : chaque issue est une REDIRECTION, un refus
 * revient à /compte avec son code dans l'URL (oauthErrorParam), traduit là.
 */

function redirectTo(path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, appBaseUrl()), 303)
  response.cookies.set(clearOAuthStateCookieOptions())
  response.cookies.set(clearOAuthNameCookieOptions())
  return response
}

/** /compte, en gardant la destination d'une connexion pour pouvoir réessayer. */
function accountPath(locale: string, intent: OAuthIntent, saved: OAuthState | null, error?: OnlineErrorCode): string {
  const params = new URLSearchParams()
  if (intent === 'login' && saved && saved.redirect !== '/joueurs') params.set('redirect', saved.redirect)
  if (error) params.set(oauthErrorParam(intent), error)
  const query = params.toString()
  return `/${locale}/compte${query ? `?${query}` : ''}`
}

const linkKey = (provider: OAuthProvider, profile: OAuthProfile) => ({
  provider_providerAccountId: { provider, providerAccountId: profile.id },
})

export const GET = withApiRoute(
  'auth/oauth/[provider]/callback GET',
  async (request: Request, { params }: { params: Promise<{ provider: string }> }) => {
    const { provider } = await params
    const url = new URL(request.url)
    const cookieStore = await cookies()
    const saved = decodeOAuthState(cookieStore.get(OAUTH_STATE_COOKIE)?.value)
    const intent: OAuthIntent = saved?.intent ?? 'login'
    const locale = saved?.locale ?? normalizeAppLocale(cookieStore.get(LOCALE_COOKIE)?.value)
    const fail = (code: OnlineErrorCode) => redirectTo(accountPath(locale, intent, saved, code))

    // Sans l'état de l'aller (cookie expiré, autre navigateur) ou s'il ne
    // correspond pas, le code reçu n'est pas le nôtre : rien n'est échangé.
    if (
      !isOAuthProvider(provider) ||
      !saved ||
      saved.provider !== provider ||
      url.searchParams.get('state') !== saved.state
    ) {
      return fail('oauth_failed')
    }

    // Fenêtre du fournisseur refermée ou accès refusé : simple retour.
    if (url.searchParams.has('error')) return redirectTo(accountPath(locale, intent, saved))

    const creds = oauthCredentials(provider)
    if (!creds) return fail('oauth_unavailable')

    const rate = checkRateLimit(rateLimitKey(request, 'oauth-callback'), CALLBACK_LIMIT, CALLBACK_WINDOW_MS)
    if (!rate.ok) return fail('rate_limited')

    const code = url.searchParams.get('code') ?? ''
    try {
      const fetched = code ? await fetchOAuthProfile(provider, code, creds) : null
      if (!fetched) return fail('oauth_failed')
      const profile = { ...fetched, name: fetched.name || readOAuthNameCookie(cookieStore.get(OAUTH_NAME_COOKIE)?.value) }

      if (saved.intent === 'upgrade') return await upgradeGuest(provider, profile, saved, fail)
      if (saved.intent === 'delete') return await deleteAccount(request, provider, profile, saved, fail)
      return await signIn(request, provider, profile, saved, fail)
    } catch (error) {
      console.error('[api] auth/oauth/callback', provider, error instanceof Error ? error.name : typeof error)
      return fail('service_unavailable')
    }
  }
)

/**
 * Retour d'Apple : un POST venu d'appleid.apple.com (`form_post`, imposé dès
 * qu'on demande le nom ou l'e-mail). Un POST d'un autre site n'emporte pas
 * nos cookies Lax — ni l'état de l'aller, ni la session —, alors qu'une
 * navigation GET de premier niveau les emporte : on le reformule en GET vers
 * cette même adresse. Le prénom, transmis à la première autorisation
 * seulement, passe par un cookie plutôt que par l'URL.
 */
export const POST = withApiRoute(
  'auth/oauth/[provider]/callback POST',
  async (request: Request, { params }: { params: Promise<{ provider: string }> }) => {
    const { provider } = await params
    if (provider !== 'apple') return apiError('not_found', 404)
    const form = await request.formData().catch(() => null)
    const query = new URLSearchParams()
    for (const key of ['code', 'state', 'error']) {
      const value = form?.get(key)
      if (typeof value === 'string' && value) query.set(key, value.slice(0, 2048))
    }
    const response = NextResponse.redirect(new URL(`/api/auth/oauth/apple/callback?${query}`, appBaseUrl()), 303)
    const firstName = appleFirstName(form?.get('user'))
    if (firstName) response.cookies.set(oauthNameCookieOptions(firstName))
    return response
  }
)

/** `user` du POST d'Apple : {"name":{"firstName","lastName"},"email"}, à la première autorisation. */
function appleFirstName(raw: FormDataEntryValue | null | undefined): string {
  if (typeof raw !== 'string') return ''
  try {
    const user = JSON.parse(raw) as { name?: { firstName?: unknown } }
    return typeof user.name?.firstName === 'string' ? user.name.firstName.trim().slice(0, 60) : ''
  } catch {
    return ''
  }
}

type Fail = (code: OnlineErrorCode) => NextResponse

/**
 * Connexion. Le lien (fournisseur, identifiant) retrouve le compte ; à
 * défaut, l'adresse CONFIRMÉE chez le fournisseur retrouve le compte qui la
 * porte (créé par mot de passe ou Google) et l'y lie, ou crée le compte.
 */
async function signIn(
  request: Request,
  provider: OAuthProvider,
  profile: OAuthProfile,
  saved: OAuthState,
  fail: Fail
): Promise<NextResponse> {
  const linked = await prisma.oAuthAccount.findUnique({ where: linkKey(provider, profile), include: { user: true } })
  let user = linked?.user ?? null
  let created = false

  if (!user) {
    if (!profile.email) return fail('oauth_email_required')
    if (!profile.emailVerified) return fail('oauth_email_unverified')
    user = await prisma.user.findUnique({ where: { email: profile.email } })
    if (!user) {
      await ensureServerModerationTermsLoaded()
      const displayName = await pickAvailableDisplayName(profile.name || profile.email.split('@')[0])
      const now = new Date()
      user = await prisma.user.create({
        data: {
          email: profile.email,
          // Pas de mot de passe : la connexion passe par le fournisseur (un
          // mot de passe pourra être défini plus tard via « mot de passe oublié »).
          passwordHash: '',
          emailVerified: now,
          displayName,
          name: displayName,
          accountCode: await createUniqueAccountCode(),
          // Le formulaire de connexion pose ce mode côté client après une
          // création Google ; ici le serveur redirige lui-même.
          playMode: impliesOnlineMode(saved.redirect) ? 'online' : 'local',
          locale: saved.locale,
          ...(saved.ambianceMode ? { ambianceMode: saved.ambianceMode } : {}),
          lastLoginAt: now,
          lastSeenAt: now,
        },
      })
      created = true
      await recordCreationNetwork(request, user.id)
    }
    await prisma.oAuthAccount.upsert({
      where: linkKey(provider, profile),
      create: { userId: user.id, provider, providerAccountId: profile.id },
      update: {},
    })
  }

  await clearExpiredBanIfNeeded(user.id)
  const freshUser = (await prisma.user.findUnique({ where: { id: user.id } })) ?? user
  if (getBanState(freshUser).banned) return fail('account_suspended')

  if (!created) {
    const now = new Date()
    const { country, ip } = resolveGeoFromRequest(request)
    const device = deviceKindFromHeader(request)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: now,
        lastSeenAt: now,
        // Adresse du compte reconfirmée par le fournisseur : posée une fois.
        ...(!freshUser.emailVerified && profile.emailVerified && profile.email === freshUser.email
          ? { emailVerified: now }
          : {}),
        ...(country ? { lastCountry: country } : {}),
        ...(ip ? { lastIp: ip } : {}),
        ...(device !== 'unknown' ? { lastDevice: device } : {}),
      },
    })
  }

  const token = await createSession(user.id)

  const visitorId = readConsentedVisitorId(await cookies())
  if (visitorId) await linkVisitorNameModerationAttempts(visitorId, user.id)

  // En dernier, comme /api/auth/google : une erreur plus haut ne doit jamais
  // laisser le navigateur sur une session déjà supprimée.
  await deleteIncomingSession()

  const userLocale = normalizeAppLocale(freshUser.locale)
  const response = redirectTo(`/${userLocale}${saved.redirect}`)
  response.cookies.set(sessionCookieOptions(token))
  response.cookies.set(clearLocalPlayCookieOptions())
  response.cookies.set(localeCookieOptions(userLocale))
  return response
}

/**
 * Réseau de création (anti-abus), comme /api/auth/google : jamais bloquant,
 * le compte existe déjà.
 */
async function recordCreationNetwork(request: Request, userId: string): Promise<void> {
  try {
    const { country, ip } = resolveGeoFromRequest(request)
    const device = deviceKindFromHeader(request)
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(country ? { lastCountry: country } : {}),
        ...(ip ? { lastIp: ip } : {}),
        ...(device !== 'unknown' ? { lastDevice: device } : {}),
      },
    })
    await recordIpSeen(userId, '', ip, country)
  } catch (error) {
    console.error('[api] auth/oauth/callback trace', error instanceof Error ? error.name : typeof error)
  }
}

/**
 * Pérennisation de l'INVITÉ qui a lancé l'aller : il garde son compte et
 * reçoit l'adresse confirmée du fournisseur, mêmes garde-fous que
 * /api/auth/guest/upgrade (aucune adresse ni identité déjà prise ailleurs).
 */
async function upgradeGuest(
  provider: OAuthProvider,
  profile: OAuthProfile,
  saved: OAuthState,
  fail: Fail
): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user || user.id !== saved.userId) return fail('auth_required')
  if (!user.isGuest) return fail('not_guest')
  if (!profile.email) return fail('oauth_email_required')
  if (!profile.emailVerified) return fail('oauth_email_unverified')

  const [linked, emailOwner] = await Promise.all([
    prisma.oAuthAccount.findUnique({ where: linkKey(provider, profile), select: { userId: true } }),
    prisma.user.findUnique({ where: { email: profile.email }, select: { id: true } }),
  ])
  if ((linked && linked.userId !== user.id) || (emailOwner && emailOwner.id !== user.id)) {
    return fail('email_taken')
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { email: profile.email, emailVerified: now, isGuest: false, lastLoginAt: now, lastSeenAt: now },
    }),
    prisma.oAuthAccount.upsert({
      where: linkKey(provider, profile),
      create: { userId: user.id, provider, providerAccountId: profile.id },
      update: {},
    }),
  ])

  // Session de compte (30 jours glissants) à la place de celle d'invité.
  // Le compte est déjà pérennisé : un échec ici laisse l'ancienne valable.
  let token: string | null = null
  try {
    token = await createSession(user.id)
    await deleteIncomingSession()
  } catch (error) {
    console.error('[api] auth/oauth/callback rotate', error instanceof Error ? error.name : typeof error)
  }

  const response = redirectTo(`/${saved.locale}/compte?guestSaved=1`)
  if (token) response.cookies.set(sessionCookieOptions(token))
  return response
}

/**
 * Suppression confirmée par le fournisseur : l'identité renvoyée doit être
 * liée au compte connecté qui a lancé l'aller. Même routine que
 * /api/auth/delete-account (droit à l'effacement).
 */
async function deleteAccount(
  request: Request,
  provider: OAuthProvider,
  profile: OAuthProfile,
  saved: OAuthState,
  fail: Fail
): Promise<NextResponse> {
  const user = await getCurrentUser()
  if (!user || user.id !== saved.userId) return fail('auth_required')
  if (user.role === 'fondateur') return fail('founder_protected')

  const rate = checkRateLimit(rateLimitKey(request, 'delete-account', user.id), DELETE_LIMIT, DELETE_WINDOW_MS)
  if (!rate.ok) return fail('rate_limited')

  const linked = await prisma.oAuthAccount.findUnique({ where: linkKey(provider, profile), select: { userId: true } })
  if (!linked || linked.userId !== user.id) return fail('oauth_not_linked')

  await deleteUserAccount(user.id)

  const response = redirectTo('/')
  response.cookies.set(clearSessionCookieOptions())
  return response
}
