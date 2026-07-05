import { prisma } from '@/lib/prisma'
import { launchPetitBuveurRoom } from '@/lib/online-petit-buveur'
import { launchPurpleRoom } from '@/lib/online-purple'
import { launch1220Room } from '@/lib/online-1220'
import { launchHiLoRoom } from '@/lib/online-hi-lo'
import { launchMonsieur3Room } from '@/lib/online-monsieur-3'
import { launchPmuRoom } from '@/lib/online-pmu'
import { launchPlinkoRoom } from '@/lib/online-plinko'
import { launchToucherCouleRoom } from '@/lib/online-toucher-coule'
import { launchMenteurRoom } from '@/lib/online-menteur'
import { launchImposteurRoom } from '@/lib/online-imposteur'
import { launchQuizRoom } from '@/lib/online-quiz'
import { isOnlineGameFinished, parseOnlineGameState } from '@/lib/online-game-state'

export type RoomWithMembers = {
  id: string
  gameId: string | null
  hostUserId: string
  settingsJson: string | null
  members: {
    userId: string
    user: { displayName: string }
  }[]
}

export async function resetRoomToWaitingLobby(roomId: string) {
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'waiting',
      gameStateJson: null,
      stateVersion: 0,
      currentTurnUserId: null,
    },
  })
  await prisma.onlineRoomMember.updateMany({
    where: { roomId },
    data: { isReady: false },
  })
}

/** Lance (ou relance) une partie avec état initial synchronisé selon le jeu */
export async function launchOnlineRoom(roomId: string, room: RoomWithMembers) {
  switch (room.gameId ?? '') {
    case 'petit-buveur':
      await launchPetitBuveurRoom(roomId, room)
      break
    case 'purple':
      await launchPurpleRoom(roomId, room)
      break
    case '1220':
      await launch1220Room(roomId, room)
      break
    case 'hi-lo':
      await launchHiLoRoom(roomId, room)
      break
    case 'monsieur-3':
      await launchMonsieur3Room(roomId, room)
      break
    case 'pmu':
      await launchPmuRoom(roomId, room)
      break
    case 'plinko':
      await launchPlinkoRoom(roomId, room)
      break
    case 'toucher-coule':
      await launchToucherCouleRoom(roomId, room)
      break
    case 'menteur':
      await launchMenteurRoom(roomId, room)
      break
    case 'imposteur':
      await launchImposteurRoom(roomId, room)
      break
    case 'quiz':
      await launchQuizRoom(roomId, room)
      break
    default: {
      const memberUserIds = room.members.map((m) => m.userId)
      await prisma.onlineRoom.update({
        where: { id: roomId },
        data: {
          status: 'playing',
          stateVersion: 1,
          currentTurnUserId: memberUserIds[0] ?? null,
        },
      })
    }
  }
}

/** Vote rematch : relance si tous ont voté, sinon enregistre le vote */
export async function processRematchVote(
  roomId: string,
  room: RoomWithMembers & { gameStateJson: string | null; stateVersion: number },
  userId: string
) {
  const gameId = room.gameId ?? ''
  const state = parseOnlineGameState(gameId, room.gameStateJson)
  if (!state || !gameId || !isOnlineGameFinished(gameId, state)) {
    throw new Error('La partie n\'est pas terminée')
  }

  const memberUserIds = room.members.map((m) => m.userId)
  const votes = new Set(state.rematchVotes ?? [])
  votes.add(userId)
  const rematchVotes = [...votes]

  if (rematchVotes.length >= memberUserIds.length && memberUserIds.every((id) => votes.has(id))) {
    await launchOnlineRoom(roomId, room)
  } else {
    const updatedState = {
      ...state,
      rematchVotes,
      version: state.version + 1,
    }
    await prisma.onlineRoom.update({
      where: { id: roomId },
      data: {
        gameStateJson: JSON.stringify(updatedState),
        stateVersion: room.stateVersion + 1,
      },
    })
  }
}
