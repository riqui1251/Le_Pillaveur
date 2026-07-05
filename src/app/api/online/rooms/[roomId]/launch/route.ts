import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

import { getCurrentUser } from '@/lib/auth-server'

import { buildRoomDto } from '@/lib/online-room'

import { launchOnlineRoom } from '@/lib/online-room-launch'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { parseRoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { getGameAdapter } from '@/lib/online/game-adapters'



type Params = { params: Promise<{ roomId: string }> }



/** L'hôte lance la partie quand tous sont prêts — initialise l'état synchronisé */

export async function POST(_request: Request, { params }: Params) {

  const user = await getCurrentUser()

  if (!user) {

    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

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

    return NextResponse.json({ error: 'Lobby introuvable' }, { status: 404 })

  }

  if (room.hostUserId !== user.id) {

    return NextResponse.json({ error: 'Seul le créateur peut lancer la partie' }, { status: 403 })

  }

  if (room.status !== 'waiting') {

    return NextResponse.json({ error: 'La partie est déjà lancée' }, { status: 409 })

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
    // Option « compléter avec des bots » (hôte) : minimum 1, le launch comble.
    const adapter = getGameAdapter(room.gameId)
    const settings = parseRoomSettings(room.settingsJson)
    const min = settings.botsFill && adapter?.botsFillable ? 1 : adapter?.minPlayers ?? 2
    const max = adapter?.maxPlayers ?? Number.MAX_SAFE_INTEGER
    if (room.members.length < min) {
      return NextResponse.json(
        { error: `Au moins ${min} joueur${min > 1 ? 's' : ''} requis pour lancer` },
        { status: 400 }
      )
    }
    if (room.members.length > max) {
      return NextResponse.json(
        { error: `Trop de joueurs pour ce jeu (max ${max})` },
        { status: 400 }
      )
    }
  }

  if (!room.members.every((m) => m.isReady)) {

    return NextResponse.json({ error: 'Tous les joueurs doivent être prêts' }, { status: 400 })

  }



  await launchOnlineRoom(roomId, room)

  publishRoomChanged(roomId, { type: 'changed' })



  const dto = await buildRoomDto(roomId, user.id)

  return NextResponse.json({ room: dto })

}

