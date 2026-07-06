import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { publishRoomChanged } from '@/lib/online/room-bus'

type Params = { params: Promise<{ roomId: string }> }

const VALID_DIFFICULTIES = new Set(['facile', 'normal', 'difficile', 'extreme'])
const VALID_VISIBILITIES = new Set(['public', 'private', 'invite'])
const VALID_TC_MODES = new Set(['1v1', '2v2', '3v3'])

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
  if (typeof body.tcMode === 'string' && VALID_TC_MODES.has(body.tcMode)) {
    next.tcMode = body.tcMode as NonNullable<RoomSettings['tcMode']>
  }
  if (typeof body.quizCount === 'number' && [10, 15, 20].includes(body.quizCount)) {
    next.quizCount = body.quizCount
  }
  if (typeof body.lgDebateMin === 'number' && [1, 2, 3, 4, 5].includes(body.lgDebateMin)) {
    next.lgDebateMin = body.lgDebateMin
  }
  if (
    typeof body.botsCount === 'number' &&
    Number.isInteger(body.botsCount) &&
    body.botsCount >= 0 &&
    body.botsCount <= 11
  ) {
    next.botsCount = body.botsCount
  }

  const visibilityUpdate =
    typeof body.visibility === 'string' && VALID_VISIBILITIES.has(body.visibility)
      ? { visibility: body.visibility }
      : {}

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: { settingsJson: JSON.stringify(next), ...visibilityUpdate },
  })

  publishRoomChanged(roomId, { type: 'lobby' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
