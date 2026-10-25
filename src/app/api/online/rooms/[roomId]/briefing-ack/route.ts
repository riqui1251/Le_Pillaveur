import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { isBriefingExpired, parseBriefing, serializeBriefing } from '@/lib/online/briefing'
import { onlineErrorBody } from '@/lib/online-errors'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import { startBriefedGame } from '../briefing-start'

type Params = { params: Promise<{ roomId: string }> }

/** Le corps attendu est `{}` ou `{ timeout: true }`. */
const MAX_BRIEFING_ACK_BODY_BYTES = 1024

/**
 * Tours de compare-and-swap de l'ack : chaque tour perdu veut dire qu'un autre
 * joueur a écrit le sien entre la lecture et l'écriture. Une table entière qui
 * clique à la fin du tuto en perd au plus un par concurrent.
 */
const ACK_WRITE_ATTEMPTS = 10

function readBriefingRoom(roomId: string) {
  return prisma.onlineRoom.findUnique({
    where: { id: roomId },
    select: { status: true, briefingJson: true, members: { select: { userId: true } } },
  })
}

/**
 * « J'ai fini de lire le tuto » : enregistre l'ack du joueur, et démarre la
 * partie quand TOUS les membres actuels ont ack — ou au timeout (filet
 * anti-AFK, `{ timeout: true }` envoyé par tous les clients à l'échéance et
 * vérifié côté serveur). Idempotent : les ticks retardataires reçoivent le
 * salon tel quel une fois la partie lancée.
 */
export const POST = withApiRoute('online/rooms/[roomId]/briefing-ack POST', async (request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })

  const { roomId } = await params
  let room = await readBriefingRoom(roomId)
  if (!room) return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  if (!room.members.some((m) => m.userId === user.id)) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }
  // Partie déjà lancée (dernier ack ou timeout concurrent) : no-op tranquille.
  if (room.status !== 'briefing') {
    const dto = await buildRoomDto(roomId, user.id)
    return NextResponse.json({ room: dto })
  }

  const parsed = await readApiJson<{ timeout?: unknown } | null>(request, MAX_BRIEFING_ACK_BODY_BYTES)
  if (!parsed.ok) return parsed.response
  const isTimeoutTick = parsed.body?.timeout === true

  let briefing = parseBriefing(room.briefingJson) ?? { startedAt: Date.now(), acks: [] }
  // Compare-and-swap sur le JSON lu : deux « prêt » simultanés réécrivaient
  // chacun la liste lue AVANT l'autre, et un ack disparaissait — aucun des
  // deux ne voyait alors tout le monde prêt.
  for (let attempt = 1; !isTimeoutTick && !briefing.acks.includes(user.id); attempt += 1) {
    const next = { ...briefing, acks: [...briefing.acks, user.id] }
    const { count } = await prisma.onlineRoom.updateMany({
      where: { id: roomId, status: 'briefing', briefingJson: room.briefingJson },
      data: { briefingJson: serializeBriefing(next) },
    })
    if (count === 1) {
      briefing = next
      publishRoomChanged(roomId, { type: 'changed' })
      break
    }
    if (attempt >= ACK_WRITE_ATTEMPTS) return apiError('version_conflict', 409)
    room = await readBriefingRoom(roomId)
    if (!room) return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
    if (!room.members.some((m) => m.userId === user.id)) {
      return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
    }
    if (room.status !== 'briefing') {
      const dto = await buildRoomDto(roomId, user.id)
      return NextResponse.json({ room: dto })
    }
    briefing = parseBriefing(room.briefingJson) ?? { startedAt: Date.now(), acks: [] }
  }

  const allAcked = room.members.every((m) => briefing.acks.includes(m.userId))
  const timedOut = isTimeoutTick && isBriefingExpired(briefing, Date.now())
  if (allAcked || timedOut) await startBriefedGame(roomId)

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
})
