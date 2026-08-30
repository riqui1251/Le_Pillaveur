import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, cleanupAbandonedRooms, createUniqueRoomCode, deleteRoomIfEmpty } from '@/lib/online-room'
import { GAMES } from '@/lib/games'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { onlineErrorBody } from '@/lib/online-errors'

const ROOM_LANGS = new Set(['fr', 'en', 'es', 'it'])

/** Créer un lobby pour un jeu précis */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
    }

    const body = await request.json()
    const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : ''
    const game = GAMES.find((g) => g.id === gameId && !g.hidden)
    if (!game) {
      return NextResponse.json(onlineErrorBody('invalid_game'), { status: 400 })
    }

    const previousMemberships = await prisma.onlineRoomMember.findMany({
      where: { userId: user.id },
      select: { roomId: true },
    })
    await prisma.onlineRoomMember.deleteMany({ where: { userId: user.id } })
    await Promise.all(previousMemberships.map((m) => deleteRoomIfEmpty(m.roomId)))
    await cleanupAbandonedRooms()

    // Langue de la SALLE (contenu localisé côté serveur, ex. mots de
    // l'Imposteur) : celle du créateur au moment de la création.
    const cookieLang = (await cookies()).get(LOCALE_COOKIE)?.value
    const lang = cookieLang && ROOM_LANGS.has(cookieLang) ? cookieLang : 'fr'

    // Visibilité choisie à la création (l'hôte peut la changer ensuite dans
    // les réglages du lobby) : 'public' = visible dans la liste des lobbies,
    // 'private' (défaut) = accessible par code/QR/invitation seulement.
    const visibility = body.visibility === 'public' ? 'public' : 'private'

    const code = await createUniqueRoomCode()
    const room = await prisma.onlineRoom.create({
      data: {
        code,
        gameId,
        hostUserId: user.id,
        visibility,
        settingsJson: JSON.stringify(
          gameId === 'plinko'
            ? { plinkoDifficulty: 'medium', lang }
            : { difficulty: 'normal', lang }
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
      onlineErrorBody('server_error'),
      { status: 500 }
    )
  }
}
