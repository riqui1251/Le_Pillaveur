import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, deleteRoomIfEmpty } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { canJoinInviteRoom } from '@/lib/online/room-invites'
import { parseRoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { getGameAdapter } from '@/lib/online/game-adapters'

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour rejoindre un lobby' }, { status: 401 })
  }

  const body = await request.json()
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : ''

  let room = null
  if (roomId) {
    room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  } else if (code.length === 6) {
    room = await prisma.onlineRoom.findUnique({ where: { code } })
  } else {
    return NextResponse.json({ error: 'Code ou identifiant de lobby requis' }, { status: 400 })
  }

  if (!room) {
    return NextResponse.json({ error: 'Lobby introuvable' }, { status: 404 })
  }
  if (room.status !== 'waiting') {
    // Retour en partie : un joueur marqué « parti » peut reprendre sa place
    // tant qu'un bot ne l'a pas remplacé (voir src/lib/online/replacement.ts).
    if (room.status === 'playing') {
      let rejoinedJson: string | null = null
      const adapter = getGameAdapter(room.gameId)
      if (adapter) {
        const state = adapter.parse(room.gameStateJson)
        const next = state ? adapter.rejoin(state, user.id) : null
        if (next) rejoinedJson = adapter.serialize(next)
      }
      if (rejoinedJson) {
        const previousMemberships = await prisma.onlineRoomMember.findMany({
          where: { userId: user.id, roomId: { not: room.id } },
          select: { roomId: true },
        })
        await prisma.onlineRoomMember.deleteMany({ where: { userId: user.id } })
        await prisma.onlineRoomMember.upsert({
          where: { roomId_userId: { roomId: room.id, userId: user.id } },
          create: { roomId: room.id, userId: user.id, isReady: true },
          update: { lastSeenAt: new Date(), isReady: true },
        })
        await Promise.all(previousMemberships.map((m) => deleteRoomIfEmpty(m.roomId)))
        await prisma.onlineRoom.update({
          where: { id: room.id },
          data: { gameStateJson: rejoinedJson, stateVersion: room.stateVersion + 1 },
        })
        publishRoomChanged(room.id, { type: 'changed', stateVersion: room.stateVersion + 1 })
        const dto = await buildRoomDto(room.id, user.id)
        return NextResponse.json({ room: dto })
      }
    }
    return NextResponse.json({ error: 'Ce lobby a déjà démarré' }, { status: 409 })
  }

  if (room.visibility === 'invite' && !(await canJoinInviteRoom(room.id, user.id))) {
    return NextResponse.json({ error: 'Ce lobby est sur invitation uniquement' }, { status: 403 })
  }

  if (room.gameId === 'toucher-coule') {
    const settings = parseRoomSettings(room.settingsJson)
    const capacity = TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam * 2
    const others = await prisma.onlineRoomMember.count({
      where: { roomId: room.id, userId: { not: user.id } },
    })
    if (others >= capacity) {
      return NextResponse.json({ error: 'Ce lobby est complet pour ce format' }, { status: 409 })
    }
  }

  const previousMemberships = await prisma.onlineRoomMember.findMany({
    where: { userId: user.id, roomId: { not: room.id } },
    select: { roomId: true },
  })
  await prisma.onlineRoomMember.deleteMany({ where: { userId: user.id } })

  await prisma.onlineRoomMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
    create: { roomId: room.id, userId: user.id, isReady: false },
    update: { lastSeenAt: new Date(), isReady: false },
  })
  await Promise.all(previousMemberships.map((m) => deleteRoomIfEmpty(m.roomId)))

  if (room.visibility === 'invite') {
    await prisma.onlineRoomInvite.updateMany({
      where: { roomId: room.id, invitedUserId: user.id, status: 'pending' },
      data: { status: 'accepted', respondedAt: new Date() },
    })
  }

  publishRoomChanged(room.id, { type: 'lobby' })

  const dto = await buildRoomDto(room.id, user.id)
  return NextResponse.json({ room: dto })
}
