import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, createUniqueRoomCode } from '@/lib/online-room'
import { GAMES } from '@/lib/games'

/** Créer un lobby pour un jeu précis */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Connectez-vous pour jouer en ligne' }, { status: 401 })
    }

    const body = await request.json()
    const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : ''
    const game = GAMES.find((g) => g.id === gameId && !g.hidden)
    if (!game) {
      return NextResponse.json({ error: 'Jeu invalide' }, { status: 400 })
    }

    await prisma.onlineRoomMember.deleteMany({ where: { userId: user.id } })

    const code = await createUniqueRoomCode()
    const room = await prisma.onlineRoom.create({
      data: {
        code,
        gameId,
        hostUserId: user.id,
        settingsJson: JSON.stringify(
          gameId === 'plinko'
            ? { plinkoDifficulty: 'medium' }
            : { difficulty: 'normal' }
        ),
        members: {
          create: { userId: user.id, isReady: false },
        },
      },
    })

    const dto = await buildRoomDto(room.id, user.id)
    return NextResponse.json({ room: dto })
  } catch (err) {
    console.error('[POST /api/online/rooms]', err)
    return NextResponse.json(
      { error: 'Erreur serveur lors de la création du lobby' },
      { status: 500 }
    )
  }
}
