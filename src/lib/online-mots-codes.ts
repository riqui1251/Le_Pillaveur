import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildMCState, serializeMCState } from '@/lib/mots-codes/server-adapter'
import { currentMCActorId, type MCTeam } from '@/lib/mots-codes/engine'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie de Mots Codés — SERVEUR-AUTORITAIRE. Les mots
 * sont tirés dans la LANGUE de la salle ; les équipes viennent du sélecteur
 * du lobby (les non-assignés sont répartis automatiquement).
 */
export async function launchMotsCodesRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  // Le sélecteur du lobby parle en A/B (comme TC/Tabou) : A = Or, B = Rouge.
  const teamChoices: Record<string, MCTeam> = {}
  for (const [userId, team] of Object.entries(settings.mcTeams ?? {})) {
    teamChoices[userId] = team === 'A' ? 'gold' : 'red'
  }
  const members = room.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName }))

  const state = buildMCState(members, teamChoices, settings.lang)

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeMCState(state),
      stateVersion: 1,
      currentTurnUserId: currentMCActorId(state),
    },
  })
}
