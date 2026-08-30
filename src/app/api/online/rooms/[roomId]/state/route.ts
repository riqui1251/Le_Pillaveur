import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, stripEngineSecretForUser } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody } from '@/lib/online-errors'

type Params = { params: Promise<{ roomId: string }> }

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

/** Pousse l'état de partie — autorisé pour le joueur actif ou après son tour (pushedByUserId) */
export async function PUT(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: { members: { orderBy: { joinedAt: 'asc' } } },
  })

  if (!room || room.status !== 'playing') {
    return NextResponse.json(onlineErrorBody('game_not_active'), { status: 400 })
  }

  const isMember = room.members.some((m) => m.userId === user.id)
  if (!isMember) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }

  // Jeux serveur-autoritaires : l'état ne peut JAMAIS être poussé par un client
  // (un état forgé permettrait de tricher) — tout passe par /action.
  if (room.gameId === 'petit-buveur' || room.gameId === 'toucher-coule') {
    return NextResponse.json(onlineErrorBody('server_managed_game'), { status: 403 })
  }

  const body = await request.json()
  if (typeof body.gameStateJson !== 'string') {
    return NextResponse.json(onlineErrorBody('invalid_state'), { status: 400 })
  }

  let parsed: { memberUserIds?: string[]; currentPlayer?: number; pushedByUserId?: string; phase?: string }
  try {
    parsed = JSON.parse(body.gameStateJson)
  } catch {
    return NextResponse.json(onlineErrorBody('invalid_json'), { status: 400 })
  }

  const memberUserIds = parsed.memberUserIds ?? room.members.map((m) => m.userId)
  const currentPlayer = typeof parsed.currentPlayer === 'number' ? parsed.currentPlayer : 0
  const activeUserId = memberUserIds[currentPlayer]
  const pushedBy = typeof body.pushedByUserId === 'string' ? body.pushedByUserId : user.id

  /** PMU setup : chaque joueur place son propre cheval */
  const pmuSetupPush = room.gameId === 'pmu' && parsed.phase === 'setup'

  const canPush =
    pushedBy === user.id &&
    (pmuSetupPush ||
      pushedBy === activeUserId ||
      pushedBy === room.currentTurnUserId ||
      pushedBy === memberUserIds[(currentPlayer - 1 + memberUserIds.length) % memberUserIds.length])

  if (!canPush) {
    return NextResponse.json(onlineErrorBody('not_your_turn'), { status: 403 })
  }

  const clientVersion = typeof body.expectedVersion === 'number' ? body.expectedVersion : room.stateVersion
  if (clientVersion !== room.stateVersion && room.stateVersion > 0) {
    return NextResponse.json(
      { ...onlineErrorBody('version_conflict'), stateVersion: room.stateVersion },
      { status: 409 }
    )
  }

  const nextVersion = room.stateVersion + 1
  const nextTurnUserId = memberUserIds[currentPlayer] ?? null

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      gameStateJson: body.gameStateJson,
      stateVersion: nextVersion,
      currentTurnUserId: nextTurnUserId,
    },
  })

  publishRoomChanged(roomId, { type: 'changed', stateVersion: nextVersion })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ ok: true, stateVersion: nextVersion, room: dto })
}
