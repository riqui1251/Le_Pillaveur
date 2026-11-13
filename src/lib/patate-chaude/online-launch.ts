import { prisma } from '@/lib/prisma'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildPcState, pcSettingsFromRoom, serializePcState } from './server-adapter'
import { currentPcActorId } from './online-shared'

/**
 * Lance (ou relance) une partie de Patate Chaude — SERVEUR-AUTORITAIRE, graine neuve à chaque
 * lancement. Défis dans la LANGUE de la salle ; réglages de l'hôte (défis, mèche, manches), avec
 * les défauts du jeu local. Aucun bot : `settings.botsCount`, qu'un PUT /settings accepte pour
 * tout jeu, est ignoré.
 */
export async function launchPatateChaudeRoom(roomId: string, room: RoomWithMembers) {
  const settings = parseRoomSettings(room.settingsJson)
  const state = buildPcState(room.members, pcSettingsFromRoom(settings), settings.lang)
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializePcState(state),
      stateVersion: 1,
      // Compte à rebours d'allumage : personne n'est encore « au tour ».
      currentTurnUserId: currentPcActorId(state),
    },
  })
}
