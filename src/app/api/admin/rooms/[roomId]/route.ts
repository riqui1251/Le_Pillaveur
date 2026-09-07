import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { publishRoomChanged } from '@/lib/online/room-bus'

/**
 * Fermeture FORCÉE d'un salon en ligne depuis la Supervision (admin+).
 * Même mécanique que les nettoyages automatiques : suppression de la ligne
 * (cascade membres/invitations) + événement SSE `lobby` — chaque client
 * retombe sur le Guichet en moins de 2 s (404 → room = null). Aucun résultat
 * de partie n'est écrit : une table fermée d'office ne compte ni victoire ni
 * défaite.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    await requireAdminUser()
    const { roomId } = await params

    const room = await prisma.onlineRoom.findUnique({
      where: { id: roomId },
      select: { id: true, status: true },
    })
    if (!room) {
      return NextResponse.json({ error: 'Salon introuvable' }, { status: 404 })
    }
    // Les salles `cast` sont l'afficheur TV d'un jeu LOCAL — hors périmètre.
    if (room.status === 'cast') {
      return NextResponse.json({ error: 'Cette salle ne peut pas être fermée ici' }, { status: 400 })
    }

    await prisma.onlineRoom.delete({ where: { id: roomId } })
    // Le chat de salle n'a pas de FK vers la room : purge explicite.
    await prisma.chatMessage.deleteMany({ where: { channel: `room:${roomId}` } })
    publishRoomChanged(roomId, { type: 'lobby' })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin room close error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
