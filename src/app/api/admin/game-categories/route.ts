import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import type { AuthUser } from '@/lib/auth-server'
import type { GameCategory } from '@/lib/game-catalog'
import {
  GameCategoryInvalidError,
  GameCategoryLimitError,
  GameCategoryNotFoundError,
  createGameCategory,
  deleteGameCategory,
  getGameCategories,
  moveGameCategory,
  setGameInCategory,
  updateGameCategory,
} from '@/lib/game-catalog-server'
import { GAMES } from '@/lib/games'
import { readJsonBodyLimited } from '@/lib/rate-limit'
import { canManageSiteSettings, canViewSupervisionAnalytics } from '@/lib/roles'
import { logStaffAction } from '@/lib/supervision-overview-server'
import { FORBIDDEN, requireRole } from '../_guard'

export const dynamic = 'force-dynamic'

/** Quatre noms et au plus une quarantaine d'ids de jeux : 8 Ko est très large. */
const MAX_BODY_BYTES = 8 * 1024

export type AdminGameCategoriesResponse = {
  canEdit: boolean
  categories: GameCategory[]
}

async function buildResponse(role: string): Promise<AdminGameCategoriesResponse> {
  return { canEdit: canManageSiteSettings(role), categories: await getGameCategories() }
}

/** Les écritures partagent la lecture du corps et la garde : le journal et l'erreur de chacune restent dans son gestionnaire. */
async function readBody(request: Request): Promise<{ body: Record<string, unknown> } | { error: Response }> {
  const parsed = await readJsonBodyLimited<Record<string, unknown> | null>(request, MAX_BODY_BYTES)
  if (!parsed.ok) {
    return { error: parsed.reason === 'too_large' ? apiError('payload_too_large', 413) : apiError('invalid_json', 400) }
  }
  const body = parsed.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: apiError('invalid_action', 400) }
  return { body }
}

/** Erreurs typées du serveur de catalogue → codes existants ; le reste remonte (500 par withApiRoute). */
function typedErrorResponse(error: unknown): Response | null {
  if (error instanceof GameCategoryInvalidError) return apiError('invalid_action', 400)
  if (error instanceof GameCategoryNotFoundError) return apiError('not_found', 404)
  if (error instanceof GameCategoryLimitError) return apiError('conflict', 409)
  return null
}

async function requireWriter(): Promise<{ actor: AuthUser } | { denied: Response }> {
  try {
    return { actor: await requireRole(canManageSiteSettings) }
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return { denied: apiError('forbidden', 403) }
    throw error
  }
}

/**
 * Les catégories de jeux (rubriques du hub) pour la Supervision. Lecture :
 * admin et au-dessus ; `canEdit` dit si le compte peut aussi les modifier
 * (super admin).
 */
export const GET = withApiRoute('admin/game-categories GET', async () => {
  let actor
  try {
    actor = await requireRole(canViewSupervisionAnalytics)
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return apiError('forbidden', 403)
    throw error
  }
  return NextResponse.json(await buildResponse(actor.role))
})

/** Crée une catégorie vide : `{ names: { fr, en?, es?, it? } }`. Super admin, journalisé. */
export const POST = withApiRoute('admin/game-categories POST', async (request: Request) => {
  const writer = await requireWriter()
  if ('denied' in writer) return writer.denied
  const { actor } = writer

  const read = await readBody(request)
  if ('error' in read) return read.error
  const { body } = read
  if (!body.names || typeof body.names !== 'object' || Array.isArray(body.names)) return apiError('invalid_action', 400)

  let created: GameCategory
  try {
    created = await createGameCategory(body.names as { fr: string })
  } catch (error) {
    const response = typedErrorResponse(error)
    if (response) return response
    throw error
  }

  await logStaffAction({ actorId: actor.id, action: 'site-setting', detail: `Catégorie créée : ${created.names.fr}` })
  return NextResponse.json(await buildResponse(actor.role))
})

/**
 * Modifie une catégorie : exactement UNE de ces formes, en plus de `id`.
 * - `names` : renomme ;
 * - `gameId` + `on` (booléen) : ajoute ou retire UN jeu, à partir de la valeur
 *   stockée (la forme à préférer : elle n'écrase pas le travail d'un autre) ;
 * - `gameIds` : liste complète de ses jeux, qui remplace l'ancienne ;
 * - `move` ('up' | 'down') : monte ou descend d'un cran.
 * Super admin ; journalisé seulement si quelque chose a vraiment changé.
 */
export const PATCH = withApiRoute('admin/game-categories PATCH', async (request: Request) => {
  const writer = await requireWriter()
  if ('denied' in writer) return writer.denied
  const { actor } = writer

  const read = await readBody(request)
  if ('error' in read) return read.error
  const { body } = read
  if (typeof body.id !== 'string') return apiError('invalid_action', 400)
  const id = body.id

  const hasNames = 'names' in body
  const hasGameIds = 'gameIds' in body
  const hasMove = 'move' in body
  const hasToggle = 'gameId' in body || 'on' in body
  if (Number(hasNames) + Number(hasGameIds) + Number(hasMove) + Number(hasToggle) !== 1) {
    return apiError('invalid_action', 400)
  }
  if (hasNames && (!body.names || typeof body.names !== 'object' || Array.isArray(body.names))) {
    return apiError('invalid_action', 400)
  }
  if (hasGameIds && (!Array.isArray(body.gameIds) || body.gameIds.some((gameId) => typeof gameId !== 'string'))) {
    return apiError('invalid_action', 400)
  }
  if (hasMove && body.move !== 'up' && body.move !== 'down') return apiError('invalid_action', 400)
  if (hasToggle && (typeof body.gameId !== 'string' || typeof body.on !== 'boolean')) {
    return apiError('invalid_action', 400)
  }

  let detail: string | null
  try {
    if (hasMove) {
      const direction = body.move as 'up' | 'down'
      const { categories, changed } = await moveGameCategory(id, direction)
      const name = categories.find((category) => category.id === id)?.names.fr ?? id
      detail = changed ? `Catégorie déplacée : ${name} (${direction === 'up' ? 'vers le haut' : 'vers le bas'})` : null
    } else if (hasNames) {
      const { category, changed } = await updateGameCategory(id, { names: body.names as { fr: string } })
      detail = changed ? `Catégorie renommée : ${category.names.fr}` : null
    } else if (hasToggle) {
      const gameId = body.gameId as string
      const on = body.on as boolean
      const { category, changed } = await setGameInCategory(id, gameId, on)
      const title = GAMES.find((game) => game.id === gameId)?.title ?? gameId
      detail = changed ? `Catégorie ${category.names.fr} : ${title} ${on ? 'ajouté' : 'retiré'}` : null
    } else {
      const { category, changed } = await updateGameCategory(id, { gameIds: body.gameIds as string[] })
      detail = changed ? `Catégorie ${category.names.fr} : jeux mis à jour (${category.gameIds.length})` : null
    }
  } catch (error) {
    const response = typedErrorResponse(error)
    if (response) return response
    throw error
  }

  if (detail) await logStaffAction({ actorId: actor.id, action: 'site-setting', detail })
  return NextResponse.json(await buildResponse(actor.role))
})

/** Supprime une catégorie (les jeux restent au catalogue) : `{ id }` dans le corps. Super admin, journalisé. */
export const DELETE = withApiRoute('admin/game-categories DELETE', async (request: Request) => {
  const writer = await requireWriter()
  if ('denied' in writer) return writer.denied
  const { actor } = writer

  const read = await readBody(request)
  if ('error' in read) return read.error
  if (typeof read.body.id !== 'string') return apiError('invalid_action', 400)
  const id = read.body.id

  // Le nom doit être lu AVANT la suppression : il ne reste plus rien à lire après.
  const name = (await getGameCategories()).find((category) => category.id === id)?.names.fr ?? id
  try {
    await deleteGameCategory(id)
  } catch (error) {
    const response = typedErrorResponse(error)
    if (response) return response
    throw error
  }

  await logStaffAction({ actorId: actor.id, action: 'site-setting', detail: `Catégorie supprimée : ${name}` })
  return NextResponse.json(await buildResponse(actor.role))
})
