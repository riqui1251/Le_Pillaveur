import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { createUniqueRoomCode } from '@/lib/online-room'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import { MAX_CAST_BODY_BYTES } from '@/lib/cast-types'

/**
 * Crée une SALLE DE CAST éphémère pour diffuser un jeu LOCAL sur une TV.
 * Réutilise `OnlineRoom` avec `status='cast'` (pas de membres, pas de partie
 * en ligne) : le téléphone qui joue en local y pousse son état d'affichage, la
 * TV le lit par les endpoints publics `/api/tv/[code]`. Un utilisateur n'a
 * qu'une salle de cast à la fois (les anciennes sont purgées).
 */
export const dynamic = 'force-dynamic'

const CASTABLE_GAMES = new Set(['plinko', 'pmu', 'petit-buveur'])

export const POST = withApiRoute('tv/cast POST', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) {
    return apiError('auth_required', 401)
  }

  // Le corps porte l'état d'affichage du jeu local, écrit tel quel en base :
  // borné (MAX_CAST_BODY_BYTES), comme la mise à jour.
  const parsed = await readApiJson<{ gameId?: string; state?: string } | null>(
    request,
    MAX_CAST_BODY_BYTES
  )
  if (!parsed.ok) return parsed.response
  const body = parsed.body ?? {}

  const gameId = typeof body.gameId === 'string' ? body.gameId : ''
  if (!CASTABLE_GAMES.has(gameId)) {
    return apiError('invalid_game', 400)
  }

  // Une seule salle de cast active par utilisateur.
  await prisma.onlineRoom.deleteMany({ where: { hostUserId: user.id, status: 'cast' } })

  const code = await createUniqueRoomCode()
  const room = await prisma.onlineRoom.create({
    data: {
      code,
      hostUserId: user.id,
      status: 'cast',
      visibility: 'private',
      gameId,
      gameStateJson: typeof body.state === 'string' ? body.state : null,
      stateVersion: 1,
    },
  })

  return NextResponse.json({ code: room.code })
})
