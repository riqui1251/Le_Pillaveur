import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { GAMES } from '@/lib/games'
import { STAFF_TOGGLEABLE_GAME_IDS, totalPlays } from '@/lib/game-catalog'
import {
  GameNotToggleableError,
  getGameCatalogState,
  getGamePlayCounts30d,
  setGameHidden,
} from '@/lib/game-catalog-server'
import { readJsonBodyLimited } from '@/lib/rate-limit'
import { canManageSiteSettings, canViewSupervisionAnalytics } from '@/lib/roles'
import { logStaffAction } from '@/lib/supervision-overview-server'
import { FORBIDDEN, requireRole } from '../_guard'

export const dynamic = 'force-dynamic'

/** { gameId, hidden } : quelques dizaines d'octets, 4 Ko est déjà très large. */
const MAX_BODY_BYTES = 4 * 1024

export type AdminGameCatalogRow = {
  id: string
  hidden: boolean
  plays: { online: number; local: number; total: number }
  popularLocalRank: number | null
  popularOnlineRank: number | null
}

export type AdminGameCatalogResponse = {
  canEdit: boolean
  /** Jeux déjà retirés du code (`hidden`) : hors de la liste, simplement comptés. */
  retiredCount: number
  games: AdminGameCatalogRow[]
}

async function buildResponse(role: string): Promise<AdminGameCatalogResponse> {
  const [state, counts] = await Promise.all([getGameCatalogState(), getGamePlayCounts30d()])
  const rank = (ids: string[], gameId: string) => {
    const index = ids.indexOf(gameId)
    return index === -1 ? null : index + 1
  }
  const games = STAFF_TOGGLEABLE_GAME_IDS.map((id) => ({
    id,
    hidden: state.hiddenIds.includes(id),
    plays: {
      online: Math.max(0, counts[id]?.online ?? 0),
      local: Math.max(0, counts[id]?.local ?? 0),
      total: totalPlays(counts, id),
    },
    popularLocalRank: rank(state.popular.local, id),
    popularOnlineRank: rank(state.popular.online, id),
  })).sort((a, b) => b.plays.total - a.plays.total)
  return {
    canEdit: canManageSiteSettings(role),
    retiredCount: GAMES.filter((game) => game.hidden).length,
    games,
  }
}

/**
 * Catalogue des jeux pour la Supervision : chaque jeu que l'équipe peut
 * cacher, ses parties sur 30 jours et son rang de mise en avant. Lecture :
 * admin et au-dessus (comme les stats) ; `canEdit` dit si le compte peut
 * aussi cacher ou remettre (super admin).
 */
export const GET = withApiRoute('admin/game-catalog GET', async () => {
  let actor
  try {
    actor = await requireRole(canViewSupervisionAnalytics)
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return apiError('forbidden', 403)
    throw error
  }
  return NextResponse.json(await buildResponse(actor.role))
})

/** Cache (`hidden: true`) ou remet (`false`) un jeu : super admin, et journalisé si ça change. */
export const PATCH = withApiRoute('admin/game-catalog PATCH', async (request: Request) => {
  let actor
  try {
    actor = await requireRole(canManageSiteSettings)
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return apiError('forbidden', 403)
    throw error
  }

  const parsed = await readJsonBodyLimited<Record<string, unknown> | null>(request, MAX_BODY_BYTES)
  if (!parsed.ok) {
    return parsed.reason === 'too_large' ? apiError('payload_too_large', 413) : apiError('invalid_json', 400)
  }
  const body = parsed.body
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.gameId !== 'string' ||
    typeof body.hidden !== 'boolean' ||
    !STAFF_TOGGLEABLE_GAME_IDS.includes(body.gameId)
  ) {
    return apiError('invalid_action', 400)
  }

  let result
  try {
    result = await setGameHidden(body.gameId, body.hidden)
  } catch (error) {
    if (error instanceof GameNotToggleableError) return apiError('invalid_action', 400)
    throw error
  }

  if (result.changed) {
    const gameId = body.gameId
    const title = GAMES.find((game) => game.id === gameId)?.title ?? gameId
    await logStaffAction({
      actorId: actor.id,
      action: 'site-setting',
      detail: `${body.hidden ? 'Jeu caché' : 'Jeu remis'} : ${title}`,
    })
  }

  return NextResponse.json(await buildResponse(actor.role))
})
