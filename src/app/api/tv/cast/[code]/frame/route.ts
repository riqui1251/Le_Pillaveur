import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { publishCastFrame } from '@/lib/online/room-bus'
import { readJsonBodyLimited } from '@/lib/rate-limit'

/**
 * Trame de bille (jeu local diffusé) : relayée en ÉPHÉMÈRE (bus mémoire, sans
 * écriture DB) vers la TV pour animer la chute. Réservé au créateur du cast.
 */
export const dynamic = 'force-dynamic'

/**
 * Une trame (positions de bille) tient en quelques centaines d'octets. Elle
 * est recopiée vers chaque écran abonné : sans plafond, un corps de plusieurs
 * mégaoctets était lu en entier puis diffusé tel quel.
 */
const MAX_FRAME_BYTES = 16 * 1024

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

  const parsed = await readJsonBodyLimited<unknown>(request, MAX_FRAME_BYTES)
  if (!parsed.ok && parsed.reason === 'too_large') {
    return NextResponse.json({ error: 'body-too-large' }, { status: 413 })
  }
  const frame = parsed.ok ? parsed.body : null
  if (frame) publishCastFrame(room.id, frame)
  return NextResponse.json({ ok: true })
}
