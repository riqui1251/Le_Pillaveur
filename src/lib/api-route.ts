import { NextResponse } from 'next/server'
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

/**
 * Enveloppe un handler de route : plus aucune exception ne sort en HTML.
 *
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
  handler: ApiHandler<Args>
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
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
