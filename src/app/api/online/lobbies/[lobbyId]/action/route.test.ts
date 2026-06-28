import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth-server', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/online/server', () => ({
  runRoll: vi.fn(),
  runResolveChallenge: vi.fn(),
  reconnectWithToken: vi.fn(),
  hostDecision: vi.fn(),
  updateLobbyDifficulty: vi.fn(),
}))

import { POST } from './route'
import { getCurrentUser } from '@/lib/auth-server'
import {
  hostDecision,
  reconnectWithToken,
  runResolveChallenge,
  runRoll,
  updateLobbyDifficulty,
} from '@/lib/online/server'

describe('POST /api/online/lobbies/[lobbyId]/action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      displayName: 'Host',
      accountCode: 'A1',
      role: 'user',
      locale: 'fr',
    })
  })

  it('refuse sans compte', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
    const req = new Request('http://localhost/api/online/lobbies/l1/action', {
      method: 'POST',
      body: JSON.stringify({ type: 'roll', playerId: 'p1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ lobbyId: 'l1' }) })
    expect(res.status).toBe(401)
  })

  it('traite roll', async () => {
    vi.mocked(runRoll).mockResolvedValueOnce({ currentPlayerId: 'p2' } as never)
    const req = new Request('http://localhost/api/online/lobbies/l1/action', {
      method: 'POST',
      body: JSON.stringify({ type: 'roll', playerId: 'p1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ lobbyId: 'l1' }) })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(runRoll).toHaveBeenCalledWith('l1', 'p1')
    expect(json.state.currentPlayerId).toBe('p2')
  })

  it('traite reconnect', async () => {
    const req = new Request('http://localhost/api/online/lobbies/l1/action', {
      method: 'POST',
      body: JSON.stringify({ type: 'reconnect', token: 'tok' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ lobbyId: 'l1' }) })
    expect(res.status).toBe(200)
    expect(reconnectWithToken).toHaveBeenCalledWith('l1', 'tok', 'u1')
  })

  it('autorise set-difficulty uniquement via action host', async () => {
    const req = new Request('http://localhost/api/online/lobbies/l1/action', {
      method: 'POST',
      body: JSON.stringify({ type: 'set-difficulty', difficulty: 'extreme' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ lobbyId: 'l1' }) })
    expect(res.status).toBe(200)
    expect(updateLobbyDifficulty).toHaveBeenCalledWith('l1', 'u1', 'extreme')
  })

  it('traite host-decision bot/fin', async () => {
    vi.mocked(hostDecision).mockResolvedValueOnce({ lobbyStatus: 'active' } as never)
    const req = new Request('http://localhost/api/online/lobbies/l1/action', {
      method: 'POST',
      body: JSON.stringify({ type: 'host-decision', decision: 'replace_bot' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: Promise.resolve({ lobbyId: 'l1' }) })
    expect(res.status).toBe(200)
    expect(hostDecision).toHaveBeenCalledWith('l1', 'u1', 'replace_bot')
    expect(runResolveChallenge).not.toHaveBeenCalled()
  })
})
