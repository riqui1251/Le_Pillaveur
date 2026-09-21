import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { stripEngineSecretForUser } from '@/lib/online-room'
import { onlineErrorBody } from '@/lib/online-errors'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Route en LECTURE SEULE : l'état d'une partie n'est plus jamais écrit par un
 * client. Le PUT qui l'acceptait servait les quatre jeux restés
 * client-autoritaires (hi-lo, monsieur-3, pmu, plinko) ; aucun écran ne les
 * rendait plus en ligne, et le trou restait ouvert : un état forgé s'y
 * déclarait vainqueur. Toute écriture passe désormais par POST /action, où
 * c'est le serveur qui arbitre.
 */
export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const member = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
  })
  if (!member) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }

  const room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }

  return NextResponse.json(
    {
      stateVersion: room.stateVersion,
      currentTurnUserId: room.currentTurnUserId,
      gameStateJson: stripEngineSecretForUser(room.gameId, room.gameStateJson, user.id),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
