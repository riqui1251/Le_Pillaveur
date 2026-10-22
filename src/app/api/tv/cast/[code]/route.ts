import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { readJsonBodyLimited } from '@/lib/rate-limit'

/**
 * Mise à jour (PUT) et fin (DELETE) d'une salle de cast. Réservé au créateur
 * (hostUserId) : lui seul pousse l'état d'affichage de son jeu local.
 */
export const dynamic = 'force-dynamic'

/**
 * Même plafond que la création (POST /api/tv/cast) : l'état poussé est écrit
 * tel quel dans `gameStateJson`, et ce PUT, lui, n'était pas borné.
 */
const MAX_CAST_BODY_BYTES = 256 * 1024

type Params = { params: Promise<{ code: string }> }

async function resolveOwnedCast(code: string) {
  const user = await getCurrentUser()
  if (!user) return { error: 'unauthenticated' as const, status: 401 }
  const room = await prisma.onlineRoom.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: { id: true, status: true, hostUserId: true },
  })
  if (!room || room.status !== 'cast') return { error: 'not-found' as const, status: 404 }
  if (room.hostUserId !== user.id) return { error: 'forbidden' as const, status: 403 }
  return { room }
}

export async function PUT(request: Request, { params }: Params) {
  const { code } = await params
  const resolved = await resolveOwnedCast(code)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }

  const parsed = await readJsonBodyLimited<{ state?: unknown } | null>(request, MAX_CAST_BODY_BYTES)
  if (!parsed.ok && parsed.reason === 'too_large') {
    return NextResponse.json({ error: 'body-too-large' }, { status: 413 })
  }
  const body = (parsed.ok ? parsed.body : null) ?? {}
  await prisma.onlineRoom.update({
    where: { id: resolved.room.id },
    data: {
      gameStateJson: typeof body.state === 'string' ? body.state : null,
      stateVersion: { increment: 1 },
      updatedAt: new Date(),
    },
  })
  publishRoomChanged(resolved.room.id, { type: 'changed' })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const { code } = await params
  const resolved = await resolveOwnedCast(code)
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status })
  }
  await prisma.onlineRoom.delete({ where: { id: resolved.room.id } })
  return NextResponse.json({ ok: true })
}
