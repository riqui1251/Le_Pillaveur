import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, touchMemberPresence } from '@/lib/online-room'
import { resetRoomToWaitingLobby } from '@/lib/online-petit-buveur'
import { parsePetitBuveurState } from '@/lib/online-game-state'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { getGameAdapter } from '@/lib/online/game-adapters'

type Params = { params: Promise<{ roomId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { roomId } = await params
  const member = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
  })
  if (!member) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  await touchMemberPresence(roomId, user.id)
  const dto = await buildRoomDto(roomId, user.id)
  if (!dto) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 })
  }

  return NextResponse.json({ room: dto })
}

/** Quitter la salle */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  if (!room) {
    return NextResponse.json({ ok: true })
  }

  const gameState = parsePetitBuveurState(room.gameStateJson)
  const gameFinished = Boolean(gameState?.winner)

  await prisma.onlineRoomMember.deleteMany({
    where: { roomId, userId: user.id },
  })

  const remaining = await prisma.onlineRoomMember.count({ where: { roomId } })

  if (remaining === 0) {
    await prisma.onlineRoom.delete({ where: { id: roomId } }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  if (room.hostUserId === user.id) {
    const nextHost = await prisma.onlineRoomMember.findFirst({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
    })
    if (nextHost) {
      await prisma.onlineRoom.update({
        where: { id: roomId },
        data: { hostUserId: nextHost.userId },
      })
    }
  }

  if (gameFinished && room.gameId === 'petit-buveur') {
    await resetRoomToWaitingLobby(roomId)
  }

  // Partie en cours (jeux serveur-autoritaires) : le joueur qui quitte est
  // marqué « parti » dans l'état — il peut revenir (bouton Rejoindre) pendant
  // 3 min avant d'être remplacé par un bot. Voir src/lib/online/replacement.ts.
  const adapter = getGameAdapter(room.gameId)
  if (adapter && room.status === 'playing') {
    const state = adapter.parse(room.gameStateJson)
    const next = state ? adapter.markLeft(state, user.id, Date.now()) : null
    if (next) {
      await prisma.onlineRoom.update({
        where: { id: roomId },
        data: { gameStateJson: adapter.serialize(next), stateVersion: room.stateVersion + 1 },
      })
    }
  }

  publishRoomChanged(roomId, { type: 'lobby' })

  return NextResponse.json({ ok: true })
}
