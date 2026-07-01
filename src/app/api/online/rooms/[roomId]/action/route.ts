import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { publishRoomChanged } from '@/lib/online/room-bus'
import {
  parseEngineState,
  serializeEngineState,
  applyRoomAction,
  toClientView,
} from '@/lib/petit-buveur/server-adapter'
import { currentPlayerId } from '@/lib/petit-buveur/engine'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Action de jeu SERVEUR-AUTORITAIRE (Petit Buveur en ligne).
 *
 * Le client n'envoie qu'une intention (`roll` / `resolve`) : le serveur détient
 * l'état, valide le tour via le moteur, applique `reduce`, persiste et diffuse
 * le changement en SSE. La réponse ne contient que la vue client (sans `rngState`).
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
  if (room.gameId !== 'petit-buveur') {
    return NextResponse.json({ error: 'Jeu non supporté par ce mode' }, { status: 400 })
  }
  if (!room.members.some((m) => m.userId === user.id)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const state = parseEngineState(room.gameStateJson)
  if (!state) {
    return NextResponse.json({ error: 'État de partie invalide' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const actionType = body.action === 'resolve' ? 'resolve' : 'roll'

  // Concurrence optimiste : évite les actions basées sur un état périmé.
  const expectedVersion =
    typeof body.expectedVersion === 'number' ? body.expectedVersion : room.stateVersion
  if (expectedVersion !== room.stateVersion) {
    return NextResponse.json(
      { error: 'Conflit de version', stateVersion: room.stateVersion },
      { status: 409 }
    )
  }

  const result = applyRoomAction(state, user.id, { type: actionType })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 })
  }

  const next = result.state
  const nextVersion = room.stateVersion + 1
  const finished = next.phase === 'finished'

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      gameStateJson: serializeEngineState(next),
      stateVersion: nextVersion,
      currentTurnUserId: finished ? null : currentPlayerId(next),
    },
  })

  publishRoomChanged(roomId, {
    type: finished ? 'finished' : 'changed',
    stateVersion: nextVersion,
  })

  return NextResponse.json({ ok: true, stateVersion: nextVersion, view: toClientView(next) })
}
