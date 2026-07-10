import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { launchOnlineRoom } from '@/lib/online-room-launch'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { BRIEFING_TIMEOUT_MS, parseBriefing, serializeBriefing } from '@/lib/online/briefing'

type Params = { params: Promise<{ roomId: string }> }

/**
 * « J'ai fini de lire le tuto » : enregistre l'ack du joueur, et démarre la
 * partie quand TOUS les membres actuels ont ack — ou au timeout (filet
 * anti-AFK, `{ timeout: true }` envoyé par tous les clients à l'échéance et
 * vérifié côté serveur). Idempotent : les ticks retardataires reçoivent le
 * salon tel quel une fois la partie lancée.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: { members: { include: { user: true }, orderBy: { joinedAt: 'asc' } } },
  })
  if (!room) return NextResponse.json({ error: 'Salon introuvable' }, { status: 404 })
  if (!room.members.some((m) => m.userId === user.id)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  // Partie déjà lancée (dernier ack ou timeout concurrent) : no-op tranquille.
  if (room.status !== 'briefing') {
    const dto = await buildRoomDto(roomId, user.id)
    return NextResponse.json({ room: dto })
  }

  const payload = await request.json().catch(() => ({}))
  const isTimeoutTick = payload?.timeout === true
  const briefing = parseBriefing(room.briefingJson) ?? { startedAt: Date.now(), acks: [] }

  let acks = briefing.acks
  if (!isTimeoutTick && !acks.includes(user.id)) {
    acks = [...acks, user.id]
    await prisma.onlineRoom.update({
      where: { id: roomId },
      data: { briefingJson: serializeBriefing({ ...briefing, acks }) },
    })
    publishRoomChanged(roomId, { type: 'changed' })
  }

  const allAcked = room.members.every((m) => acks.includes(m.userId))
  const timedOut = isTimeoutTick && Date.now() - briefing.startedAt >= BRIEFING_TIMEOUT_MS

  if (allAcked || timedOut) {
    // Garde atomique anti-double-lancement : seul le PREMIER passage
    // briefing → playing initialise l'état (les concurrents font no-op).
    const claimed = await prisma.onlineRoom.updateMany({
      where: { id: roomId, status: 'briefing' },
      data: { status: 'playing', briefingJson: null },
    })
    if (claimed.count === 1) {
      await launchOnlineRoom(roomId, room)
      publishRoomChanged(roomId, { type: 'changed' })
    }
  }

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
