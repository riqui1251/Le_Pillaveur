import { createHmac } from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/rtc/credentials — serveurs ICE et identifiants TURN du vocal.
 * Vraie route, vrais réglages et bans vocaux, base et session simulées. Ce
 * qu'on tient : l'identifiant TURN est NOMINATIF (coturn compte son quota par
 * compte), il faut être assis à une table (celle donnée par `roomId` si le
 * client la donne), le débit est plafonné par compte, et le TTL est court.
 */

const { db, currentUserMock } = vi.hoisted(() => ({
  db: {
    siteSetting: { findUnique: vi.fn() },
    featureBan: { findUnique: vi.fn(), delete: vi.fn() },
    onlineRoomMember: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
  currentUserMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))

import { GET } from './route'
import { TURN_TTL_SECONDS } from '@/lib/rtc/ice'

/** Un compte neuf par test : le quota vit dans le processus. */
let seq = 0
const newUser = () => {
  seq += 1
  const id = `cuser${seq}`
  currentUserMock.mockResolvedValue({ id })
  return id
}

const get = (query = '') => GET(new Request(`http://localhost/api/rtc/credentials${query}`))

type IceResponse = { iceServers: { urls: string | string[]; username?: string; credential?: string }[]; ttlSeconds: number }
const turnOf = (body: IceResponse) => body.iceServers.find((s) => s.username)!

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('TURN_HOST', 'turn.example.com')
  vi.stubEnv('TURN_SECRET', 'secret-de-test')
  db.siteSetting.findUnique.mockResolvedValue(null)
  db.featureBan.findUnique.mockResolvedValue(null)
  db.onlineRoomMember.findUnique.mockResolvedValue({ id: 'm1' })
  db.onlineRoomMember.findFirst.mockResolvedValue({ id: 'm1' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/rtc/credentials', () => {
  it('identifiant TURN nominatif « expiration:compte », TTL court, HMAC vérifiable', async () => {
    const userId = newUser()
    const before = Math.floor(Date.now() / 1000)
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as IceResponse
    const turn = turnOf(body)

    const [expiry, name] = turn.username!.split(':')
    expect(name).toBe(userId)
    expect(Number(expiry) - before).toBeGreaterThanOrEqual(TURN_TTL_SECONDS - 1)
    expect(Number(expiry) - before).toBeLessThanOrEqual(30 * 60 + 1)
    expect(body.ttlSeconds).toBe(TURN_TTL_SECONDS)
    expect(turn.credential).toBe(createHmac('sha1', 'secret-de-test').update(turn.username!).digest('base64'))
  })

  it('deux comptes ne partagent jamais le même nom TURN', async () => {
    newUser()
    const first = turnOf((await (await get()).json()) as IceResponse).username
    newUser()
    const second = turnOf((await (await get()).json()) as IceResponse).username
    expect(first?.split(':')[1]).not.toBe(second?.split(':')[1])
  })

  it('assis à aucune table : 403 not_a_member, aucun identifiant', async () => {
    newUser()
    db.onlineRoomMember.findFirst.mockResolvedValue(null)
    const res = await get()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('not_a_member')
    expect(body.iceServers).toBeUndefined()
  })

  it('roomId donné : l’appartenance à CETTE salle est vérifiée', async () => {
    const userId = newUser()
    db.onlineRoomMember.findUnique.mockResolvedValue(null)
    const res = await get('?roomId=salle-des-autres')
    expect(res.status).toBe(403)
    expect(db.onlineRoomMember.findUnique).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: 'salle-des-autres', userId } },
      select: { id: true },
    })

    db.onlineRoomMember.findUnique.mockResolvedValue({ id: 'm1' })
    expect((await get('?roomId=ma-salle')).status).toBe(200)
  })

  it('plafond par compte : au-delà de 10 appels par minute, 429', async () => {
    newUser()
    const statuses: number[] = []
    for (let i = 0; i < 11; i += 1) statuses.push((await get()).status)
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuses[10]).toBe(429)
    expect((await (await get()).json()).code).toBe('rate_limited')
  })

  it('vocal coupé ou joueur banni : 403 avec la raison que lit le client', async () => {
    newUser()
    db.siteSetting.findUnique.mockResolvedValue({ value: '0' })
    let res = await get()
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'voice_unavailable', reason: 'disabled' })

    db.siteSetting.findUnique.mockResolvedValue(null)
    db.featureBan.findUnique.mockResolvedValue({ until: null })
    res = await get()
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'voice_unavailable', reason: 'banned' })
  })

  it('sans compte : 401 avec un code, pas une phrase', async () => {
    currentUserMock.mockResolvedValue(null)
    const res = await get()
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('auth_required')
  })
})
