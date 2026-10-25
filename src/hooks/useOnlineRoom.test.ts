import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomDto } from '@/lib/online-room'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseApiJson } from '@/lib/api-response'
import { flushMicrotasks, renderHook } from './hook-harness.test-utils'
import { serverNow } from './server-clock'
import { apiErrorCode, useOnlineRoomState, withNetworkFallback } from './useOnlineRoom'

vi.mock('react', async () => (await import('./hook-harness.test-utils')).miniReact)

const env = vi.hoisted(() => {
  // Traducteur stable (dépendance des useCallback) : rend la clé, pour
  // qu'un test lise le CODE affiché plutôt que sa phrase.
  const t = (key: string) => key
  return { t, user: { id: 'u1', playMode: 'online' as const } }
})

vi.mock('next-intl', () => ({ useTranslations: () => env.t }))
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: env.user }) }))
vi.mock('@/hooks/usePagePresence', () => ({ usePagePresence: () => true }))

/**
 * Le salon partagé tient ces promesses :
 *  - changer de table (lien d'invitation, bandeau) n'est jamais défait par
 *    une relecture de l'ancienne table — ni sa réponse 403/404, ni un vieux
 *    200 resté en vol ;
 *  - un refus de quota s'affiche par son code traduit, jamais par la phrase
 *    française de `error` ;
 *  - réglage, équipe et invitation ne lèvent pas sur une coupure ou un 502 :
 *    le joueur lit le message réseau.
 */

function room(id: string, overrides: Partial<RoomDto> = {}): RoomDto {
  return {
    id,
    code: `${id}${id}${id}${id}${id}${id}`.slice(0, 6),
    status: 'waiting',
    visibility: 'private',
    gameId: 'bluff',
    hostUserId: 'u1',
    members: [],
    allReady: false,
    canLaunch: false,
    settings: {} as RoomDto['settings'],
    stateVersion: 1,
    currentTurnUserId: null,
    gameStateJson: null,
    briefing: null,
    ...overrides,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type PendingFetch = { url: string; init?: RequestInit; resolve: (res: Response) => void; reject: (e: unknown) => void }

/** fetch dont chaque réponse est rendue à la main, dans l'ordre voulu par le test. */
function controlledFetch() {
  const pending: PendingFetch[] = []
  const fetchMock = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => pending.push({ url, init, resolve, reject }))
  )
  const take = (url: string, method = 'GET'): PendingFetch => {
    const index = pending.findIndex((p) => p.url === url && (p.init?.method ?? 'GET') === method)
    if (index < 0) {
      throw new Error(`aucune requête ${method} ${url} en vol (${pending.map((p) => p.url).join(', ')})`)
    }
    return pending.splice(index, 1)[0]
  }
  return { fetchMock, take, pending }
}

class FakeEventSource {
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  readyState = 0
  listeners = new Map<string, ((e: MessageEvent) => void)[]>()
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  close() {
    this.readyState = FakeEventSource.CLOSED
  }
  emit(type: string, data = '{}') {
    for (const fn of this.listeners.get(type) ?? []) fn(new MessageEvent(type, { data }))
  }
}

function streamOf(roomId: string): FakeEventSource {
  const stream = [...FakeEventSource.instances]
    .reverse()
    .find((es) => es.url === `/api/online/rooms/${roomId}/stream` && es.readyState !== FakeEventSource.CLOSED)
  if (!stream) throw new Error(`aucun flux ouvert pour ${roomId}`)
  return stream
}

let net: ReturnType<typeof controlledFetch>

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.instances = []
  net = controlledFetch()
  vi.stubGlobal('fetch', net.fetchMock)
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('navigator', { onLine: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Salon monté, assis à la table A (lobby), flux de A ouvert. */
async function seatedAtA() {
  const hook = renderHook(() => useOnlineRoomState(), undefined)
  net.take('/api/online/rooms/me').resolve(json({ room: room('A') }))
  await flushMicrotasks()
  expect(hook.result().room?.id).toBe('A')
  streamOf('A').emit('ready')
  return hook
}

describe('changement de table pendant que l’ancienne est relue', () => {
  it('le 403 de l’ancienne table, arrivé après l’entrée dans la nouvelle, ne la vide pas', async () => {
    const hook = await seatedAtA()
    const joining = hook.result().joinRoom({ code: 'BBBBBB' })
    // La route join publie `lobby` sur A avant de répondre : le flux de A relit A.
    streamOf('A').emit('lobby')
    await flushMicrotasks()
    net.take('/api/online/rooms/join', 'POST').resolve(json({ room: room('B') }))
    await joining
    await flushMicrotasks()
    net.take('/api/online/rooms/A').resolve(json({ error: 'forbidden' }, 403))
    await flushMicrotasks()

    expect(hook.result().room?.id).toBe('B')
    expect(hook.result().error).toBeNull()
    hook.unmount()
  })

  it('le 403 de l’ancienne table, arrivé avant la réponse du join, ne laisse pas de faux message', async () => {
    const hook = await seatedAtA()
    const joining = hook.result().joinRoom({ code: 'BBBBBB' })
    streamOf('A').emit('lobby')
    await flushMicrotasks()
    net.take('/api/online/rooms/A').resolve(json({ error: 'forbidden' }, 403))
    await flushMicrotasks()
    net.take('/api/online/rooms/join', 'POST').resolve(json({ room: room('B') }))
    await joining
    await flushMicrotasks()

    expect(hook.result().room?.id).toBe('B')
    expect(hook.result().error).toBeNull()
    hook.unmount()
  })

  it('un vieux 200 de l’ancienne table ne fait pas revenir le joueur dessus', async () => {
    const hook = await seatedAtA()
    streamOf('A').emit('lobby')
    await flushMicrotasks()
    const created = hook.result().createRoom('quiz')
    net.take('/api/online/rooms', 'POST').resolve(json({ room: room('C', { gameId: 'quiz' }) }))
    await created
    await flushMicrotasks()
    // Lu par le serveur juste avant le départ : A nous compte encore.
    net.take('/api/online/rooms/A').resolve(json({ room: room('A') }))
    await flushMicrotasks()

    expect(hook.result().room?.id).toBe('C')
    hook.unmount()
  })

  it('rejoindre sa propre table par son code ne la met pas sous verrou', async () => {
    const hook = await seatedAtA()
    const joining = hook.result().joinRoom({ code: 'AAAAAA' })
    net.take('/api/online/rooms/join', 'POST').resolve(json({ room: room('A', { stateVersion: 2 }) }))
    await joining
    await flushMicrotasks()
    streamOf('A').emit('lobby')
    await flushMicrotasks()
    net.take('/api/online/rooms/A').resolve(json({ room: room('A', { stateVersion: 3 }) }))
    await flushMicrotasks()

    expect(hook.result().room?.stateVersion).toBe(3)
    hook.unmount()
  })
})

describe('refus de quota', () => {
  it('apiErrorCode lit le code de rateLimitResponse, pas sa phrase française', async () => {
    const body = await parseApiJson<{ error?: string; code?: string }>(rateLimitResponse(42))
    expect(body.error).toMatch(/Trop de tentatives/)
    expect(apiErrorCode(body)).toBe('rate_limited')
  })

  it('apiErrorCode garde le code porté par `error` (apiError des routes)', () => {
    expect(apiErrorCode({ error: 'room_not_found', code: 'room_not_found' })).toBe('room_not_found')
    expect(apiErrorCode({ error: 'room_not_found' })).toBe('room_not_found')
    expect(apiErrorCode({ error: 'Texte inconnu' })).toBeNull()
    expect(apiErrorCode(null)).toBeNull()
  })

  it('un join refusé par le quota affiche le code traduit', async () => {
    const hook = renderHook(() => useOnlineRoomState(), undefined)
    net.take('/api/online/rooms/me').resolve(json({}))
    await flushMicrotasks()
    const joining = hook.result().joinRoom({ code: 'ZZZZZZ' })
    net.take('/api/online/rooms/join', 'POST').resolve(rateLimitResponse(42))
    await joining
    await flushMicrotasks()

    expect(hook.result().error).toBe('rate_limited')
    hook.unmount()
  })
})

describe('réglage, équipe et invitation sans réseau', () => {
  it('withNetworkFallback rend le repli et prévient, sans lever', async () => {
    const onNetworkError = vi.fn()
    const html502 = new Response('<html>Bad gateway</html>', { status: 502 })
    await expect(
      withNetworkFallback(() => parseApiJson(html502).then(() => 'ok'), onNetworkError, 'repli')
    ).resolves.toBe('repli')
    expect(onNetworkError).toHaveBeenCalledTimes(1)
    await expect(withNetworkFallback(async () => 'ok', onNetworkError, 'repli')).resolves.toBe('ok')
    expect(onNetworkError).toHaveBeenCalledTimes(1)
  })

  it('updateSettings, setTeam et inviteFriend disent « réseau » au lieu de rejeter', async () => {
    const hook = await seatedAtA()

    const settings = hook.result().updateSettings({ botsCount: 1 })
    net.take('/api/online/rooms/A/settings', 'PUT').reject(new TypeError('Failed to fetch'))
    await expect(settings).resolves.toBeNull()
    await flushMicrotasks()
    expect(hook.result().error).toBe('network')

    hook.result().setError(null)
    await flushMicrotasks()
    const team = hook.result().setTeam('A')
    net.take('/api/online/rooms/A/team', 'PUT').resolve(new Response('<html>502</html>', { status: 502 }))
    await expect(team).resolves.toBeNull()
    await flushMicrotasks()
    expect(hook.result().error).toBe('network')

    hook.result().setError(null)
    await flushMicrotasks()
    const invite = hook.result().inviteFriend('u2')
    net.take('/api/online/rooms/A/invite', 'POST').reject(new TypeError('Failed to fetch'))
    await expect(invite).resolves.toBe(false)
    await flushMicrotasks()
    expect(hook.result().error).toBe('network')
    hook.unmount()
  })
})

// En dernier : l'heure serveur relevée ici vaut pour la suite du fichier.
describe('heure du serveur', () => {
  it('le sondage /rooms/me relève l’en-tête Date (téléphone en retard de 10 s)', async () => {
    const hook = renderHook(() => useOnlineRoomState(), undefined)
    const serverDate = new Date(Date.now() + 10_000).toUTCString()
    net.take('/api/online/rooms/me').resolve(
      new Response(JSON.stringify({ room: null }), { status: 200, headers: { date: serverDate } })
    )
    await flushMicrotasks()

    const offset = serverNow() - Date.now()
    expect(offset).toBeGreaterThanOrEqual(9_000)
    expect(offset).toBeLessThanOrEqual(10_000)
    hook.unmount()
  })
})
