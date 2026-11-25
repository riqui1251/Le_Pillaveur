import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { GAMES, type GameDrinkLevel } from '@/lib/games'
import { VIBE_GAME_IDS, gameDrinkLevel, gameVibes } from '@/lib/game-catalog'
import { SOIREE_GAME_IDS } from '@/lib/soiree/catalog'
import { GameNotToggleableError, getGameCatalogState, setGameInSoiree, setGameVibe } from '@/lib/game-catalog-server'
import { defaultVibesForLevel, isSoireeVibe, type SoireeVibe } from '@/lib/soiree/vibes'
import { readJsonBodyLimited } from '@/lib/rate-limit'
import { canManageSiteSettings, canViewSupervisionAnalytics } from '@/lib/roles'
import { logStaffAction } from '@/lib/supervision-overview-server'
import { FORBIDDEN, requireRole } from '../_guard'

export const dynamic = 'force-dynamic'

/** { gameId, vibe, on } ou { gameId, inSoiree } : quelques dizaines d'octets, 4 Ko est déjà très large. */
const MAX_BODY_BYTES = 4 * 1024

/** Le journal de l'équipe est en français, comme « Jeu caché » : pas de clé de traduction ici. */
const VIBE_LABELS: Record<SoireeVibe, string> = { apero: 'Apéro tranquille', monte: 'Ça monte', grosse: 'Grosse soirée' }

export type AdminGameVibesRow = {
  id: string
  /** Caché par l'équipe : le jeu garde ses ambiances, il ne sort simplement plus au tirage. */
  hidden: boolean
  /** Niveau « fait boire » effectif, dont découlent les ambiances par défaut. */
  drinkLevel: GameDrinkLevel
  /** Ambiances où le jeu peut être tiré (réglage de l'équipe, sinon celles de son niveau). */
  vibes: SoireeVibe[]
  /** Ambiances de son niveau « fait boire » effectif, celles où revient le réglage. */
  defaultVibes: SoireeVibe[]
  /** Dans la liste effective du Mode Soirée (réglage de l'équipe, sinon le défaut du code). */
  inSoiree: boolean
  /** Dans la liste du Mode Soirée fixée par le code, celle où revient le réglage. */
  defaultInSoiree: boolean
}

export type AdminGameVibesResponse = {
  canEdit: boolean
  games: AdminGameVibesRow[]
}

async function buildResponse(role: string): Promise<AdminGameVibesResponse> {
  const state = await getGameCatalogState()
  const games = VIBE_GAME_IDS.map((id) => {
    const drinkLevel = gameDrinkLevel(id, state.drinkLevel)
    return {
      id,
      hidden: state.hiddenIds.includes(id),
      drinkLevel,
      vibes: gameVibes(id, state.vibes, state.drinkLevel),
      defaultVibes: defaultVibesForLevel(drinkLevel),
      inSoiree: state.soiree[id] ?? SOIREE_GAME_IDS.includes(id),
      defaultInSoiree: SOIREE_GAME_IDS.includes(id),
    }
  })
  return { canEdit: canManageSiteSettings(role), games }
}

/**
 * Ambiances du Mode Soirée et appartenance à la soirée de chaque jeu candidat
 * (VIBE_GAME_IDS, même ceux hors de la liste par défaut) pour la Supervision. Lecture : admin
 * et au-dessus (comme le catalogue) ; `canEdit` dit si le compte peut aussi
 * cocher ou décocher (super admin).
 */
export const GET = withApiRoute('admin/game-vibes GET', async () => {
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
 * Coche (`on: true`) ou décoche (`false`) UNE ambiance d'un jeu : { gameId,
 * vibe, on } ; OU ajoute ou sort le jeu de la soirée : { gameId, inSoiree }.
 * Exactement l'une des deux formes. Super admin, journalisé seulement si le
 * réglage change. Rend la réponse complète du GET.
 */
export const PATCH = withApiRoute('admin/game-vibes PATCH', async (request: Request) => {
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
  if (!body || typeof body !== 'object') return apiError('invalid_action', 400)
  const { gameId } = body
  if (typeof gameId !== 'string' || !VIBE_GAME_IDS.includes(gameId)) return apiError('invalid_action', 400)
  const hasInSoiree = 'inSoiree' in body
  const hasVibe = 'vibe' in body || 'on' in body
  if (hasInSoiree === hasVibe) return apiError('invalid_action', 400)
  if (hasInSoiree && ('vibe' in body || 'on' in body || typeof body.inSoiree !== 'boolean')) {
    return apiError('invalid_action', 400)
  }
  if (hasVibe && (!isSoireeVibe(body.vibe) || typeof body.on !== 'boolean')) return apiError('invalid_action', 400)
  const title = GAMES.find((game) => game.id === gameId)?.title ?? gameId

  let changed: boolean
  let detail: string
  try {
    if (hasInSoiree) {
      const inSoiree = body.inSoiree as boolean
      changed = (await setGameInSoiree(gameId, inSoiree)).changed
      detail = `Mode Soirée : ${title} ${inSoiree ? 'ajouté' : 'retiré'}`
    } else {
      const vibe = body.vibe as SoireeVibe
      const on = body.on as boolean
      changed = (await setGameVibe(gameId, vibe, on)).changed
      detail = `Ambiance ${VIBE_LABELS[vibe]} : ${title} ${on ? 'ajouté' : 'retiré'}`
    }
  } catch (error) {
    if (error instanceof GameNotToggleableError) return apiError('invalid_action', 400)
    throw error
  }

  if (changed) await logStaffAction({ actorId: actor.id, action: 'site-setting', detail })

  return NextResponse.json(await buildResponse(actor.role))
})
