import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { publishCastFrame } from '@/lib/online/room-bus'

/**
 * Trame de bille (jeu local diffusé) : relayée en ÉPHÉMÈRE (bus mémoire, sans
 * écriture DB) vers la TV pour animer la chute. Réservé au créateur du cast.
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ code: string }> }

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { code } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: { id: true, status: true, hostUserId: true },
  })
  if (!room || room.status !== 'cast') {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  if (room.hostUserId !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const frame = await request.json().catch(() => null)
  if (frame) publishCastFrame(room.id, frame)
  return NextResponse.json({ ok: true })
}
