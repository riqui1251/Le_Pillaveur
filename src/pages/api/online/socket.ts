import type { NextApiRequest } from 'next'
import type { NextApiResponseServerIO } from '@/types/next-socket'
import { Server as IOServer } from 'socket.io'
import { setOnlineIo } from '@/lib/online/ws-bus'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default function handler(_req: NextApiRequest, res: NextApiResponseServerIO) {
  if (!res.socket.server.io) {
    const io = new IOServer(res.socket.server, {
      path: '/api/online/socket',
      addTrailingSlash: false,
      cors: { origin: '*' },
    })
    res.socket.server.io = io
    setOnlineIo(io)

    io.on('connection', (socket) => {
      socket.on('lobby:join', (lobbyId: string) => {
        if (typeof lobbyId !== 'string' || !lobbyId) return
        socket.join(`lobby:${lobbyId}`)
      })
      socket.on('lobby:leave', (lobbyId: string) => {
        if (typeof lobbyId !== 'string' || !lobbyId) return
        socket.leave(`lobby:${lobbyId}`)
      })
    })
  }

  res.end()
}
