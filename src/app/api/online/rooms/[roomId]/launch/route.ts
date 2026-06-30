import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

import { getCurrentUser } from '@/lib/auth-server'

import { buildRoomDto } from '@/lib/online-room'

import { launchOnlineRoom } from '@/lib/online-room-launch'
import { publishRoomChanged } from '@/lib/online/room-bus'



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

  if (room.members.length < 2) {

    return NextResponse.json({ error: 'Au moins 2 joueurs requis pour lancer' }, { status: 400 })

  }

  if (!room.members.every((m) => m.isReady)) {

    return NextResponse.json({ error: 'Tous les joueurs doivent être prêts' }, { status: 400 })

  }



  await launchOnlineRoom(roomId, room)

  publishRoomChanged(roomId, { type: 'changed' })



  const dto = await buildRoomDto(roomId, user.id)

  return NextResponse.json({ room: dto })

}

