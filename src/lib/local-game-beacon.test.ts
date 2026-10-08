import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

import { GAMES } from './games'
import {
  LOCAL_GAMES_WITHOUT_END_SCREEN,
  LOCAL_GAME_DEDUPE_MS,
  createLocalGameReporter,
  isLocalGameEvent,
  isMeasuredLocalGameId,
  isTvPath,
  measuredLocalGameIdFromPath,
  reportLocalGame,
  type LocalGameReport,
} from './local-game-beacon'

/**
 * Mesure anonyme des parties locales, côté joueur : quels jeux comptent,
 * ce qui part (deux champs, rien d'autre), le dédoublonnage, l'écran TV.
 * L'envoi réel (sendBeacon / fetch) n'a pas de logique propre : il est
 * remplacé par un envoyeur espion, comme pour client-error-report.
 */

// Exemples tirés du registre : publier ou masquer un jeu ne casse pas ces tests.
const LOCAL = GAMES.filter((g) => !g.hidden && !g.onlineOnly)
const HIDDEN_LOCAL = GAMES.find((g) => g.hidden && !g.onlineOnly)
const ONLINE_ONLY = GAMES.find((g) => g.onlineOnly)
const [A, B] = LOCAL.map((g) => g.id)

describe('jeux mesurés', () => {
  it('compte les jeux locaux, masqués compris, jamais un jeu en ligne uniquement ni un inconnu', () => {
    expect(isMeasuredLocalGameId(A)).toBe(true)
    expect(isMeasuredLocalGameId(HIDDEN_LOCAL!.id)).toBe(true)
    expect(isMeasuredLocalGameId(ONLINE_ONLY!.id)).toBe(false)
    expect(isMeasuredLocalGameId('jeu-inconnu')).toBe(false)
    expect(isMeasuredLocalGameId('')).toBe(false)
    expect(isMeasuredLocalGameId(42)).toBe(false)
    expect(isMeasuredLocalGameId(null)).toBe(false)
  })

  it('ne connaît que deux événements', () => {
    expect(isLocalGameEvent('start')).toBe(true)
    expect(isLocalGameEvent('end')).toBe(true)
    expect(isLocalGameEvent('START')).toBe(false)
    expect(isLocalGameEvent('pause')).toBe(false)
    expect(isLocalGameEvent(undefined)).toBe(false)
  })

  it('reconnaît la page exacte d’un jeu local, masqué compris', () => {
    expect(measuredLocalGameIdFromPath(LOCAL[0].path)).toBe(LOCAL[0].id)
    expect(measuredLocalGameIdFromPath(HIDDEN_LOCAL!.path)).toBe(HIDDEN_LOCAL!.id)
    expect(measuredLocalGameIdFromPath(ONLINE_ONLY!.path)).toBeNull()
    expect(measuredLocalGameIdFromPath(`${LOCAL[0].path}/`)).toBeNull()
    expect(measuredLocalGameIdFromPath(`${LOCAL[0].path}/regles`)).toBeNull()
    expect(measuredLocalGameIdFromPath('/games')).toBeNull()
    expect(measuredLocalGameIdFromPath(null)).toBeNull()
  })

  it('reconnaît l’écran TV, avec ou sans préfixe de langue', () => {
    for (const path of ['/tv', '/tv/ABCD', '/fr/tv', '/en/tv/ABCD', '/it/tv/ABCD']) {
      expect(isTvPath(path)).toBe(true)
    }
    for (const path of ['/games/pmu', '/fr/games/pmu', '/tvx', '/fr/jeux', '/']) {
      expect(isTvPath(path)).toBe(false)
    }
  })
})

/**
 * Jeux sans écran de fin : la liste doit dire VRAI, sinon la Supervision
 * présenterait un jeu qui ne peut pas envoyer de fin comme un jeu abandonné
 * (ou l'inverse). Relevé statique : un jeu local a un écran de fin mesuré
 * quand son dossier monte FirstGameFeedbackCard en mode local, sous SON id.
 */
describe('jeux sans écran de fin', () => {
  const GAMES_DIR = resolve(fileURLToPath(new URL('../', import.meta.url)), 'app', '[locale]', 'games')

  function sourcesOf(dir: string): string[] {
    if (!existsSync(dir)) return []
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return sourcesOf(path)
      return path.endsWith('.tsx') ? [readFileSync(path, 'utf8')] : []
    })
  }

  const mountsLocalEnd = (gameId: string) =>
    sourcesOf(join(GAMES_DIR, gameId)).some((source) =>
      new RegExp(`<FirstGameFeedbackCard[^>]*mode="local"[^>]*gameId="${gameId}"`).test(source)
    )

  it('ne liste que des jeux locaux du catalogue', () => {
    for (const id of LOCAL_GAMES_WITHOUT_END_SCREEN) expect(isMeasuredLocalGameId(id)).toBe(true)
  })

  it('chaque jeu local mesuré a un écran de fin qui envoie la fin, ou figure dans la liste — jamais les deux', () => {
    const measured = GAMES.filter((g) => !g.onlineOnly).map((g) => g.id)
    for (const id of measured) {
      expect({ id, endScreen: mountsLocalEnd(id) }).toEqual({
        id,
        endScreen: !LOCAL_GAMES_WITHOUT_END_SCREEN.includes(id),
      })
    }
  })
})

describe('rapporteur', () => {
  function setup() {
    const sent: LocalGameReport[] = []
    let now = 1_000_000
    const report = createLocalGameReporter(
      (r) => sent.push(r),
      () => now
    )
    return { sent, report, advance: (ms: number) => (now += ms) }
  }

  it('n’envoie que le jeu et l’événement', () => {
    const { sent, report } = setup()
    expect(report(A, 'start', '/games/x')).toBe(true)
    expect(sent).toEqual([{ gameId: A, event: 'start' }])
    expect(Object.keys(sent[0]).sort()).toEqual(['event', 'gameId'])
  })

  it('dédoublonne les lancements d’un même jeu dans la fenêtre, pas au-delà', () => {
    const { sent, report, advance } = setup()
    expect(report(A, 'start', '/games/x')).toBe(true)
    advance(LOCAL_GAME_DEDUPE_MS - 1)
    expect(report(A, 'start', '/games/x')).toBe(false)
    advance(1)
    expect(report(A, 'start', '/games/x')).toBe(true)
    expect(sent).toHaveLength(2)
  })

  it('une fin n’est comptée qu’après un lancement du même jeu : jamais plus de fins que de lancements', () => {
    const { sent, report, advance } = setup()
    // Fin sans lancement compté (page rechargée en cours de partie… ou bug) : rien.
    expect(report(A, 'end', '/games/x')).toBe(false)
    expect(report(A, 'start', '/games/x')).toBe(true)
    advance(60_000)
    expect(report(A, 'end', '/games/x')).toBe(true)
    // Quatre revanches sur la même page : aucune fin de plus.
    for (let i = 0; i < 4; i += 1) {
      advance(60_000)
      expect(report(A, 'end', '/games/x')).toBe(false)
    }
    // Un autre jeu ouvert puis abandonné : un lancement, aucune fin.
    expect(report(B, 'start', '/games/y')).toBe(true)
    expect(sent).toEqual([
      { gameId: A, event: 'start' },
      { gameId: A, event: 'end' },
      { gameId: B, event: 'start' },
    ])
  })

  it('une nouvelle ouverture du même jeu rouvre la partie : sa fin compte', () => {
    const { sent, report, advance } = setup()
    report(A, 'start', '/games/x')
    advance(60_000)
    report(A, 'end', '/games/x')
    advance(60_000)
    expect(report(A, 'start', '/games/x')).toBe(true)
    advance(60_000)
    expect(report(A, 'end', '/games/x')).toBe(true)
    expect(sent.filter((r) => r.event === 'end')).toHaveLength(2)
  })

  it('un lancement et une fin, ou deux jeux, ne se dédoublonnent pas entre eux', () => {
    const { sent, report } = setup()
    report(A, 'start', '/games/x')
    report(A, 'end', '/games/x')
    report(B, 'start', '/games/x')
    expect(sent).toEqual([
      { gameId: A, event: 'start' },
      { gameId: A, event: 'end' },
      { gameId: B, event: 'start' },
    ])
  })

  it('n’envoie rien pour un jeu en ligne uniquement, un inconnu, un événement inconnu ou l’écran TV', () => {
    const { sent, report } = setup()
    expect(report(ONLINE_ONLY!.id, 'start', '/games/x')).toBe(false)
    expect(report('jeu-inconnu', 'end', '/games/x')).toBe(false)
    expect(report(A, 'pause' as never, '/games/x')).toBe(false)
    expect(report(A, 'end', '/fr/tv/ABCD')).toBe(false)
    expect(sent).toEqual([])
  })

  it('un envoyeur qui lève ne remonte jamais jusqu’à l’écran', () => {
    const report = createLocalGameReporter(() => {
      throw new Error('réseau')
    })
    expect(() => report(A, 'start', '/games/x')).not.toThrow()
  })

  it('côté serveur (pas de window) : ne fait rien, sans lever', () => {
    const sendBeacon = vi.fn()
    vi.stubGlobal('navigator', { sendBeacon })
    try {
      expect(() => reportLocalGame(A, 'start')).not.toThrow()
      expect(sendBeacon).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

/**
 * Envoi réel, dans une page simulée : module rechargé à chaque test, pour que
 * la mémoire de dédoublonnage de la page reparte de zéro.
 */
describe('envoi depuis la page', () => {
  async function loadInPage(pathname: string, sendBeacon: (url: string, body: Blob) => boolean) {
    vi.resetModules()
    vi.stubGlobal('window', { location: { pathname } })
    vi.stubGlobal('navigator', { sendBeacon: vi.fn(sendBeacon) })
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const mod = await import('./local-game-beacon')
    return { mod, fetchMock, sendBeacon: navigator.sendBeacon as ReturnType<typeof vi.fn> }
  }

  it('part en beacon vers la route, corps JSON des deux champs', async () => {
    try {
      const { mod, fetchMock, sendBeacon } = await loadInPage(`/fr${LOCAL[0].path}`, () => true)
      // Une fin ne part qu'après le lancement du même jeu (voir le rapporteur).
      mod.reportLocalGame(A, 'start')
      mod.reportLocalGame(A, 'end')
      expect(sendBeacon).toHaveBeenCalledTimes(2)
      const [url, blob] = sendBeacon.mock.calls[1] as [string, Blob]
      expect(url).toBe('/api/analytics/local-game')
      expect(blob.type).toBe('application/json')
      expect(JSON.parse(await blob.text())).toEqual({ gameId: A, event: 'end' })
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('beacon refusé ou en erreur : repli fetch keepalive, sans cookie', async () => {
    try {
      for (const sendBeacon of [() => false, () => { throw new TypeError('type refusé') }]) {
        const { mod, fetchMock } = await loadInPage(LOCAL[0].path, sendBeacon)
        mod.reportLocalGame(A, 'start')
        expect(fetchMock).toHaveBeenCalledWith('/api/analytics/local-game', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ gameId: A, event: 'start' }),
          keepalive: true,
          credentials: 'omit',
        })
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rien depuis l’écran TV', async () => {
    try {
      const { mod, fetchMock, sendBeacon } = await loadInPage('/fr/tv/ABCD', () => true)
      mod.reportLocalGame(A, 'end')
      expect(sendBeacon).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
