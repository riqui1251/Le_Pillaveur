import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, createUniqueRoomCode } from '@/lib/online-room'
import { GAMES } from '@/lib/games'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'

const ROOM_LANGS = new Set(['fr', 'en', 'es', 'it'])

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

    // Langue de la SALLE (contenu localisé côté serveur, ex. mots de
    // l'Imposteur) : celle du créateur au moment de la création.
    const cookieLang = (await cookies()).get(LOCALE_COOKIE)?.value
    const lang = cookieLang && ROOM_LANGS.has(cookieLang) ? cookieLang : 'fr'

    const code = await createUniqueRoomCode()
    const room = await prisma.onlineRoom.create({
      data: {
        code,
        gameId,
        hostUserId: user.id,
        // Privé par défaut : la salle ne s'affiche pas dans la liste publique
        // (on la rejoint par code/QR/invitation) ; l'hôte peut l'ouvrir.
        visibility: 'private',
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
      { error: 'Erreur serveur lors de la création du lobby' },
      { status: 500 }
    )
  }
}
