import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { hashToken } from '@/lib/auth-server'
import {
  applyRoll,
  createInitialGameState,
  replaceDisconnectedByBot,
  resolveChallenge,
  type OnlineDifficulty,
  type OnlineGameState,
  type OnlineVisibility,
} from '@/lib/online/engine'
import { ONLINE_VERIFIABLE_CHALLENGES } from '@/lib/online/challenges'
import { emitLobbyUpdate } from '@/lib/online/ws-bus'

const RECONNECT_GRACE_MS = 2 * 60 * 1000

export function createReconnectToken(): string {
  return randomBytes(24).toString('hex')
}

function parseState(value: string | null): OnlineGameState | null {
  if (!value) return null
  try {
    return JSON.parse(value) as OnlineGameState
  } catch {
    return null
  }
}

export async function createLobby(params: {
  hostUserId: string
  hostDisplayName: string
  difficulty: OnlineDifficulty
  visibility: OnlineVisibility
}) {
  const token = createReconnectToken()
  const playerId = `p_${randomBytes(8).toString('hex')}`
  const state = createInitialGameState([
    { id: playerId, name: params.hostDisplayName, isBot: false, connected: true, position: 0, drinks: 0 },
  ])

  const lobby = await prisma.onlineLobby.create({
    data: {
      game: 'petit-buveur',
      hostUserId: params.hostUserId,
      visibility: params.visibility,
      difficulty: params.difficulty,
      status: 'waiting',
      stateJson: JSON.stringify(state),
      players: {
        create: {
          userId: params.hostUserId,
          displayName: params.hostDisplayName,
          seatIndex: 0,
          reconnectTokenHash: hashToken(token),
          status: 'connected',
        },
      },
    },
  })
  return { lobbyId: lobby.id, playerId, token }
}

export async function joinLobby(lobbyId: string, userId: string, displayName: string) {
  const lobby = await prisma.onlineLobby.findUnique({
    where: { id: lobbyId },
    include: { players: { orderBy: { seatIndex: 'asc' } } },
  })
  if (!lobby) throw new Error('LOBBY_NOT_FOUND')
  if (lobby.status === 'finished') throw new Error('LOBBY_FINISHED')
  if (lobby.players.length >= 8) throw new Error('LOBBY_FULL')

  const token = createReconnectToken()
  const seat = lobby.players.length
  const playerId = `p_${randomBytes(8).toString('hex')}`
  const state = parseState(lobby.stateJson) ?? createInitialGameState([])
  state.players.push({ id: playerId, name: displayName, isBot: false, connected: true, position: 0, drinks: 0 })

  await prisma.onlineLobby.update({
    where: { id: lobby.id },
    data: {
      status: state.players.length >= 2 ? 'active' : 'waiting',
      stateJson: JSON.stringify(state),
      players: {
        create: {
          userId,
          displayName,
          seatIndex: seat,
          reconnectTokenHash: hashToken(token),
          status: 'connected',
        },
      },
    },
  })
  return { playerId, token }
}

export async function heartbeat(lobbyId: string, token: string) {
  const tokenHash = hashToken(token)
  const now = new Date()
  await prisma.onlineLobbyPlayer.updateMany({
    where: { lobbyId, reconnectTokenHash: tokenHash },
    data: { lastSeenAt: now, status: 'connected', disconnectedAt: null },
  })
}

export async function markDisconnectedStalePlayers(lobbyId: string) {
  const cutoff = new Date(Date.now() - RECONNECT_GRACE_MS)
  await prisma.onlineLobbyPlayer.updateMany({
    where: { lobbyId, status: 'connected', isBot: false, lastSeenAt: { lt: cutoff } },
    data: { status: 'disconnected', disconnectedAt: new Date() },
  })
}

export async function getLobbyState(lobbyId: string) {
  await markDisconnectedStalePlayers(lobbyId)
  const lobby = await prisma.onlineLobby.findUnique({
    where: { id: lobbyId },
    include: { players: { orderBy: { seatIndex: 'asc' } } },
  })
  if (!lobby) throw new Error('LOBBY_NOT_FOUND')
  const state = parseState(lobby.stateJson) ?? createInitialGameState([])
  const playersBySeat = new Map(lobby.players.map((p) => [p.seatIndex, p]))
  state.players = state.players.map((p, idx) => {
    const db = playersBySeat.get(idx)
    if (!db) return p
    return { ...p, connected: db.status === 'connected', isBot: db.isBot, name: db.displayName }
  })
  return { lobby, state }
}

export async function reconnectWithToken(lobbyId: string, token: string, userId: string) {
  const tokenHash = hashToken(token)
  const count = await prisma.onlineLobbyPlayer.updateMany({
    where: { lobbyId, reconnectTokenHash: tokenHash, userId },
    data: { status: 'connected', disconnectedAt: null, lastSeenAt: new Date() },
  })
  if (count.count === 0) throw new Error('INVALID_TOKEN')
}

export async function runRoll(lobbyId: string, playerId: string) {
  const { lobby, state } = await getLobbyState(lobbyId)
  const challenge = Math.random() < 0.35
  const challengeText = challenge
    ? ONLINE_VERIFIABLE_CHALLENGES[Math.floor(Math.random() * ONLINE_VERIFIABLE_CHALLENGES.length)]?.text
    : undefined
  const dice = Math.floor(Math.random() * 6) + 1
  const next = applyRoll(state, playerId, Date.now(), dice, challengeText)
  await prisma.onlineLobby.update({
    where: { id: lobby.id },
    data: { stateJson: JSON.stringify(next), status: 'active' },
  })
  emitLobbyUpdate(lobbyId, { type: 'state-changed' })
  return next
}

export async function runResolveChallenge(lobbyId: string, playerId: string, completed: boolean) {
  const { lobby, state } = await getLobbyState(lobbyId)
  const next = resolveChallenge(state, playerId, completed)
  await prisma.onlineLobby.update({
    where: { id: lobby.id },
    data: { stateJson: JSON.stringify(next) },
  })
  emitLobbyUpdate(lobbyId, { type: 'state-changed' })
  return next
}

export async function hostDecision(lobbyId: string, hostUserId: string, decision: 'replace_bot' | 'end_game') {
  const { lobby, state } = await getLobbyState(lobbyId)
  if (lobby.hostUserId !== hostUserId) throw new Error('FORBIDDEN')

  const stalePlayer = lobby.players.find(
    (p) =>
      p.status === 'disconnected' &&
      p.disconnectedAt &&
      Date.now() - p.disconnectedAt.getTime() >= RECONNECT_GRACE_MS
  )
  if (!stalePlayer) return { lobbyStatus: lobby.status, state }
  if (decision === 'end_game') {
    await prisma.onlineLobby.update({ where: { id: lobbyId }, data: { status: 'finished' } })
    emitLobbyUpdate(lobbyId, { type: 'lobby-finished' })
    return { lobbyStatus: 'finished', state }
  }

  const bySeat = state.players[stalePlayer.seatIndex]
  const next = bySeat ? replaceDisconnectedByBot(state, bySeat.id) : state
  await prisma.onlineLobbyPlayer.update({ where: { id: stalePlayer.id }, data: { isBot: true, status: 'connected' } })
  await prisma.onlineLobby.update({ where: { id: lobby.id }, data: { stateJson: JSON.stringify(next) } })
  emitLobbyUpdate(lobbyId, { type: 'bot-replaced' })
  return { lobbyStatus: lobby.status, state: next }
}

export async function updateLobbyDifficulty(
  lobbyId: string,
  hostUserId: string,
  difficulty: OnlineDifficulty
) {
  const lobby = await prisma.onlineLobby.findUnique({ where: { id: lobbyId } })
  if (!lobby) throw new Error('LOBBY_NOT_FOUND')
  if (lobby.hostUserId !== hostUserId) throw new Error('FORBIDDEN')
  await prisma.onlineLobby.update({
    where: { id: lobbyId },
    data: { difficulty },
  })
  emitLobbyUpdate(lobbyId, { type: 'difficulty-changed', difficulty })
}
