import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import {
  parseEngineState,
  serializeEngineState,
  applyRoomAction,
  applyBotAction,
  convertPlayerToBot,
  replaceExpiredWithBots,
  toClientView,
} from '@/lib/petit-buveur/server-adapter'
import { currentPlayerId, type EngineState } from '@/lib/petit-buveur/engine'
import {
  parseTCState,
  serializeTCState,
  applyTCRoomAction,
  convertTCPlayerToBot,
  tcClientViewJson,
  type TCRoomActionInput,
} from '@/lib/toucher-coule/server-adapter'
import { currentTCPlayerId, toTCClientView, type TCState } from '@/lib/toucher-coule/engine'

type Params = { params: Promise<{ roomId: string }> }

const SERVER_AUTHORITATIVE_GAMES = new Set(['petit-buveur', 'toucher-coule'])

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
 * Action de jeu SERVEUR-AUTORITAIRE (Petit Buveur / Toucher-Coulé en ligne).
 *
 * Le client n'envoie qu'une intention : le serveur détient l'état, valide le
 * tour via le moteur, applique le réducteur, persiste et diffuse en SSE.
 * Ticks communs à tous les jeux : `bot` (un coup de bot), `replace-left`
 * (joueur parti depuis 3 min → bot), `replace-afk` (joueur au tour inactif
 * 3 min → expulsé + bot). Voir src/lib/online/replacement.ts.
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
  if (!room.gameId || !SERVER_AUTHORITATIVE_GAMES.has(room.gameId)) {
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

  if (room.gameId === 'toucher-coule') {
    const state = parseTCState(room.gameStateJson)
    if (!state) {
      return NextResponse.json({ error: 'État de partie invalide' }, { status: 400 })
    }

    let next: TCState
    let kickedUserId: string | null = null

    if (body.action === 'replace-afk') {
      const candidate = afkCandidate(room, user.id)
      if ('error' in candidate) {
        return NextResponse.json({ error: candidate.error }, { status: 409 })
      }
      const converted = convertTCPlayerToBot(state, candidate.userId)
      if (!converted) {
        return NextResponse.json({ error: 'NOTHING_TO_REPLACE' }, { status: 409 })
      }
      next = converted
      kickedUserId = candidate.userId
    } else {
      let input: TCRoomActionInput
      if (body.action === 'place' && Array.isArray(body.ships)) {
        input = { type: 'place', ships: body.ships as number[][] }
      } else if (body.action === 'fire' && typeof body.cell === 'number') {
        input = { type: 'fire', cell: body.cell }
      } else if (body.action === 'bot') {
        input = { type: 'bot' }
      } else if (body.action === 'replace-left') {
        input = { type: 'replace-left' }
      } else {
        return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
      }
      const result = applyTCRoomAction(state, user.id, input)
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 403 })
      }
      next = result.state
    }

    const nextVersion = room.stateVersion + 1
    const finished = next.phase === 'finished'

    await prisma.onlineRoom.update({
      where: { id: roomId },
      data: {
        gameStateJson: serializeTCState(next),
        stateVersion: nextVersion,
        currentTurnUserId: finished ? null : currentTCPlayerId(next),
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
      view: toTCClientView(next, user.id),
      viewJson: tcClientViewJson(next, user.id),
    })
  }

  // ── Petit Buveur ──────────────────────────────────────────────────────────
  const state = parseEngineState(room.gameStateJson)
  if (!state) {
    return NextResponse.json({ error: 'État de partie invalide' }, { status: 400 })
  }

  let next: EngineState
  let kickedUserId: string | null = null

  if (body.action === 'replace-afk') {
    const candidate = afkCandidate(room, user.id)
    if ('error' in candidate) {
      return NextResponse.json({ error: candidate.error }, { status: 409 })
    }
    const converted = convertPlayerToBot(state, candidate.userId)
    if (!converted) {
      return NextResponse.json({ error: 'NOTHING_TO_REPLACE' }, { status: 409 })
    }
    next = converted
    kickedUserId = candidate.userId
  } else if (body.action === 'replace-left') {
    const replaced = replaceExpiredWithBots(state, Date.now(), ONLINE_REPLACE_GRACE_MS)
    if (!replaced) {
      return NextResponse.json({ error: 'NOTHING_TO_REPLACE' }, { status: 409 })
    }
    next = replaced
  } else if (body.action === 'bot') {
    const result = applyBotAction(state)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 403 })
    }
    next = result.state
  } else {
    const input =
      body.action === 'resolve'
        ? {
            type: 'resolve' as const,
            choice:
              body.choice && typeof body.choice === 'object' ? body.choice : undefined,
          }
        : { type: 'roll' as const }

    const result = applyRoomAction(state, user.id, input)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 403 })
    }
    next = result.state
  }

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
  if (kickedUserId) await kickMember(roomId, room.hostUserId, kickedUserId)

  publishRoomChanged(roomId, {
    type: finished ? 'finished' : 'changed',
    stateVersion: nextVersion,
  })

  return NextResponse.json({ ok: true, stateVersion: nextVersion, view: toClientView(next) })
}
