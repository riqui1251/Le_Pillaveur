import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { GAMES, type GameDifficulty, type GameDrinkLevel } from '@/lib/games'
import {
  POPULAR_LIMIT,
  STAFF_TOGGLEABLE_GAME_IDS,
  gameDifficulty,
  gameDrinkLevel,
  isGameDifficulty,
  isGameDrinkLevel,
  totalPlays,
} from '@/lib/game-catalog'
import {
  GameFeaturedLimitError,
  GameNotToggleableError,
  getGameCatalogState,
  getGamePlayCounts30d,
  setGameDifficulty,
  setGameDrinkLevel,
  setGameFeatured,
  setGameHidden,
} from '@/lib/game-catalog-server'
import { readJsonBodyLimited } from '@/lib/rate-limit'
import { canManageSiteSettings, canViewSupervisionAnalytics } from '@/lib/roles'
import { logStaffAction } from '@/lib/supervision-overview-server'
import { FORBIDDEN, requireRole } from '../_guard'

export const dynamic = 'force-dynamic'

/** { gameId, hidden | difficulty | drinkLevel | featured } : quelques dizaines d'octets, 4 Ko est déjà très large. */
const MAX_BODY_BYTES = 4 * 1024

/** Le journal de l'équipe est en français, comme « Jeu caché » : pas de clé de traduction ici. */
const DIFFICULTY_LABELS: Record<GameDifficulty, string> = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' }
const DRINK_LEVEL_LABELS: Record<GameDrinkLevel, string> = { 1: 'Peu', 2: 'Moyen', 3: 'Beaucoup' }

export type AdminGameCatalogRow = {
  id: string
  hidden: boolean
  /** Difficulté effective (réglage de l'équipe, sinon celle du code). */
  difficulty: GameDifficulty
  /** Difficulté fixée par le code, celle où revient le réglage. */
  defaultDifficulty: GameDifficulty
  /** Niveau « fait boire » effectif (réglage de l'équipe, sinon celui du code). */
  drinkLevel: GameDrinkLevel
  /** Niveau « fait boire » fixé par le code, celui où revient le réglage. */
  defaultDrinkLevel: GameDrinkLevel
  /** Mis à la une par l'équipe (en tête du hub et de la vitrine). */
  featured: boolean
  /** Rang (à partir de 1) dans l'ordre de mise à la une, null si le jeu n'est pas à la une. */
  featuredRank: number | null
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
  // Le rang « Parmi les plus joués » est celui de la rangée telle qu'on la voit :
  // le serveur en classe plus que POPULAR_LIMIT, et un jeu à la une n'y figure pas.
  const shownPopular = (ids: string[]) => ids.filter((id) => !state.featured.includes(id)).slice(0, POPULAR_LIMIT)
  const popularLocal = shownPopular(state.popular.local)
  const popularOnline = shownPopular(state.popular.online)
  const games = STAFF_TOGGLEABLE_GAME_IDS.map((id) => ({
    id,
    hidden: state.hiddenIds.includes(id),
    difficulty: gameDifficulty(id, state.difficulty),
    defaultDifficulty: gameDifficulty(id, {}),
    drinkLevel: gameDrinkLevel(id, state.drinkLevel),
    defaultDrinkLevel: gameDrinkLevel(id, {}),
    featured: state.featured.includes(id),
    featuredRank: rank(state.featured, id),
    plays: {
      online: Math.max(0, counts[id]?.online ?? 0),
      local: Math.max(0, counts[id]?.local ?? 0),
      total: totalPlays(counts, id),
    },
    popularLocalRank: rank(popularLocal, id),
    popularOnlineRank: rank(popularOnline, id),
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

/**
 * Cache (`hidden: true`) ou remet (`false`) un jeu, OU règle sa difficulté
 * (`difficulty: 1 | 2 | 3`), OU son niveau « fait boire » (`drinkLevel: 1 | 2 | 3`),
 * OU le met à la une (`featured: boolean`) : exactement l'un des quatre. Déjà
 * FEATURED_LIMIT jeux à la une → 409 `conflict`. Super admin, et journalisé si
 * ça change.
 */
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
  if (!body || typeof body !== 'object' || typeof body.gameId !== 'string' || !STAFF_TOGGLEABLE_GAME_IDS.includes(body.gameId)) {
    return apiError('invalid_action', 400)
  }
  const gameId = body.gameId
  const hasHidden = 'hidden' in body
  const hasDifficulty = 'difficulty' in body
  const hasDrinkLevel = 'drinkLevel' in body
  const hasFeatured = 'featured' in body
  if (Number(hasHidden) + Number(hasDifficulty) + Number(hasDrinkLevel) + Number(hasFeatured) !== 1) {
    return apiError('invalid_action', 400)
  }
  if (hasFeatured && typeof body.featured !== 'boolean') return apiError('invalid_action', 400)
  if (hasHidden && typeof body.hidden !== 'boolean') return apiError('invalid_action', 400)
  if (hasDifficulty && !isGameDifficulty(body.difficulty)) return apiError('invalid_action', 400)
  if (hasDrinkLevel && !isGameDrinkLevel(body.drinkLevel)) return apiError('invalid_action', 400)
  const title = GAMES.find((game) => game.id === gameId)?.title ?? gameId

  let changed: boolean
  let detail: string
  try {
    if (hasHidden) {
      const hidden = body.hidden as boolean
      changed = (await setGameHidden(gameId, hidden)).changed
      detail = `${hidden ? 'Jeu caché' : 'Jeu remis'} : ${title}`
    } else if (hasDifficulty) {
      const level = body.difficulty as GameDifficulty
      changed = (await setGameDifficulty(gameId, level)).changed
      detail = `Difficulté : ${title} → ${DIFFICULTY_LABELS[level]}`
    } else if (hasDrinkLevel) {
      const level = body.drinkLevel as GameDrinkLevel
      changed = (await setGameDrinkLevel(gameId, level)).changed
      detail = `Fait boire : ${title} → ${DRINK_LEVEL_LABELS[level]}`
    } else {
      const featured = body.featured as boolean
      changed = (await setGameFeatured(gameId, featured)).changed
      detail = `À la une : ${title} ${featured ? 'ajouté' : 'retiré'}`
    }
  } catch (error) {
    if (error instanceof GameFeaturedLimitError) return apiError('conflict', 409)
    if (error instanceof GameNotToggleableError) return apiError('invalid_action', 400)
    throw error
  }

  if (changed) await logStaffAction({ actorId: actor.id, action: 'site-setting', detail })

  return NextResponse.json(await buildResponse(actor.role))
})
