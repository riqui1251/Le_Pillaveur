import { prisma } from '@/lib/prisma'
import { createSeededRng, randomSeed } from '@/lib/online-rng'
import { createPurpleDeck } from '@/lib/online-purple'
import { parseRoomSettings } from '@/lib/online-game-state'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { getMemberUserIds, getFirstTurnUserId } from '@/lib/online-members'
import { onlinePlayerId } from '@/lib/online-players'

export function buildHiLoInitialState(room: RoomWithMembers) {
  const settings = parseRoomSettings(room.settingsJson)
  const gameMode = settings.hiLoMode ?? 'standard'
  const memberUserIds = getMemberUserIds(room)
  const playerIds = room.members.map((m) => onlinePlayerId(m.userId))
  const rng = createSeededRng(randomSeed())
  const deck = createPurpleDeck(() => rng())
  const firstCard = deck[0] ?? null
  const remainingDeck = deck.slice(1)
  const firstPlayer =
    gameMode === 'standard' ? Math.floor(rng() * memberUserIds.length) : 0
  const targetGuesses = gameMode === 'traversee' ? Math.max(3, playerIds.length + 2) : 5

  return {
    version: 1,
    memberUserIds,
    gameStarted: true,
    currentPlayer: firstPlayer,
    gameMode,
    deck: remainingDeck,
    currentCard: firstCard,
    nextCard: null,
    drinkCounter: 1,
    gameOver: false,
    showResult: false,
    lastGuess: null,
    isCorrect: null,
    gameResults: {} as Record<string, number>,
    showGameOver: false,
    showIncorrectDialog: false,
    isFlipping: false,
    isProcessing: false,
    isUnguessedEqual: false,
    activePlayerIds: playerIds,
    correctGuessesInRow: 0,
    targetGuesses,
    rematchVotes: [] as string[],
  }
}

export async function launchHiLoRoom(roomId: string, room: RoomWithMembers) {
  const initialState = buildHiLoInitialState(room)
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'playing',
      gameStateJson: JSON.stringify(initialState),
      stateVersion: 1,
      currentTurnUserId: getMemberUserIds(room)[initialState.currentPlayer] ?? getFirstTurnUserId(room),
    },
  })
}
