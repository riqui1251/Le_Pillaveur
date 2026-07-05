import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildLGState, serializeLGState } from '@/lib/loup-garou/server-adapter'
import { currentLGActorId, LG_DEBATE_CHOICES_MIN, LG_DEBATE_DEFAULT_MS } from '@/lib/loup-garou/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Loup-Garou — SERVEUR-AUTORITAIRE.
 * Durée du débat réglée par l'hôte (1-5 min, défaut 3).
 */
export async function launchLoupGarouRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const debateMs = LG_DEBATE_CHOICES_MIN.includes(
    settings.lgDebateMin as (typeof LG_DEBATE_CHOICES_MIN)[number]
  )
    ? (settings.lgDebateMin as number) * 60_000
    : LG_DEBATE_DEFAULT_MS
  const state = buildLGState(room.members, debateMs)

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
