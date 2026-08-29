import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { findLeftHumanPlayer, ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { SERVER_AUTHORITATIVE_GAMES } from '@/lib/online/game-adapters'
import { onlineErrorBody } from '@/lib/online-errors'

const REPLACEABLE_GAMES = SERVER_AUTHORITATIVE_GAMES

/**
 * Partie en cours que l'utilisateur peut REJOINDRE : il en est parti
 * (leftAt marqué) et un bot ne l'a pas encore remplacé. Générique à tous
 * les jeux serveur-autoritaires (contrat `players[]` — voir replacement.ts).
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const rooms = await prisma.onlineRoom.findMany({
    where: { status: 'playing', gameId: { in: REPLACEABLE_GAMES } },
    select: { id: true, code: true, gameId: true, gameStateJson: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  for (const room of rooms) {
    const player = findLeftHumanPlayer(room.gameStateJson, user.id)
    if (!player) continue
    const deadline = (player.leftAt ?? 0) + ONLINE_REPLACE_GRACE_MS
    return NextResponse.json({
      rejoinable: {
        roomId: room.id,
        code: room.code,
        gameId: room.gameId,
        /** Millisecondes restantes avant remplacement par un bot (indicatif). */
        graceLeftMs: Math.max(0, deadline - Date.now()),
      },
    })
  }

  return NextResponse.json({ rejoinable: null })
}
