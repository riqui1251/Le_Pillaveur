import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'

type Params = { params: Promise<{ roomId: string }> }

const VALID_DIFFICULTIES = new Set(['facile', 'normal', 'difficile', 'extreme'])

/** L'hôte met à jour les paramètres (difficulté, etc.) pendant le lobby */
export async function PUT(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  if (!room) {
    return NextResponse.json({ error: 'Lobby introuvable' }, { status: 404 })
  }
  if (room.status !== 'waiting') {
    return NextResponse.json({ error: 'La partie est déjà lancée' }, { status: 409 })
  }
  if (room.hostUserId !== user.id) {
    return NextResponse.json({ error: 'Seul le créateur peut modifier les paramètres' }, { status: 403 })
  }

  const body = await request.json()
  const current = parseRoomSettings(room.settingsJson)
  const next: RoomSettings = { ...current }

  if (typeof body.difficulty === 'string' && VALID_DIFFICULTIES.has(body.difficulty)) {
    next.difficulty = body.difficulty
  }
  if (typeof body.plinkoDifficulty === 'string') {
    next.plinkoDifficulty = body.plinkoDifficulty
  }
  if (body.hiLoMode === 'standard' || body.hiLoMode === 'traversee') {
    next.hiLoMode = body.hiLoMode
  }

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: { settingsJson: JSON.stringify(next) },
  })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
