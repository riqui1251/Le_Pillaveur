import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canManageUsers } from '@/lib/roles'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { logStaffAction } from '@/lib/supervision-overview-server'
import { adminErrorResponse, requireRole } from '../../_guard'

/**
 * Fermeture FORCÉE d'un salon en ligne depuis la Supervision (admin+).
 * Même mécanique que les nettoyages automatiques : suppression de la ligne
 * (cascade membres/invitations) + événement SSE `lobby` — chaque client
 * retombe sur le Guichet en moins de 2 s (404 → room = null). Aucun résultat
 * de partie n'est écrit : une table fermée d'office ne compte ni victoire ni
 * défaite.
 *
 * Les salles `cast` (afficheur TV d'un jeu LOCAL) sont fermables ici depuis
 * G5 : elles étaient jusque-là hors de portée, donc éternelles.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const actor = await requireRole(canManageUsers)
    const { roomId } = await params

    const room = await prisma.onlineRoom.findUnique({
      where: { id: roomId },
      select: { id: true, status: true, code: true, gameId: true },
    })
    if (!room) {
      return NextResponse.json({ error: 'Salon introuvable' }, { status: 404 })
    }

    await prisma.onlineRoom.delete({ where: { id: roomId } })
    // Le chat de salle n'a pas de FK vers la room : purge explicite.
    await prisma.chatMessage.deleteMany({ where: { channel: `room:${roomId}` } })
    publishRoomChanged(roomId, { type: 'lobby' })

    // F42 : fermer une table est un acte d'exploitation, il laisse une trace.
    await logStaffAction({
      actorId: actor.id,
      action: 'room-close',
      detail: `${room.code}${room.gameId ? ` — ${room.gameId}` : ''} (${room.status})`,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminErrorResponse(error, 'room close')
  }
}
