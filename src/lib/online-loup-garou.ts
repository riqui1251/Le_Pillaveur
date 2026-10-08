import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildLGState, serializeLGState } from '@/lib/loup-garou/server-adapter'
import { currentLGActorId } from '@/lib/loup-garou/engine'
import { lgDebateMinutes } from '@/lib/loup-garou/debate'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Loup-Garou — SERVEUR-AUTORITAIRE.
 * Durée du débat réglée par l'hôte (1-5 min) ; sans choix de sa part, 3 min,
 * ou 1 min quand il est le seul humain face aux bots (lgDebateMinutes) —
 * recalculée à chaque relance, avec les humains alors présents.
 */
export async function launchLoupGarouRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const debateMs = lgDebateMinutes(settings.lgDebateMin, room.members.length) * 60_000
  const state = buildLGState(
    room.members,
    debateMs,
    settings.botsCount ?? 0,
    undefined,
    settings.lgExtraWolf === true
  )

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeLGState(state),
      stateVersion: 1,
      // Jamais un rôle de vivant : null hors phase du chasseur.
      currentTurnUserId: currentLGActorId(state),
    },
  })
}
