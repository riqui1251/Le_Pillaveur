import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildEspionState, serializeEspionState } from '@/lib/espion/server-adapter'
import { currentEspionActorId } from '@/lib/espion/engine'
import { espionDiscussionMinutes } from '@/lib/espion/discussion'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Qui est l'Espion ? — SERVEUR-AUTORITAIRE.
 * Les lieux sont tirés dans la LANGUE de la salle (posée à sa création).
 * Discussion réglée par l'hôte (3, 5 ou 7 min) ; sans choix de sa part,
 * 5 min, ou 3 min quand il est le seul humain face aux bots
 * (espionDiscussionMinutes) — recalculée à chaque relance, avec les humains
 * alors présents.
 */
export async function launchEspionRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const discussionMs = espionDiscussionMinutes(settings.espionDiscussionMin, room.members.length) * 60_000
  const state = buildEspionState(
    room.members,
    settings.lang,
    settings.botsCount ?? 0,
    undefined,
    discussionMs,
    settings.espionRoundsToWin
  )

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeEspionState(state),
      stateVersion: 1,
      currentTurnUserId: currentEspionActorId(state),
    },
  })
}
