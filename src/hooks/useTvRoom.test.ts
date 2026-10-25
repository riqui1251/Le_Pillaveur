import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STREAM_WATCHDOG_MS } from './online-room-polling'
import { flushMicrotasks, renderHook } from './hook-harness.test-utils'
import { useTvRoom } from './useTvRoom'

vi.mock('react', async () => (await import('./hook-harness.test-utils')).miniReact)

/**
 * L'écran TV ne vit que de son flux SSE pour le temps réel et, surtout, pour
 * les trames `castframe` (billes du Plinko, course du PMU). Un flux abandonné
 * par le navigateur (502 du proxy pendant un redéploiement, 429 du plafond
 * tv-stream) doit être ROUVERT — l'audit l'avait vu rester mort 30 min de
 * minuteurs simulés, une seule instance d'EventSource et plus de 100
 * sondages —, avec un recul qui double, remis à zéro dès que le serveur
 * reparle.
 */

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
  /** Le navigateur abandonne : statut non-200 à la reconnexion. */
  abandon() {
    this.readyState = FakeEventSource.CLOSED
    this.emit('error')
  }
}

const latest = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  FakeEventSource.instances = []
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ room: null }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('window', {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function mountTv() {
  const hook = renderHook(({ code }: { code: string }) => useTvRoom(code), { code: 'ABC123' })
  await flushMicrotasks()
  expect(FakeEventSource.instances).toHaveLength(1)
  latest().emit('ready')
  return hook
}

describe('useTvRoom — flux abandonné', () => {
  it('rouvre le flux après 5 s, puis 10 s, 20 s… tant que le serveur refuse', async () => {
    const hook = await mountTv()
    latest().abandon()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(FakeEventSource.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(latest().url).toBe('/api/tv/ABC123/stream')

    // Second refus d'affilée : 10 s.
    latest().abandon()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(FakeEventSource.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeEventSource.instances).toHaveLength(3)
    hook.unmount()
  })

  it('le `ready` remet le recul à zéro et relit l’état perdu entre-temps', async () => {
    const hook = await mountTv()
    latest().abandon()
    await vi.advanceTimersByTimeAsync(5_000)
    latest().abandon()
    await vi.advanceTimersByTimeAsync(10_000)
    const callsBefore = fetchMock.mock.calls.length
    latest().emit('ready')
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore)

    latest().abandon()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(FakeEventSource.instances).toHaveLength(4)
    hook.unmount()
  })

  it('30 min après un abandon, la télé a toujours un flux ouvert', async () => {
    const hook = await mountTv()
    latest().abandon()
    await vi.advanceTimersByTimeAsync(30 * 60_000)
    expect(FakeEventSource.instances.length).toBeGreaterThan(1)
    expect(latest().readyState).not.toBe(FakeEventSource.CLOSED)
    hook.unmount()
  })

  it('une coupure que le navigateur rattrape seul (CONNECTING) ne crée pas de second flux', async () => {
    const hook = await mountTv()
    latest().emit('error')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeEventSource.instances).toHaveLength(1)
    hook.unmount()
  })

  it('démontée, la télé ne rouvre plus rien', async () => {
    const hook = await mountTv()
    latest().abandon()
    hook.unmount()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(FakeEventSource.instances).toHaveLength(1)
  })
})

describe('useTvRoom — chien de garde', () => {
  it('sans battement `ping` de la route, un flux calme n’est jamais tenu pour mort', async () => {
    const hook = await mountTv()
    await vi.advanceTimersByTimeAsync(10 * STREAM_WATCHDOG_MS)
    expect(FakeEventSource.instances).toHaveLength(1)
    hook.unmount()
  })

  it('avec des `ping`, un flux muet depuis deux battements est remplacé', async () => {
    const hook = await mountTv()
    latest().emit('ping')
    await vi.advanceTimersByTimeAsync(STREAM_WATCHDOG_MS - 1)
    expect(FakeEventSource.instances).toHaveLength(1)
    // Échéance du chien de garde, puis réouverture immédiate (minuteur à 0).
    await vi.advanceTimersByTimeAsync(10)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED)
    hook.unmount()
  })
})
