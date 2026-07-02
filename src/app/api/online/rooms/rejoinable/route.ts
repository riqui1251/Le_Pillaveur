import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { parseTCState } from '@/lib/toucher-coule/server-adapter'
import { TC_REJOIN_GRACE_MS } from '@/lib/toucher-coule/engine'

/**
 * Partie en cours que l'utilisateur peut REJOINDRE : il en est parti
 * (leftAt marqué) et un bot ne l'a pas encore remplacé.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const rooms = await prisma.onlineRoom.findMany({
    where: { status: 'playing', gameId: 'toucher-coule' },
    select: { id: true, code: true, gameId: true, gameStateJson: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  })

  for (const room of rooms) {
    const state = parseTCState(room.gameStateJson)
    if (!state || state.phase === 'finished') continue
    const player = state.players.find((p) => p.id === user.id && !p.isBot && p.leftAt)
    if (!player) continue
    const deadline = (player.leftAt ?? 0) + TC_REJOIN_GRACE_MS
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
