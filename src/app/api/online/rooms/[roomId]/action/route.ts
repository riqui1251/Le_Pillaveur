import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { getGameAdapter } from '@/lib/online/game-adapters'

type Params = { params: Promise<{ roomId: string }> }

type RoomRow = {
  id: string
  hostUserId: string
  currentTurnUserId: string | null
  updatedAt: Date
  stateVersion: number
}

/**
 * Valide une demande de remplacement AFK avec l'horloge SERVEUR :
 * le joueur au tour n'a rien joué depuis le délai de grâce
 * (`updatedAt` de la salle = dernière écriture d'état).
 */
function afkCandidate(room: RoomRow, requesterId: string): { userId: string } | { error: string } {
  if (!room.currentTurnUserId) return { error: 'NO_ACTIVE_PLAYER' }
  if (room.currentTurnUserId === requesterId) return { error: 'CANNOT_AFK_SELF' }
  const elapsed = Date.now() - room.updatedAt.getTime()
  if (elapsed < ONLINE_REPLACE_GRACE_MS) return { error: 'NOT_AFK_YET' }
  return { userId: room.currentTurnUserId }
}

/** Expulse un membre remplacé par un bot ; réassigne l'hôte si nécessaire. */
async function kickMember(roomId: string, hostUserId: string, kickedUserId: string) {
  await prisma.onlineRoomMember.deleteMany({ where: { roomId, userId: kickedUserId } })
  if (hostUserId === kickedUserId) {
    const nextHost = await prisma.onlineRoomMember.findFirst({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
    })
    if (nextHost) {
      await prisma.onlineRoom.update({
        where: { id: roomId },
        data: { hostUserId: nextHost.userId },
      })
    }
  }
}

/**
 * Action de jeu SERVEUR-AUTORITAIRE — GÉNÉRIQUE à tous les jeux du registre
 * (`src/lib/online/game-adapters.ts`).
 *
 * Le client n'envoie qu'une intention : le serveur détient l'état, valide le
 * tour via le moteur du jeu, applique le réducteur, persiste et diffuse en
 * SSE. Ticks communs : `bot` (un coup de bot), `replace-left` (joueur parti
 * depuis 3 min → bot), `replace-afk` (joueur au tour inactif 3 min → expulsé
 * + bot). Voir src/lib/online/replacement.ts.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: { members: { select: { userId: true } } },
  })

  if (!room || room.status !== 'playing') {
    return NextResponse.json({ error: 'Partie non active' }, { status: 400 })
  }
  const adapter = getGameAdapter(room.gameId)
  if (!adapter) {
    return NextResponse.json({ error: 'Jeu non supporté par ce mode' }, { status: 400 })
  }
  if (!room.members.some((m) => m.userId === user.id)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))

  // Concurrence optimiste : évite les actions basées sur un état périmé.
  const expectedVersion =
    typeof body.expectedVersion === 'number' ? body.expectedVersion : room.stateVersion
  if (expectedVersion !== room.stateVersion) {
    return NextResponse.json(
      { error: 'Conflit de version', stateVersion: room.stateVersion },
      { status: 409 }
    )
  }

  const state = adapter.parse(room.gameStateJson)
  if (!state) {
    return NextResponse.json({ error: 'État de partie invalide' }, { status: 400 })
  }

  let next: unknown
  let kickedUserId: string | null = null

  if (body.action === 'replace-afk') {
    const candidate = afkCandidate(room, user.id)
    if ('error' in candidate) {
      return NextResponse.json({ error: candidate.error }, { status: 409 })
    }
    const converted = adapter.convertToBot(state, candidate.userId)
    if (!converted) {
      return NextResponse.json({ error: 'NOTHING_TO_REPLACE' }, { status: 409 })
    }
    next = converted
    kickedUserId = candidate.userId
  } else {
    const result = adapter.applyAction(state, user.id, body)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    next = result.state
  }

  const nextVersion = room.stateVersion + 1
  const finished = adapter.isFinished(next)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      gameStateJson: adapter.serialize(next),
      stateVersion: nextVersion,
      currentTurnUserId: finished ? null : adapter.currentActorId(next),
    },
  })
  if (kickedUserId) await kickMember(roomId, room.hostUserId, kickedUserId)

  publishRoomChanged(roomId, {
    type: finished ? 'finished' : 'changed',
    stateVersion: nextVersion,
  })

  return NextResponse.json({
    ok: true,
    stateVersion: nextVersion,
    ...adapter.actionResponse(next, user.id),
  })
}
