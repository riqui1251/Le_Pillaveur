import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildTabouState, serializeTabouState } from '@/lib/tabou/server-adapter'
import { currentTabouActorId, type TabouTeam } from '@/lib/tabou/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Tabou Vocal — SERVEUR-AUTORITAIRE. Les
 * mots sont tirés dans la LANGUE de la salle ; les équipes sont celles
 * choisies au lobby (réutilise le sélecteur d'équipes de Toucher-Coulé).
 */
export async function launchTabouRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const teamChoices = (settings.tabouTeams ?? {}) as Record<string, TabouTeam>
  const members = room.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName }))

  const state = buildTabouState(
    members,
    teamChoices,
    settings.lang,
    settings.botsCount ?? 0,
    undefined,
    settings.tabouTargetScore
  )

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeTabouState(state),
      stateVersion: 1,
      currentTurnUserId: currentTabouActorId(state),
    },
  })
}
