import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushMicrotasks, renderHook } from './hook-harness.test-utils'
import { isStaleVoiceJoin, releaseStream, useVoiceChat } from './useVoiceChat'

vi.mock('react', async () => (await import('./hook-harness.test-utils')).miniReact)

/**
 * « Activer le micro » ouvre la fenêtre d'autorisation du navigateur ; le
 * joueur peut partir avant d'y répondre (« Jeux » démonte le dock, « Quitter »
 * vide la salle). Reproduction de l'audit : join() lancé, nettoyages passés,
 * puis micro accordé — le micro restait pris, le flux de signalisation
 * s'ouvrait et le « hello » partait vers la table, sans plus aucun dock pour
 * couper. Une tentative abandonnée rend le micro et n'ouvre RIEN.
 */

class FakeEventSource {
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener() {}
  close() {
    this.readyState = FakeEventSource.CLOSED
  }
}

function fakeStream() {
  const track = { kind: 'audio', enabled: true, stop: vi.fn() }
  return { track, stream: { getTracks: () => [track], getAudioTracks: () => [track] } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const MEMBERS = [{ userId: 'u1' }, { userId: 'u2' }]

let mic: ReturnType<typeof deferred<unknown>>
let creds: ReturnType<typeof deferred<Response>>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  FakeEventSource.instances = []
  mic = deferred()
  creds = deferred()
  fetchMock = vi.fn((url: string) =>
    url === '/api/rtc/credentials' ? creds.promise : Promise.resolve(new Response('{}'))
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('EventSource', FakeEventSource)
  vi.stubGlobal('RTCPeerConnection', class {})
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => mic.promise) } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const rtcPosts = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/rtc'))

function mountVoice(roomId: string | null = 'room1') {
  return renderHook(
    ({ roomId }: { roomId: string | null }) => useVoiceChat(roomId, 'u1', MEMBERS),
    { roomId }
  )
}

const credsOk = () => new Response(JSON.stringify({ iceServers: [] }), { status: 200 })

describe('useVoiceChat — tentative abandonnée pendant la demande de micro', () => {
  it('démontage (« Jeux ») : micro rendu, ni flux ni hello', async () => {
    const hook = mountVoice()
    const joining = hook.result().join()
    hook.unmount()
    const { track, stream } = fakeStream()
    mic.resolve(stream)
    creds.resolve(credsOk())
    await joining

    expect(track.stop).toHaveBeenCalled()
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(rtcPosts()).toHaveLength(0)
  })

  it('vocal quitté avant la réponse : micro rendu, le dock reste « hors vocal »', async () => {
    const hook = mountVoice()
    const joining = hook.result().join()
    hook.result().leave()
    const { track, stream } = fakeStream()
    mic.resolve(stream)
    creds.resolve(credsOk())
    await joining
    await flushMicrotasks()

    expect(track.stop).toHaveBeenCalled()
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(rtcPosts()).toHaveLength(0)
    expect(hook.result().joined).toBe(false)
    expect(hook.result().error).toBeNull()
    hook.unmount()
  })

  it('salle quittée (« Quitter ») pendant la demande : rien n’est ouvert sur l’ancienne', async () => {
    const hook = mountVoice('room1')
    const joining = hook.result().join()
    hook.rerender({ roomId: null })
    const { track, stream } = fakeStream()
    mic.resolve(stream)
    creds.resolve(credsOk())
    await joining

    expect(track.stop).toHaveBeenCalled()
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(rtcPosts()).toHaveLength(0)
    hook.unmount()
  })

  it('identifiants en échec : le micro accordé ensuite est rendu', async () => {
    const hook = mountVoice()
    const joining = hook.result().join()
    creds.reject(new TypeError('Failed to fetch'))
    await joining
    const { track, stream } = fakeStream()
    mic.resolve(stream)
    await flushMicrotasks()

    expect(track.stop).toHaveBeenCalled()
    expect(hook.result().error).toBe('network')
    hook.unmount()
  })

  it('tentative menée au bout : flux ouvert, hello envoyé, micro gardé', async () => {
    const hook = mountVoice()
    const joining = hook.result().join()
    const { track, stream } = fakeStream()
    mic.resolve(stream)
    creds.resolve(credsOk())
    await joining
    await flushMicrotasks()

    expect(track.stop).not.toHaveBeenCalled()
    expect(FakeEventSource.instances.map((es) => es.url)).toEqual(['/api/online/rooms/room1/stream'])
    expect(rtcPosts()).toHaveLength(1)
    expect(hook.result().joined).toBe(true)

    // Démontage normal : micro rendu, flux fermé.
    hook.unmount()
    expect(track.stop).toHaveBeenCalled()
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED)
  })
})

describe('isStaleVoiceJoin', () => {
  const started = { attempt: 3, roomId: 'room1' }

  it('même tentative, même salle : on continue', () => {
    expect(isStaleVoiceJoin(started, { attempt: 3, roomId: 'room1' })).toBe(false)
  })

  it('leave() ou démontage depuis le départ : périmée', () => {
    expect(isStaleVoiceJoin(started, { attempt: 4, roomId: 'room1' })).toBe(true)
  })

  it('salle changée ou quittée : périmée', () => {
    expect(isStaleVoiceJoin(started, { attempt: 3, roomId: 'room2' })).toBe(true)
    expect(isStaleVoiceJoin(started, { attempt: 3, roomId: null })).toBe(true)
  })
})

describe('releaseStream', () => {
  it('coupe chaque piste, et ne fait rien sans flux', () => {
    const { track, stream } = fakeStream()
    releaseStream(stream)
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(() => releaseStream(null)).not.toThrow()
  })
})
