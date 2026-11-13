import { prisma } from '@/lib/prisma'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { parseRoomSettings } from '@/lib/online-game-state'
import { buildVdnOnlineState, serializeVdnOnlineState } from './server-adapter'
import { readVdnRoomSettings } from './themes'

/**
 * Lance (ou relance) une partie d'À Vue de Nez — SERVEUR-AUTORITAIRE, graine
 * neuve à chaque lancement. Questions dans la LANGUE de la salle, nombre et
 * thèmes choisis par l'hôte (défauts du jeu local : 10 questions, tout
 * mélangé). Estimations simultanées : personne « au tour ».
 */
export async function launchVueDeNezRoom(roomId: string, room: RoomWithMembers) {
  const settings = parseRoomSettings(room.settingsJson)
  const { questionCount, themes } = readVdnRoomSettings(settings)
  const state = buildVdnOnlineState(room.members, {
    lang: settings.lang,
    botsCount: settings.botsCount ?? 0,
    questionCount,
    themes,
  })
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: serializeVdnOnlineState(state),
      stateVersion: 1,
      currentTurnUserId: null,
    },
  })
}
