import { prisma } from '@/lib/prisma'
import { createSeededRng, randomSeed, shuffleWithRng } from '@/lib/online-rng'
import type { SerializedCard } from '@/lib/online-game-state'
import type { RoomWithMembers } from '@/lib/online-room-launch'
import { getFirstTurnUserId, getMemberUserIds } from '@/lib/online-members'

const CARD_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'] as const
const CARD_SUITS = ['♠', '♥', '♦', '♣'] as const

export function createPurpleDeck(rng: () => number): SerializedCard[] {
  const deck = CARD_SUITS.flatMap((suit) =>
    CARD_VALUES.map((value) => ({
      value,
      suit,
      color: suit === '♥' || suit === '♦' ? ('red' as const) : ('black' as const),
    }))
  )
  return shuffleWithRng(deck, rng)
}

export function buildPurpleInitialState(room: RoomWithMembers) {
  const memberUserIds = getMemberUserIds(room)
  const rng = createSeededRng(randomSeed())
  const deck = createPurpleDeck(() => rng())
  const firstPlayer = Math.floor(rng() * memberUserIds.length)

  return {
    version: 1,
    memberUserIds,
    gameStarted: true,
    currentPlayer: firstPlayer,
    drinkCounter: 0,
    deck,
    gameResults: {} as Record<string, number>,
    drawnCards: [] as SerializedCard[],
    lastBet: null,
    isCorrect: null,
    isRevealing: false,
    canContinue: false,
    showResult: false,
    amountToDrink: 0,
    cardHistory: [] as SerializedCard[],
    totalCardsDrawn: 0,
    rematchVotes: [] as string[],
  }
}

export async function launchPurpleRoom(roomId: string, room: RoomWithMembers) {
  const initialState = buildPurpleInitialState(room)
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
