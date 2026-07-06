import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildQuizState, serializeQuizState } from '@/lib/quiz/server-adapter'
import { QUIZ_COUNTS, QUIZ_DEFAULT_COUNT } from '@/lib/quiz/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie du Grand Pillaveur — SERVEUR-AUTORITAIRE.
 * Questions tirées dans la LANGUE de la salle ; nombre choisi par l'hôte.
 */
export async function launchQuizRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const count = QUIZ_COUNTS.includes(settings.quizCount as (typeof QUIZ_COUNTS)[number])
    ? (settings.quizCount as number)
    : QUIZ_DEFAULT_COUNT
  const state = buildQuizState(room.members, settings.lang, count, settings.botsCount ?? 0)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeQuizState(state),
      stateVersion: 1,
      // Réponses simultanées : pas d'acteur unique (échéances serveur).
      currentTurnUserId: null,
    },
  })
}
