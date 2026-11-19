import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { launchOnlineRoom, resetRoomToWaitingLobby } from '@/lib/online-room-launch'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { BRIEFING_TIMEOUT_MS, parseBriefing, serializeBriefing } from '@/lib/online/briefing'
import { launchRosterRefusal } from '@/lib/online/launch-roster'
import { onlineErrorBody } from '@/lib/online-errors'

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
  if (!user) return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: {
      // Le lancement ne lit du joueur que son pseudo (RoomWithMembers) : pas
      // de ligne User entière (passwordHash, e-mail…) sortie de la base pour rien.
      members: {
        include: { user: { select: { displayName: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })
  if (!room) return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  if (!room.members.some((m) => m.userId === user.id)) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
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
    // Un départ pendant le briefing (DELETE ne touche pas au briefing) peut
    // faire repasser la table sous les bornes que /launch avait validées : le
    // lanceur lèverait, la table revient donc au lobby, qui affiche la règle.
    const memberIds = room.members.map((m) => m.userId)
    if (launchRosterRefusal(room, memberIds, { afterBriefing: true })) {
      const reset = await prisma.onlineRoom.updateMany({
        where: { id: roomId, status: 'briefing' },
        data: { status: 'waiting', briefingJson: null },
      })
      if (reset.count === 1) {
        await resetRoomToWaitingLobby(roomId)
        publishRoomChanged(roomId, { type: 'lobby' })
      }
      const dto = await buildRoomDto(roomId, user.id)
      return NextResponse.json({ room: dto })
    }
    // Garde atomique anti-double-lancement : seul le PREMIER passage
    // briefing → playing initialise l'état (les concurrents font no-op).
    const claimed = await prisma.onlineRoom.updateMany({
      where: { id: roomId, status: 'briefing' },
      data: { status: 'playing', briefingJson: null },
    })
    if (claimed.count === 1) {
      try {
        await launchOnlineRoom(roomId, room)
        publishRoomChanged(roomId, { type: 'changed' })
      } catch (error) {
        console.error('briefing-ack: launchOnlineRoom failed', error)
        // Sans ce retour en arrière la salle restait « playing » sans état ni
        // version : ni action, ni retour au lobby, ni Rejouer n'aboutissaient.
        // Gardé sur la version lue : un lanceur qui a écrit son état avant de
        // lever laisse une partie jouable, qu'on ne détruit pas.
        const rolledBack = await prisma.onlineRoom.updateMany({
          where: { id: roomId, status: 'playing', stateVersion: room.stateVersion },
          data: { status: 'waiting', gameStateJson: null, stateVersion: 0, currentTurnUserId: null },
        })
        if (rolledBack.count === 1) {
          await resetRoomToWaitingLobby(roomId)
          publishRoomChanged(roomId, { type: 'lobby' })
        } else {
          publishRoomChanged(roomId, { type: 'changed' })
        }
      }
    }
  }

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
