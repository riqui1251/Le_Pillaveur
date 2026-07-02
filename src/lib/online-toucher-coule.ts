import { prisma } from '@/lib/prisma'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildTCState, serializeTCState } from '@/lib/toucher-coule/server-adapter'
import { currentTCPlayerId, type TCMode, type TeamId } from '@/lib/toucher-coule/engine'
import { randomSeed } from '@/lib/petit-buveur/rng'

type LaunchRoom = {
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

/**
 * Lance (ou relance) une partie Toucher-Coulé — SERVEUR-AUTORITAIRE.
 * Les sièges vides sont comblés par des bots joués côté serveur, donc un
 * joueur seul peut lancer une partie complète.
 */
export async function launchToucherCouleRoom(roomId: string, room: LaunchRoom) {
  const settings = parseRoomSettings(room.settingsJson)
  const mode = (settings.tcMode ?? '1v1') as TCMode
  const teamChoices = (settings.tcTeams ?? {}) as Record<string, TeamId>
  const members = room.members.map((m) => ({ userId: m.userId, displayName: m.user.displayName }))

  const state = buildTCState(members, mode, teamChoices, randomSeed())

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeTCState(state),
      stateVersion: 1,
      currentTurnUserId: currentTCPlayerId(state),
    },
  })
}
