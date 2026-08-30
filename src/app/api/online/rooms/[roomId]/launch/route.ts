import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

import { getCurrentUser } from '@/lib/auth-server'

import { buildRoomDto } from '@/lib/online-room'

import { publishRoomChanged } from '@/lib/online/room-bus'
import { serializeBriefing } from '@/lib/online/briefing'
import { parseRoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { mcTeamCounts } from '@/lib/mots-codes/server-adapter'
import { onlineErrorBody } from '@/lib/online-errors'



type Params = { params: Promise<{ roomId: string }> }



/** L'hôte lance la partie quand tous sont prêts — initialise l'état synchronisé */

export async function POST(_request: Request, { params }: Params) {

  const user = await getCurrentUser()

  if (!user) {

    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })

  }



  const { roomId } = await params

  const room = await prisma.onlineRoom.findUnique({

    where: { id: roomId },

    include: {

      members: {

        include: { user: true },

        orderBy: { joinedAt: 'asc' },

      },

    },

  })



  if (!room) {

    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })

  }

  if (room.hostUserId !== user.id) {

    return NextResponse.json(onlineErrorBody('host_only_launch'), { status: 403 })

  }

  if (room.status !== 'waiting') {

    return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })

  }

  // Toucher-Coulé : capacité dépendante du format d'équipes (bots de complément).
  if (room.gameId === 'toucher-coule') {
    const settings = parseRoomSettings(room.settingsJson)
    const capacity = TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam * 2
    if (room.members.length > capacity) {
      return NextResponse.json(
        { error: `Trop de joueurs pour ce format (max ${capacity})` },
        { status: 400 }
      )
    }
  } else {
    // Bornes du registre (jeux serveur-autoritaires) ; 2 joueurs par défaut.
    // Le minimum s'applique au TOTAL humains + bots choisis par l'hôte.
    const adapter = getGameAdapter(room.gameId)
    const settings = parseRoomSettings(room.settingsJson)
    const min = adapter?.minPlayers ?? 2
    const max = adapter?.maxPlayers ?? Number.MAX_SAFE_INTEGER
    const bots = adapter?.botsFillable ? Math.max(0, settings.botsCount ?? 0) : 0
    const total = room.members.length + bots
    if (total < min) {
      return NextResponse.json(
        { error: `Au moins ${min} joueur${min > 1 ? 's' : ''} requis pour lancer (bots inclus)` },
        { status: 400 }
      )
    }
    if (room.members.length > max || total > max) {
      return NextResponse.json(
        { error: `Trop de joueurs pour ce jeu (max ${max})` },
        { status: 400 }
      )
    }
  }

  // Mots Codés : 2 joueurs minimum PAR ÉQUIPE après répartition automatique.
  if (room.gameId === 'mots-codes') {
    const settings = parseRoomSettings(room.settingsJson)
    const choices: Record<string, 'gold' | 'red'> = {}
    for (const [userId, team] of Object.entries(settings.mcTeams ?? {})) {
      choices[userId] = team === 'A' ? 'gold' : 'red'
    }
    const counts = mcTeamCounts(room.members.map((m) => m.userId), choices)
    if (counts.gold < 2 || counts.red < 2) {
      return NextResponse.json(
        onlineErrorBody('team_min_players'),
        { status: 400 }
      )
    }
  }

  if (!room.members.every((m) => m.isReady)) {

    return NextResponse.json(onlineErrorBody('players_not_ready'), { status: 400 })

  }



  // La partie ne démarre PAS tout de suite : briefing tuto synchronisé — la
  // vraie création de l'état de jeu a lieu dans /briefing-ack, quand TOUS les
  // joueurs ont fini de lire (ou au timeout). Le rematch, lui, appelle
  // launchOnlineRoom en direct et saute donc le briefing.
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'briefing',
      briefingJson: serializeBriefing({ startedAt: Date.now(), acks: [] }),
    },
  })

  publishRoomChanged(roomId, { type: 'changed' })



  const dto = await buildRoomDto(roomId, user.id)

  return NextResponse.json({ room: dto })

}

