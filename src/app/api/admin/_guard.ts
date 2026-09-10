import { NextResponse } from 'next/server'
import { getCurrentUser, type AuthUser } from '@/lib/auth-server'

/**
 * Convention UNIQUE d'authentification et d'erreur pour /api/admin (F47).
 *
 * Le dossier mélangeait deux styles : `requireXxxUser()` qui lève
 * `FORBIDDEN` rattrapé dans le `catch`, et `getCurrentUser()` suivi d'un
 * prédicat testé en ligne — avec des codes de réponse qui variaient d'une
 * route à l'autre (401 ici, 403 là, « Erreur lors de la suppression » ailleurs).
 * Le style dominant (13 gestionnaires sur 24) est celui qui LÈVE : on
 * l'applique partout, sans changer les droits effectifs d'aucune route.
 *
 * Règle de réponse : accès refusé (non connecté OU grade insuffisant) → 403
 * `Accès refusé` ; toute autre exception → 500 `Erreur serveur`. Le 403
 * uniforme est celui que `requireSupervisionUser` produisait déjà dans les
 * deux cas : on ne révèle donc pas non plus si un compte existe.
 */

export const FORBIDDEN = 'FORBIDDEN'

/** Garde générique : `allows` reçoit le rôle brut du compte connecté. */
export async function requireRole(allows: (role: string) => boolean): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user || !allows(user.role)) throw new Error(FORBIDDEN)
  return user
}

/** Garde « simplement connecté » — aucun grade exigé (ex. lecture des réglages). */
export async function requireSignedIn(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error(FORBIDDEN)
  return user
}

/** Réponse d'erreur normalisée : `context` sert uniquement au log serveur. */
export function adminErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof Error && error.message === FORBIDDEN) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  console.error(`admin ${context} error:`, error)
  return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
}

/** Bornage commun des paramètres de pagination (F40/F75). */
export function parsePaging(
  searchParams: URLSearchParams,
  { defaultSize, maxSize }: { defaultSize: number; maxSize: number }
): { page: number; pageSize: number; skip: number } {
  const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const rawSize = Number.parseInt(searchParams.get('pageSize') ?? String(defaultSize), 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const pageSize =
    Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, maxSize) : defaultSize
  return { page, pageSize, skip: (page - 1) * pageSize }
}
