import { NextResponse } from 'next/server'
import { appBaseUrl } from '@/lib/email'
import { type OnlineErrorCode } from '@/lib/online-errors'
import { readJsonBodyLimited } from '@/lib/rate-limit'

/**
 * Enveloppe commune des routes /api : un refus part toujours en JSON avec un
 * CODE stable, jamais une phrase française ni une page d'erreur HTML.
 *
 * Pourquoi : une route sans try/catch laissait une panne Prisma remonter à
 * Next, qui répond une page HTML de 500 — `parseApiJson` la rend alors en
 * « réponse illisible » et le joueur n'apprend rien. Et un `error` en français
 * brut s'affichait tel quel à un joueur EN/ES/IT, puisque les écrans recopient
 * ce champ. Un code se traduit (namespace i18n `onlineLobby.errors`), une
 * phrase non.
 */

/** Détails d'accompagnement d'un code (nombre, délai) — repris tels quels côté client. */
export type ApiErrorParams = Record<string, string | number | boolean | null>

/**
 * Corps d'erreur standard : `error` PORTE le code (les écrans historiques
 * lisent ce champ), `code` le répète pour les clients qui le lisent déjà
 * (JoinGate, TryBotsGate, la suppression de compte). Les deux disent la même
 * chose : aucun client n'a à choisir.
 */
export function apiError(
  code: OnlineErrorCode,
  status: number,
  params?: ApiErrorParams
): NextResponse {
  return NextResponse.json({ error: code, code, ...params }, { status })
}

/** Code d'erreur Prisma (« P2002 »…), ou null si l'erreur vient d'ailleurs. */
function prismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : null
}

/** Nom de la classe d'erreur, pour la trace serveur (jamais son message). */
function errorName(error: unknown): string {
  if (error instanceof Error) return error.name
  return typeof error
}

type ApiHandler<Args extends unknown[]> = (
  ...args: Args
) => Response | Promise<Response>

export type ApiRouteOptions = {
  /**
   * Accepte une écriture venue d'un autre site. Réservé aux routes qu'un
   * tiers appelle légitimement en POST (form_post d'Apple, désinscription en
   * un clic des messageries) : c'est alors l'état signé ou le jeton qu'elles
   * vérifient qui tient lieu de garde.
   */
  allowCrossSite?: boolean
}

/** Méthodes de lecture : jamais refusées, elles ne modifient rien. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** Origine publique du site, ou null si l'URL configurée est illisible. */
function siteOrigin(): string | null {
  try {
    return originOf(appBaseUrl())
  } catch {
    return null
  }
}

/** Premier argument du handler : la requête, si c'en est bien une (un test peut n'en passer aucune). */
function requestOf(args: unknown[]): Request | null {
  const candidate = args[0] as Request | undefined
  const looksLikeRequest =
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.method === 'string' &&
    typeof candidate.url === 'string' &&
    typeof candidate.headers === 'object' &&
    candidate.headers !== null &&
    typeof candidate.headers.get === 'function'
  return looksLikeRequest ? candidate : null
}

/**
 * Écriture venue d'un AUTRE site ? SameSite=Lax protège les routes qui
 * exigent une session, pas celles qui marchent sans (connexion, inscription,
 * invité, Google, déconnexion) : un formulaire posté depuis une page tierce
 * connectait la victime au compte de l'attaquant, ou effaçait le cookie d'un
 * invité — sa seule clé. Le navigateur dit d'où vient la requête :
 * `Sec-Fetch-Site: cross-site`, ou un `Origin` qui n'est ni celui de l'URL
 * appelée ni celui du site (derrière le proxy du VPS, `request.url` porte
 * l'hôte et le schéma internes, d'où appBaseUrl). Un `Origin: null` (iframe
 * sandbox, redirection) ne prouve rien : refusé aussi. Sans Origin ni
 * Sec-Fetch-Site (curl, script), ce n'est pas du CSRF : on laisse passer.
 * L'application Capacitor charge le site lui-même (server.url) : ses
 * requêtes sont de même origine.
 */
export function isCrossSiteRequest(request: Request): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true
  const origin = request.headers.get('origin')
  if (origin === null) return false
  const claimed = originOf(origin)
  if (claimed === null) return true
  if (claimed === originOf(request.url)) return false
  return claimed !== siteOrigin()
}

/**
 * Enveloppe un handler de route : plus aucune exception ne sort en HTML, et
 * aucune écriture venue d'un autre site n'atteint le handler.
 *
 * - POST/PUT/PATCH/DELETE d'un autre site (isCrossSiteRequest) → 403
 *   cross_site_request, AVANT toute lecture du corps — sauf
 *   `options.allowCrossSite` ;
 * - JSON malformé (SyntaxError levée par `request.json()`) → 400 invalid_json ;
 * - contrainte d'unicité Prisma (P2002) → 409 conflict ;
 * - ligne absente au moment de l'écriture (P2025) → 404 not_found ;
 * - tout le reste → 500 server_error.
 *
 * La trace serveur ne garde que le nom de la route, le nom de la classe
 * d'erreur et le code Prisma : ni le message, ni le corps de la requête. Un
 * message Prisma recopie la ligne fautive — donc un pseudo, un e-mail ou une
 * IP dans les journaux, ce que le RGPD nous interdit de laisser traîner.
 */
export function withApiRoute<Args extends unknown[]>(
  name: string,
  handler: ApiHandler<Args>,
  options: ApiRouteOptions = {}
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    const request = options.allowCrossSite ? null : requestOf(args)
    if (request && isCrossSiteRequest(request)) {
      console.warn('[api] ' + name, 'cross_site_request', request.headers.get('origin'))
      return apiError('cross_site_request', 403)
    }
    try {
      return await handler(...args)
    } catch (error) {
      const code = prismaErrorCode(error)
      console.error('[api] ' + name, errorName(error), code)

      if (error instanceof SyntaxError) return apiError('invalid_json', 400)
      if (code === 'P2002') return apiError('conflict', 409)
      if (code === 'P2025') return apiError('not_found', 404)
      return apiError('server_error', 500)
    }
  }
}

/**
 * Plafond de lecture des corps JSON des routes auth et amis : un pseudo, un
 * e-mail et un mot de passe tiennent dans quelques centaines d'octets, un
 * jeton Google dans deux kilo-octets. 8 Ko laissent de la marge à tout le
 * monde et refusent le reste avant de le matérialiser en mémoire.
 */
export const API_BODY_MAX_BYTES = 8 * 1024

export type ApiJsonBody<T> =
  | { ok: true; body: T }
  | { ok: false; response: NextResponse }

/**
 * Lecture JSON bornée, avec le refus déjà mis en forme : l'App Router ne
 * plafonne rien, `request.json()` avalait donc n'importe quel corps. Renvoie
 * 413 payload_too_large au-dessus du plafond, 400 invalid_json sur un corps
 * illisible ou vide.
 */
export async function readApiJson<T>(
  request: Request,
  maxBytes: number = API_BODY_MAX_BYTES
): Promise<ApiJsonBody<T>> {
  const parsed = await readJsonBodyLimited<T>(request, maxBytes)
  if (parsed.ok) return { ok: true, body: parsed.body }
  return {
    ok: false,
    response:
      parsed.reason === 'too_large'
        ? apiError('payload_too_large', 413)
        : apiError('invalid_json', 400),
  }
}
