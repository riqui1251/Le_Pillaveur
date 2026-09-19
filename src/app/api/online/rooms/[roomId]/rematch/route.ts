import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, touchMemberPresence } from '@/lib/online-room'
import { processRematchVote } from '@/lib/online-room-launch'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody, resolveOnlineErrorCode } from '@/lib/online-errors'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Vote « Rejouer » — relance automatique quand tous les membres PRÉSENTS ont
 * voté (REMATCH_PRESENCE_MS) ; les absents sont retirés de la table.
 */
export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  // `lastSeenAt` de chaque membre fait le quorum (scalaire de la ligne, donc
  // porté par l'include) ; du joueur, le lancement ne lit que le pseudo.
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: { user: { select: { displayName: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })

  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }

  const isMember = room.members.some((m) => m.userId === user.id)
  if (!isMember) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }

  // Le vote vaut présence : processRematchVote compte déjà le votant, mais un
  // vote CONCURRENT relit la base — sans cette trace, il tenait pour absent un
  // joueur revenu au premier plan qui a cliqué avant son premier sondage, et
  // relançait sans lui. Même UPDATE conditionnel que GET /rooms/[roomId] :
  // n'écrit que si la trace a plus de 30 s.
  await touchMemberPresence(roomId, user.id)

  try {
    await processRematchVote(roomId, room, user.id)
  } catch (e) {
    const code = resolveOnlineErrorCode(e instanceof Error ? e.message : null) ?? 'action_failed'
    return NextResponse.json(onlineErrorBody(code), { status: 400 })
  }

  publishRoomChanged(roomId, { type: 'changed' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
