import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { kickMember } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody } from '@/lib/online-errors'

type Params = { params: Promise<{ roomId: string; userId: string }> }

/**
 * L'hôte expulse un membre de sa table OUVERTE (statut waiting) — l'ami qui
 * s'est assis par erreur, le pseudo inconnu venu par la liste publique, le
 * téléphone resté sur le lobby. Réponse : 200 `{ ok: true }`.
 *
 * Refus : `not_host` (403) si l'appelant n'est pas l'hôte,
 * `game_already_started` (409) hors lobby — en partie, un joueur se retire
 * par le remplacement AFK (route action), jamais à la main —,
 * `cannot_kick_self` (400) sur soi-même (quitter = DELETE /rooms/[roomId], qui
 * transfère l'hôte), `room_not_found` / `member_not_found` (404).
 *
 * Après l'expulsion : l'expulsé verra 403 à son prochain sondage
 * (handleRoomGone → « Tu n'es plus dans cette table »). Rien ne lui interdit
 * de revenir par le code (table publique ou privée) — pour une table sur
 * invitation, il lui faut une nouvelle invitation, puisque la sienne est
 * déjà « acceptée » (canJoinInviteRoom n'ouvre qu'aux invitations en attente).
 * /api/online/rooms/rejoinable ne le concerne pas : cette route ne propose que
 * les parties EN COURS d'où l'on est parti (leftAt), or on n'expulse qu'au
 * lobby, sans état de jeu.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId, userId: targetUserId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    select: { id: true, hostUserId: true, status: true },
  })
  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }
  if (room.hostUserId !== user.id) {
    return NextResponse.json(onlineErrorBody('not_host'), { status: 403 })
  }
  if (room.status !== 'waiting') {
    return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })
  }
  if (targetUserId === user.id) {
    return NextResponse.json(onlineErrorBody('cannot_kick_self'), { status: 400 })
  }

  const member = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: targetUserId } },
    select: { userId: true },
  })
  if (!member) {
    return NextResponse.json(onlineErrorBody('member_not_found'), { status: 404 })
  }

  // L'hôte ne s'expulse jamais (vérifié ci-dessus) : aucun transfert d'hôte
  // n'aura lieu ici. kickMember invalide déjà le cache du guichet. La raison
  // suit le retiré : son 403 dira que l'hôte l'a retiré (online/departures.ts).
  await kickMember(roomId, room.hostUserId, targetUserId, 'kicked')
  publishRoomChanged(roomId, { type: 'lobby' })

  return NextResponse.json({ ok: true })
}
