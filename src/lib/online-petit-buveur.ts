import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildPetitBuveurEngineState, serializeEngineState } from '@/lib/petit-buveur/server-adapter'
import { randomSeed } from '@/lib/petit-buveur/rng'
import type { Difficulty } from '@/lib/petit-buveur/types'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

export { resetRoomToWaitingLobby } from '@/lib/online-room-launch'

/**
 * Lance (ou relance) une partie Petit Buveur en ligne — SERVEUR-AUTORITAIRE.
 *
 * Construit un `EngineState` déterministe (moteur pur) stocké dans
 * `gameStateJson`. Les actions passent par `POST /api/online/rooms/[roomId]/action`
 * qui applique le moteur côté serveur. Une graine aléatoire est générée à chaque
 * lancement (donc chaque rematch rejoue une partie différente).
 */
export async function launchPetitBuveurRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const difficulty = (settings.difficulty ?? 'normal') as Difficulty
  const members = room.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName }))
  const state = buildPetitBuveurEngineState(members, difficulty, randomSeed())

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeEngineState(state),
      stateVersion: 1,
      currentTurnUserId: members[0]?.userId ?? null,
    },
  })
}
