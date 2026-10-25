import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/tv/[code]/state — état public d'une table pour l'écran TV. Vraie
 * route et vrai DTO TV, base simulée. Ce qu'on tient : le quota de lecture et
 * le budget de codes inconnus comptent par RÉSEAU (un /64 IPv6 entier), pas
 * par adresse — changer d'adresse dans son /64 ne remet plus rien à zéro.
 */

const { db } = vi.hoisted(() => ({
  db: { onlineRoom: { findUnique: vi.fn() } },
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { GET } from './route'
import { TV_CODE_MISS_LIMIT } from '@/app/api/tv/code-lookup'

const LIVE_CODE = 'LIVE23'

/** Une table vivante, telle que la base la rend au DTO TV. */
const liveRoom = {
  id: 'room-1',
  code: LIVE_CODE,
  status: 'waiting',
  gameId: null,
  hostUserId: 'ckhost000000000000000000000',
  members: [],
  settingsJson: null,
  stateVersion: 3,
  currentTurnUserId: null,
  gameStateJson: null,
}

/** Un /64 neuf par test : le limiteur vit dans le processus. */
let seq = 0
const network = () => {
  seq += 1
  return (host: number) => `2001:db8:${(0x100 + seq).toString(16)}:7::${host.toString(16)}`
}

const get = (code: string, ip: string) =>
  GET(new Request(`http://localhost/api/tv/${code}/state`, { headers: { 'cf-connecting-ip': ip } }), {
    params: Promise.resolve({ code }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  db.onlineRoom.findUnique.mockImplementation(async ({ where }: { where: { code: string } }) =>
    where.code === LIVE_CODE ? liveRoom : null
  )
})

describe('GET /api/tv/[code]/state', () => {
  it('table vivante : 200 avec la vue TV', async () => {
    const res = await get(LIVE_CODE, network()(1))
    expect(res.status).toBe(200)
    expect((await res.json()).room.code).toBe(LIVE_CODE)
  })

  it('code mal formé : 400 avec un code d’erreur, sans lecture de la base', async () => {
    const res = await get('abc', network()(1))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('room_not_found')
    expect(db.onlineRoom.findUnique).not.toHaveBeenCalled()
  })

  it('balayage depuis 2000 adresses d’un même /64 : au plus le budget de 404, puis 429', async () => {
    const from = network()
    const statuses: number[] = []
    for (let i = 0; i < 2000; i += 1) {
      const code = `Z${i.toString(36).toUpperCase().padStart(5, '0')}`
      statuses.push((await get(code, from(i + 1))).status)
    }
    expect(statuses.filter((s) => s === 404)).toHaveLength(TV_CODE_MISS_LIMIT)
    expect(statuses.filter((s) => s === 429).length).toBe(2000 - TV_CODE_MISS_LIMIT)
    // L'oracle est fermé : même la table vivante ne répond plus à ce réseau.
    const res = await get(LIVE_CODE, from(5000))
    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('rate_limited')
  })

  it('une télé restée sur une table finie peut resonder son code sans bloquer la maison', async () => {
    const from = network()
    for (let i = 0; i < 100; i += 1) {
      expect((await get('GONE23', from(1))).status).toBe(404)
    }
    expect((await get(LIVE_CODE, from(2))).status).toBe(200)
  })

  it('quota de lecture par réseau : 240 par minute pour tout le /64', async () => {
    const from = network()
    const statuses: number[] = []
    for (let i = 0; i < 241; i += 1) statuses.push((await get(LIVE_CODE, from(i + 1))).status)
    expect(statuses.slice(0, 240).every((s) => s === 200)).toBe(true)
    expect(statuses[240]).toBe(429)
    expect((await get(LIVE_CODE, network()(1))).status).toBe(200)
  })
})
