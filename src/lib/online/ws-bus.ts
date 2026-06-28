import type { Server as HttpServer } from 'http'
import type { Server as SocketIOServer } from 'socket.io'

declare global {
  var lpOnlineIo: SocketIOServer | undefined
}

export function setOnlineIo(io: SocketIOServer) {
  global.lpOnlineIo = io
}

export function getOnlineIo(): SocketIOServer | undefined {
  return global.lpOnlineIo
}

export function emitLobbyUpdate(lobbyId: string, payload: unknown) {
  const io = getOnlineIo()
  if (!io) return
  io.to(`lobby:${lobbyId}`).emit('lobby:update', payload)
}

export type HttpServerWithIo = HttpServer & {
  io?: SocketIOServer
}
