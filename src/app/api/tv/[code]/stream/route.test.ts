import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/tv/[code]/stream — flux SSE PUBLIC de l'écran TV. Vraie route, vrai
 * bus et vrai registre de flux, base simulée. Ce qu'on tient : les flux
 * VIVANTS sont plafonnés par réseau (un /64 IPv6 entier) et rendent leur place
 * au nettoyage ; un flux ne vit pas plus de trois heures ni plus longtemps que
 * sa salle ; le battement est un vrai `event: ping`.
 */

const { db } = vi.hoisted(() => ({
  db: { onlineRoom: { findUnique: vi.fn() } },
}))

vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { GET } from './route'
import {
  MAX_TV_STREAMS_PER_NETWORK,
  resetStreamRegistry,
  tvStreamCounts,
} from '@/lib/online/stream-registry'
import { STREAM_HEARTBEAT_MS } from '@/hooks/online-room-polling'

const CODE = 'TVTV23'
const ROOM_ID = 'room-tv'

/** Un /64 neuf par test : le limiteur vit dans le processus. */
let seq = 0
const network = () => {
  seq += 1
  return (host: number) => `2001:db8:${(0x200 + seq).toString(16)}:9::${host.toString(16)}`
}

let roomExists = true
const controllers: AbortController[] = []

const open = (ip: string, code = CODE) => {
  const controller = new AbortController()
  controllers.push(controller)
  const request = new Request(`http://localhost/api/tv/${code}/stream`, {
    headers: { 'cf-connecting-ip': ip },
    signal: controller.signal,
  })
  return {
    controller,
    response: GET(request, { params: Promise.resolve({ code }) }),
  }
}

/** Lit tout ce que le flux a déjà mis en file, et dit s'il est fermé. */
async function drain(body: ReadableStream<Uint8Array>): Promise<{ text: string; closed: boolean }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (let i = 0; i < 10_000; i += 1) {
    const next = await Promise.race([
      reader.read(),
      new Promise<'pending'>((resolve) => queueMicrotask(() => queueMicrotask(() => resolve('pending')))),
    ])
    if (next === 'pending') {
      reader.releaseLock()
      return { text, closed: false }
    }
    if (next.done) return { text, closed: true }
    text += decoder.decode(next.value, { stream: true })
  }
  throw new Error('flux sans fin')
}

const busListeners = () =>
  (globalThis as unknown as { __lpRoomBus?: { listenerCount(ch: string): number } }).__lpRoomBus?.listenerCount(
    `room:${ROOM_ID}`
  ) ?? 0

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  resetStreamRegistry()
  roomExists = true
  db.onlineRoom.findUnique.mockImplementation(async ({ where }: { where: { code?: string; id?: string } }) => {
    if (!roomExists) return null
    return where.code === CODE || where.id === ROOM_ID ? { id: ROOM_ID } : null
  })
})

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort()
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('GET /api/tv/[code]/stream', () => {
  it('ouvre le flux par `ready`, puis un vrai `event: ping` à chaque battement', async () => {
    const { response } = open(network()(1))
    const res = await response
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    await vi.advanceTimersByTimeAsync(STREAM_HEARTBEAT_MS)
    const { text, closed } = await drain(res.body!)
    expect(closed).toBe(false)
    expect(text).toBe('event: ready\ndata: {}\n\nevent: ping\ndata: {}\n\n')
  })

  it('500 flux depuis 500 adresses d’un même /64 : plafond par réseau, abonnés bornés', async () => {
    const from = network()
    const statuses: number[] = []
    for (let i = 0; i < 500; i += 1) statuses.push((await open(from(i + 1)).response).status)

    expect(statuses.filter((s) => s === 200)).toHaveLength(MAX_TV_STREAMS_PER_NETWORK)
    expect(statuses.filter((s) => s === 429)).toHaveLength(500 - MAX_TV_STREAMS_PER_NETWORK)
    expect(tvStreamCounts().total).toBe(MAX_TV_STREAMS_PER_NETWORK)
    expect(busListeners()).toBe(MAX_TV_STREAMS_PER_NETWORK)

    // Un autre réseau n'en pâtit pas.
    expect((await open(network()(1)).response).status).toBe(200)
  })

  it('un flux fermé par le client rend sa place et ses abonnements', async () => {
    const from = network()
    const opened = []
    for (let i = 0; i < MAX_TV_STREAMS_PER_NETWORK; i += 1) opened.push(open(from(i + 1)))
    await Promise.all(opened.map((o) => o.response))
    expect((await open(from(100)).response).status).toBe(429)

    opened[0].controller.abort()
    expect(tvStreamCounts().total).toBe(MAX_TV_STREAMS_PER_NETWORK - 1)
    expect(busListeners()).toBe(MAX_TV_STREAMS_PER_NETWORK - 1)
    expect((await open(from(101)).response).status).toBe(200)
  })

  it('quota d’ouverture compté pour tout le /64, même flux aussitôt refermés', async () => {
    const from = network()
    const statuses: number[] = []
    for (let i = 0; i < 121; i += 1) {
      const { response, controller } = open(from(i + 1))
      statuses.push((await response).status)
      controller.abort()
    }
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true)
    expect(statuses[120]).toBe(429)
    expect(tvStreamCounts().total).toBe(0)
  })

  it('fermé par le serveur au bout de trois heures, place rendue', async () => {
    const res = await open(network()(1)).response
    expect(tvStreamCounts().total).toBe(1)

    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000 - 1000)
    expect((await drain(res.body!)).closed).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await drain(res.body!)).closed).toBe(true)
    expect(tvStreamCounts().total).toBe(0)
    expect(busListeners()).toBe(0)
  })

  it('fermé quand la salle disparaît (cast arrêté, table purgée)', async () => {
    const res = await open(network()(1)).response
    roomExists = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await drain(res.body!)).closed).toBe(true)
    expect(tvStreamCounts().total).toBe(0)
    expect(busListeners()).toBe(0)
  })

  it('une panne passagère de la base ne ferme pas le flux', async () => {
    const res = await open(network()(1)).response
    db.onlineRoom.findUnique.mockRejectedValueOnce(new Error('base occupée'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect((await drain(res.body!)).closed).toBe(false)
    expect(tvStreamCounts().total).toBe(1)
  })

  it('code inconnu : 404 avec un code d’erreur, aucune place prise', async () => {
    const res = await open(network()(1), 'NOPE23').response
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('room_not_found')
    expect(tvStreamCounts().total).toBe(0)
  })
})
