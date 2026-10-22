import { createHmac, createPrivateKey, randomBytes, sign, type KeyObject } from 'node:crypto'
import type { AppLocale } from '@/i18n/routing'
import { appBaseUrl } from '@/lib/email'
import { isAppLocale } from '@/lib/locale-utils'
import { parseRequestedAmbianceMode, type AmbianceMode } from '@/lib/ambiance-mode'
import { safeAuthRedirect } from '@/lib/auth-redirect'
import {
  OAUTH_PROVIDERS,
  isOAuthIntent,
  isOAuthProvider,
  type OAuthIntent,
  type OAuthProvider,
} from '@/lib/oauth'

/**
 * Plomberie SERVEUR de la connexion Discord / Facebook / Apple (voir oauth.ts).
 *
 * Identifiants des applications lus À L'EXÉCUTION dans l'environnement du
 * conteneur (`.env` du VPS) — jamais au build : un fournisseur dont une
 * variable manque est simplement désactivé, son bouton n'apparaît pas.
 *   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
 *   FACEBOOK_APP_ID   / FACEBOOK_APP_SECRET
 *   APPLE_CLIENT_ID (Services ID) / APPLE_TEAM_ID / APPLE_KEY_ID /
 *   APPLE_PRIVATE_KEY (clé .p8 : PEM sur une ligne avec des \n littéraux,
 *   ou son seul corps base64 — un fichier .env ne garde qu'une ligne)
 */

type OAuthCredentials = { clientId: string; clientSecret: string }

const env = (name: string): string => (process.env[name] ?? '').trim().replace(/^(["'])(.*)\1$/, '$2')

function appleSigningKey(raw: string): KeyObject {
  const pem = raw.replace(/\\n/g, '\n')
  if (pem.includes('BEGIN')) return createPrivateKey(pem)
  return createPrivateKey({ key: Buffer.from(pem.replace(/\s+/g, ''), 'base64'), format: 'der', type: 'pkcs8' })
}

/**
 * Apple n'a pas de secret fixe : le « client secret » est un jeton ES256
 * signé par la clé privée de l'équipe, refait à chaque échange (5 minutes).
 */
function appleClientSecret(clientId: string, teamId: string, keyId: string, key: KeyObject): string {
  const now = Math.floor(Date.now() / 1000)
  const part = (value: object) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
  const unsigned = `${part({ alg: 'ES256', kid: keyId })}.${part({
    iss: teamId,
    iat: now,
    exp: now + 300,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  })}`
  const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' })
  return `${unsigned}.${signature.toString('base64url')}`
}

export function oauthCredentials(provider: OAuthProvider): OAuthCredentials | null {
  if (provider === 'apple') {
    const [clientId, teamId, keyId, rawKey] = [
      env('APPLE_CLIENT_ID'),
      env('APPLE_TEAM_ID'),
      env('APPLE_KEY_ID'),
      env('APPLE_PRIVATE_KEY'),
    ]
    if (!clientId || !teamId || !keyId || !rawKey) return null
    try {
      return { clientId, clientSecret: appleClientSecret(clientId, teamId, keyId, appleSigningKey(rawKey)) }
    } catch {
      console.error('[oauth] APPLE_PRIVATE_KEY illisible : connexion Apple désactivée')
      return null
    }
  }
  const clientId = env(provider === 'discord' ? 'DISCORD_CLIENT_ID' : 'FACEBOOK_APP_ID')
  const clientSecret = env(provider === 'discord' ? 'DISCORD_CLIENT_SECRET' : 'FACEBOOK_APP_SECRET')
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function enabledOAuthProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((provider) => oauthCredentials(provider) !== null)
}

/** Adresse de retour déclarée chez le fournisseur, à l'identique (sinon il refuse). */
export function oauthRedirectUri(provider: OAuthProvider): string {
  return `${appBaseUrl()}/api/auth/oauth/${provider}/callback`
}

// Chaque version de la Graph API vit au moins deux ans ; v25.0 date de février 2026.
const FACEBOOK_GRAPH = 'https://graph.facebook.com/v25.0'
const FACEBOOK_DIALOG = 'https://www.facebook.com/v25.0/dialog/oauth'
const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize'
const APPLE_ISSUER = 'https://appleid.apple.com'

export function oauthAuthorizeUrl(
  provider: OAuthProvider,
  clientId: string,
  state: string,
  intent: OAuthIntent
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri(provider),
    response_type: 'code',
    state,
  })
  let base: string
  if (provider === 'discord') {
    base = DISCORD_AUTHORIZE
    params.set('scope', 'identify email')
    // « none » saute l'écran d'accord déjà donné ; une suppression le
    // redemande, pour qu'elle reste un geste délibéré.
    params.set('prompt', intent === 'delete' ? 'consent' : 'none')
  } else if (provider === 'facebook') {
    base = FACEBOOK_DIALOG
    params.set('scope', 'public_profile,email')
    if (intent === 'delete') params.set('auth_type', 'reauthenticate')
  } else {
    base = `${APPLE_ISSUER}/auth/authorize`
    params.set('scope', 'name email')
    // Imposé par Apple dès que le nom ou l'e-mail est demandé : le retour
    // arrive en POST (voir la route de retour).
    params.set('response_mode', 'form_post')
  }
  // %20 plutôt que « + » pour les espaces des scopes : la forme que documente Apple.
  return `${base}?${params.toString().replace(/\+/g, '%20')}`
}

export type OAuthProfile = {
  /** Identifiant stable chez le fournisseur : la vraie clé du lien. */
  id: string
  email: string | null
  /**
   * Adresse confirmée auprès du fournisseur. Seule une adresse confirmée peut
   * retrouver un compte existant ou en créer un : sinon, n'importe qui
   * s'emparerait du compte d'autrui en déclarant son adresse chez Discord.
   */
  emailVerified: boolean
  /** Prénom ou nom d'affichage, pour proposer un pseudo à la création. */
  name: string
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
    if (!res.ok) return null
    const data: unknown = await res.json()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

async function discordProfile(code: string, creds: OAuthCredentials): Promise<OAuthProfile | null> {
  const token = await fetchJson(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: oauthRedirectUri('discord'),
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  })
  const accessToken = text(token?.access_token)
  if (!accessToken) return null
  const me = await fetchJson(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const id = text(me?.id)
  if (!me || !id) return null
  return {
    id,
    email: text(me.email).toLowerCase() || null,
    emailVerified: me.verified === true,
    name: text(me.global_name) || text(me.username),
  }
}

async function facebookProfile(code: string, creds: OAuthCredentials): Promise<OAuthProfile | null> {
  const tokenParams = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: oauthRedirectUri('facebook'),
    code,
  })
  const token = await fetchJson(`${FACEBOOK_GRAPH}/oauth/access_token?${tokenParams.toString()}`)
  const accessToken = text(token?.access_token)
  if (!accessToken) return null
  // appsecret_proof : un jeton intercepté ne sert à rien sans le secret de l'app.
  const proof = createHmac('sha256', creds.clientSecret).update(accessToken).digest('hex')
  const meParams = new URLSearchParams({
    fields: 'id,first_name,name,email',
    access_token: accessToken,
    appsecret_proof: proof,
  })
  const me = await fetchJson(`${FACEBOOK_GRAPH}/me?${meParams.toString()}`)
  const id = text(me?.id)
  if (!me || !id) return null
  const email = text(me.email).toLowerCase() || null
  return {
    id,
    email,
    // Facebook ne transmet une adresse qu'une fois confirmée par le lien
    // reçu dans la boîte : une adresse présente est une adresse vérifiée.
    emailVerified: email !== null,
    name: text(me.first_name) || text(me.name),
  }
}

function jwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function appleProfile(code: string, creds: OAuthCredentials): Promise<OAuthProfile | null> {
  const token = await fetchJson(`${APPLE_ISSUER}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: oauthRedirectUri('apple'),
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  })
  // Jeton d'identité reçu DIRECTEMENT d'Apple (TLS, secret client) : sa
  // signature n'apporte rien de plus (OpenID Connect Core 3.1.3.7).
  // Émetteur, audience et échéance restent contrôlés.
  const claims = jwtPayload(text(token?.id_token))
  const id = text(claims?.sub)
  if (!claims || !id) return null
  if (claims.iss !== APPLE_ISSUER || claims.aud !== creds.clientId) return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null
  const email = text(claims.email).toLowerCase() || null
  return {
    id,
    email,
    // Adresse réelle ou relais « Masquer mon adresse e-mail » : Apple la
    // déclare vérifiée dans les deux cas.
    emailVerified: email !== null && (claims.email_verified === true || claims.email_verified === 'true'),
    // Apple ne transmet le prénom qu'à la première autorisation, hors du
    // jeton (route de retour) : rien ici.
    name: '',
  }
}

/** Échange le code d'autorisation contre le profil ; null si le fournisseur refuse ou ne répond pas. */
export function fetchOAuthProfile(
  provider: OAuthProvider,
  code: string,
  creds: OAuthCredentials
): Promise<OAuthProfile | null> {
  if (provider === 'discord') return discordProfile(code, creds)
  if (provider === 'facebook') return facebookProfile(code, creds)
  return appleProfile(code, creds)
}

// ── État de l'aller-retour ──────────────────────────────────────────────────
// Cookie httpOnly limité aux routes OAuth, valable 10 minutes : il porte le
// jeton anti-rejeu (comparé au `state` que renvoie le fournisseur) et ce que
// l'aller savait (destination, langue, ambiance, compte qui l'a lancé).

export const OAUTH_STATE_COOKIE = 'lp_oauth'
const OAUTH_STATE_MAX_AGE_SEC = 10 * 60
const OAUTH_COOKIE_PATH = '/api/auth/oauth'

export type OAuthState = {
  state: string
  provider: OAuthProvider
  intent: OAuthIntent
  redirect: string
  locale: AppLocale
  ambianceMode: AmbianceMode | null
  /** Compte connecté au départ (upgrade, delete) : le retour doit être le même. */
  userId: string | null
}

export function newOAuthStateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
}

export function decodeOAuthState(raw: string | undefined): OAuthState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>
    if (typeof data.state !== 'string' || data.state.length < 32) return null
    if (!isOAuthProvider(data.provider) || !isOAuthIntent(data.intent)) return null
    if (typeof data.locale !== 'string' || !isAppLocale(data.locale)) return null
    return {
      state: data.state,
      provider: data.provider,
      intent: data.intent,
      redirect: safeAuthRedirect(typeof data.redirect === 'string' ? data.redirect : null),
      locale: data.locale,
      ambianceMode: parseRequestedAmbianceMode(data.ambianceMode),
      userId: typeof data.userId === 'string' && data.userId ? data.userId : null,
    }
  } catch {
    return null
  }
}

function oauthCookie(name: string, value: string, maxAge: number) {
  return {
    name,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Lax : le retour du fournisseur est une navigation de premier niveau en
    // GET, que Lax laisse passer (Strict perdrait le cookie).
    sameSite: 'lax' as const,
    path: OAUTH_COOKIE_PATH,
    maxAge,
  }
}

export function oauthStateCookieOptions(state: OAuthState) {
  return oauthCookie(OAUTH_STATE_COOKIE, encodeOAuthState(state), OAUTH_STATE_MAX_AGE_SEC)
}

export function clearOAuthStateCookieOptions() {
  return oauthCookie(OAUTH_STATE_COOKIE, '', 0)
}

/**
 * Prénom qu'Apple ne transmet qu'à la PREMIÈRE autorisation, dans le POST de
 * retour et hors du jeton : gardé le temps de l'aller-retour pour proposer le
 * pseudo de départ (sans lui, une adresse relais donnerait un pseudo illisible).
 */
export const OAUTH_NAME_COOKIE = 'lp_oauth_name'

// Next encode et décode lui-même la valeur (accents compris).
export function oauthNameCookieOptions(name: string) {
  return oauthCookie(OAUTH_NAME_COOKIE, name, 5 * 60)
}

export function clearOAuthNameCookieOptions() {
  return oauthCookie(OAUTH_NAME_COOKIE, '', 0)
}

export function readOAuthNameCookie(value: string | undefined): string {
  return (value ?? '').trim().slice(0, 60)
}
