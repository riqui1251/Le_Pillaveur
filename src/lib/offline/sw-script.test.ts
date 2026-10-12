import { describe, expect, it, vi } from 'vitest'
import { buildRetiringServiceWorkerScript, buildServiceWorkerScript, type ServiceWorkerConfig } from './sw-script'

/**
 * Le script du worker est exécuté ICI, dans un faux environnement de service
 * worker (caches, fetch, événements install/activate/fetch), avec les
 * Response/URL/Headers natifs de Node. On teste les STRATÉGIES réelles —
 * ce qui est préchargé, ce qui est servi sans réseau, ce qui est laissé au
 * navigateur — pas une réécriture en TypeScript du même code.
 */

const ORIGIN = 'https://lepillaveur.fr'

type ReqLike = { url: string; method: string; mode: string; headers: Headers }

/** Une requête telle que le worker la voit (un vrai Request refuse mode: 'navigate'). */
function req(path: string, init: { mode?: string; headers?: Record<string, string>; method?: string } = {}): ReqLike {
  return {
    url: new URL(path, ORIGIN).href,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'no-cors',
    headers: new Headers(init.headers ?? {}),
  }
}
const navigate = (path: string) => req(path, { mode: 'navigate', headers: { Accept: 'text/html,application/xhtml+xml' } })
const rsc = (path: string) => req(`${path}?_rsc=abc`, { headers: { RSC: '1' } })

function urlOf(input: ReqLike | string): string {
  return typeof input === 'string' ? new URL(input, ORIGIN).href : input.url
}
function withoutSearch(href: string): string {
  const url = new URL(href)
  url.search = ''
  return url.href
}

class FakeCache {
  entries = new Map<string, Response>()
  async match(input: ReqLike | string, opts?: { ignoreSearch?: boolean }): Promise<Response | undefined> {
    const key = urlOf(input)
    const wanted = opts?.ignoreSearch ? withoutSearch(key) : key
    for (const [stored, response] of this.entries) {
      if ((opts?.ignoreSearch ? withoutSearch(stored) : stored) === wanted) return response.clone()
    }
    return undefined
  }
  async put(input: ReqLike | string, response: Response): Promise<void> {
    this.entries.set(urlOf(input), response)
  }
  async delete(input: ReqLike | string): Promise<boolean> {
    return this.entries.delete(urlOf(input))
  }
  async keys(): Promise<{ url: string }[]> {
    return [...this.entries.keys()].map((url) => ({ url }))
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>()
  async open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name)
    if (!cache) {
      cache = new FakeCache()
      this.caches.set(name, cache)
    }
    return cache
  }
  async keys(): Promise<string[]> {
    return [...this.caches.keys()]
  }
  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name)
  }
  async match(input: ReqLike | string, opts?: { ignoreSearch?: boolean }): Promise<Response | undefined> {
    for (const cache of this.caches.values()) {
      const found = await cache.match(input, opts)
      if (found) return found
    }
    return undefined
  }
}

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, ...init, headers: { 'Content-Type': 'text/html; charset=utf-8', ...(init.headers ?? {}) } })
const asset = (body = 'ok') => new Response(body, { status: 200, headers: { 'Content-Type': 'text/javascript' } })
const never = () => new Promise<Response>(() => {})

type FetchHandler = (url: URL, request: ReqLike | string, init?: RequestInit) => Promise<Response> | Response
type FetchCall = { url: string; accept: string | null }

function fakeFetch(initial: FetchHandler) {
  const calls: FetchCall[] = []
  const net = { handler: initial, calls }
  const fetch = async (input: ReqLike | string, init?: RequestInit) => {
    const url = new URL(urlOf(input))
    const headers = init?.headers as Record<string, string> | undefined
    const accept = headers?.Accept ?? (typeof input === 'string' ? null : input.headers.get('accept'))
    calls.push({ url: url.href, accept })
    return net.handler(url, input, init)
  }
  return { fetch, net }
}

/** Un serveur de test : HTML pour les pages, « ok » pour le reste, 404 au-delà. */
const site: FetchHandler = (url) => {
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') return asset()
  if (url.pathname === '/fr/joueurs') return html('<!doctype html><meta name="lp-page" content="joueurs"/>joueurs fr')
  if (/^\/(fr|en|es|it)\//.test(url.pathname)) return html(`<!doctype html>page ${url.pathname}`)
  return new Response('nope', { status: 404 })
}
const offline: FetchHandler = () => {
  throw new TypeError('Failed to fetch')
}

const CONFIG: ServiceWorkerConfig = {
  version: 'v1',
  locale: 'fr',
  locales: ['fr', 'en', 'es', 'it'],
  assets: ['/_next/static/chunks/a.js', '/_next/static/css/a.css', '/icons/icon-192x192.png', '/manifest.json'],
  pages: ['/fr/jeux', '/fr/hors-ligne', '/fr/games/purple'],
  cacheablePaths: ['/jeux', '/joueurs', '/hors-ligne', '/games/purple'],
  hubPath: '/jeux',
  offlinePath: '/hors-ligne',
  playersPath: '/joueurs',
  pageMarkers: { '/joueurs': '<meta name="lp-page" content="joueurs"' },
  navTimeoutMs: 30,
  strings: { title: 'Hors ligne', lead: 'Pas de réseau pour le moment.', retry: 'Réessayer' },
}

type Env = { fetch: FetchHandler; onLine?: boolean; caches?: FakeCacheStorage; script?: string }

function boot(env: Env) {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      ;(listeners[type] ??= []).push(fn)
    },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    registration: { unregister: vi.fn(async () => true) },
  }
  const caches = env.caches ?? new FakeCacheStorage()
  const { fetch, net } = fakeFetch(env.fetch)
  const navigator = { onLine: env.onLine ?? true }
  const script = env.script ?? buildServiceWorkerScript(CONFIG)
  new Function('self', 'caches', 'fetch', 'navigator', script)(self, caches, fetch, navigator)

  const lifecycle = async (type: 'install' | 'activate') => {
    const waits: Promise<unknown>[] = []
    for (const fn of listeners[type] ?? []) fn({ waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
  }
  const request = async (request: ReqLike): Promise<Response | undefined> => {
    let responded: Promise<Response> | undefined
    for (const fn of listeners.fetch ?? []) {
      fn({ request, respondWith: (p: Promise<Response> | Response) => { responded = Promise.resolve(p) }, waitUntil: () => {} })
    }
    const response = responded ? await responded : undefined
    // Les mises en cache différées (storeNavigation, cacheFirst) se terminent après la réponse.
    await new Promise((resolve) => setTimeout(resolve, 5))
    return response
  }
  return { self, caches, net, calls: net.calls, navigator, install: () => lifecycle('install'), activate: () => lifecycle('activate'), request }
}

/**
 * Un worker installé et actif sur le site de test, prêt à servir — PUIS le
 * réseau et la connexion deviennent ce que le test demande (panne, lenteur,
 * navigateur hors ligne) : l'installation, elle, s'est faite en ligne.
 */
async function installed(env: Partial<Env> = {}) {
  const sw = boot({ fetch: site, caches: env.caches })
  await sw.install()
  await sw.activate()
  sw.calls.length = 0
  if (env.fetch) sw.net.handler = env.fetch
  if (env.onLine !== undefined) sw.navigator.onLine = env.onLine
  return sw
}

describe('installation', () => {
  it('précharge fichiers et pages, demande les pages comme du HTML, retient la langue et passe devant', async () => {
    const sw = boot({ fetch: site })
    await sw.install()
    const statics = await sw.caches.open('lp-static-v1')
    const pages = await sw.caches.open('lp-pages-v1')
    expect((await statics.keys()).map((k) => k.url).sort()).toEqual(CONFIG.assets.map((p) => ORIGIN + p).sort())
    // La page des joueurs (protégée) est tentée en plus : ici le site de test la sert avec son marqueur.
    expect((await pages.keys()).map((k) => k.url).sort()).toEqual([...CONFIG.pages, '/fr/joueurs'].map((p) => ORIGIN + p).sort())
    for (const call of sw.calls.filter((c) => /\/fr\//.test(c.url))) expect(call.accept).toBe('text/html')
    const meta = await sw.caches.open('lp-meta')
    expect(await (await meta.match('/__lp/derniere-langue'))?.text()).toBe('fr')
    expect(sw.self.skipWaiting).toHaveBeenCalled()
  })

  it('tente la page des joueurs sans en faire dépendre l’installation : la page compte rendue à sa place n’est pas gardée', async () => {
    const sw = boot({
      fetch: (url, r) => (url.pathname === '/fr/joueurs' ? html('<!doctype html>compte ?redirect=/joueurs') : site(url, r)),
    })
    await sw.install()
    const pages = await sw.caches.open('lp-pages-v1')
    expect(await pages.match('/fr/joueurs')).toBeUndefined()
    expect(await pages.match('/fr/jeux')).toBeDefined()
    expect(sw.self.skipWaiting).toHaveBeenCalled()
  })

  it('échoue si le hub ou la page de repli manque, et si un fichier manque', async () => {
    const hub = boot({ fetch: (url) => (url.pathname === '/fr/jeux' ? new Response('', { status: 503 }) : site(url, '')) })
    await expect(hub.install()).rejects.toThrow(/precache/)
    expect(hub.self.skipWaiting).not.toHaveBeenCalled()
    const asset = boot({ fetch: (url) => (url.pathname === '/_next/static/css/a.css' ? new Response('', { status: 404 }) : site(url, '')) })
    await expect(asset.install()).rejects.toThrow(/precache/)
  })

  it('une page de jeu en échec n’empêche pas les autres : pas de réinstallation sans fin pour un 504 passager', async () => {
    const sw = boot({ fetch: (url) => (url.pathname === '/fr/games/purple' ? new Response('', { status: 504 }) : site(url, '')) })
    await sw.install()
    const pages = await sw.caches.open('lp-pages-v1')
    expect(await pages.match('/fr/games/purple')).toBeUndefined()
    expect(await pages.match('/fr/jeux')).toBeDefined()
    expect(await pages.match('/fr/hors-ligne')).toBeDefined()
    expect(sw.self.skipWaiting).toHaveBeenCalled()
  })

  it('refuse une page qui n’est pas du HTML ou qui a été redirigée ailleurs', async () => {
    const notHtml = boot({ fetch: (url) => (url.pathname === '/fr/jeux' ? asset('{}') : site(url, '')) })
    await expect(notHtml.install()).rejects.toThrow(/pas la page attendue/)
    const redirected = boot({
      fetch: (url) => {
        const response = site(url, '') as Response
        if (url.pathname === '/fr/jeux') Object.defineProperty(response, 'redirected', { value: true })
        return response
      },
    })
    await expect(redirected.install()).rejects.toThrow(/precache/)
  })

  it('reprend un fichier à empreinte déjà en cache au lieu de le retélécharger', async () => {
    const caches = new FakeCacheStorage()
    const old = await caches.open('lp-static-v0')
    await old.put('/_next/static/chunks/a.js', asset('ancien'))
    const sw = boot({ fetch: site, caches })
    await sw.install()
    expect(sw.calls.map((c) => c.url)).not.toContain(ORIGIN + '/_next/static/chunks/a.js')
    expect(sw.calls.map((c) => c.url)).toContain(ORIGIN + '/icons/icon-192x192.png')
    const statics = await caches.open('lp-static-v1')
    expect(await (await statics.match('/_next/static/chunks/a.js'))?.text()).toBe('ancien')
  })
})

describe('activation', () => {
  it('purge les caches des versions précédentes, garde la mémoire de langue et prend les pages ouvertes', async () => {
    const caches = new FakeCacheStorage()
    await caches.open('lp-static-v0')
    await caches.open('lp-pages-v0')
    await caches.open('lp-meta')
    await caches.open('autre-site')
    const sw = boot({ fetch: site, caches })
    await sw.install()
    await sw.activate()
    expect((await caches.keys()).sort()).toEqual(['autre-site', 'lp-meta', 'lp-pages-v1', 'lp-static-v1'])
    expect(sw.self.clients.claim).toHaveBeenCalled()
  })
})

describe('ce que le worker ne touche pas', () => {
  it('laisse passer les API, les requêtes non GET, les autres origines, /sw.js et les chemins de Capacitor', async () => {
    const sw = await installed()
    for (const r of [
      req('/api/auth/me'),
      req('/fr/jeux', { method: 'POST', mode: 'navigate' }),
      req('https://accounts.google.com/x'),
      req('/sw.js'),
      req('/_capacitor_file_/data/x'),
      req('/_capacitor_http_interceptor_?u=x'),
    ]) {
      expect(await sw.request(r)).toBeUndefined()
    }
    expect(sw.calls).toHaveLength(0)
  })

  it('laisse une page hors catalogue au réseau sans rien mémoriser', async () => {
    const sw = await installed()
    const response = await sw.request(navigate('/fr/online/salon'))
    expect(await response?.text()).toBe('<!doctype html>page /fr/online/salon')
    const pages = await sw.caches.open('lp-pages-v1')
    expect(await pages.match('/fr/online/salon')).toBeUndefined()
  })
})

describe('fichiers statiques', () => {
  it('sert un fichier préchargé sans réseau, et met en cache un fichier inconnu après l’avoir téléchargé', async () => {
    const sw = await installed()
    const cached = await sw.request(req('/_next/static/chunks/a.js'))
    expect(await cached?.text()).toBe('ok')
    expect(sw.calls).toHaveLength(0)

    await sw.request(req('/_next/static/chunks/nouveau.js'))
    expect(sw.calls).toHaveLength(1)
    sw.calls.length = 0
    await sw.request(req('/_next/static/chunks/nouveau.js'))
    expect(sw.calls).toHaveLength(0)
  })
})

describe('navigation vers une page en cache', () => {
  it('réseau d’abord : la réponse fraîche est rendue et remplace le cache', async () => {
    const sw = await installed({ fetch: (url, r) => (url.pathname === '/fr/games/purple' ? html('fraiche') : site(url, r)) })
    const response = await sw.request(navigate('/fr/games/purple'))
    expect(await response?.text()).toBe('fraiche')
    const pages = await sw.caches.open('lp-pages-v1')
    expect(await (await pages.match('/fr/games/purple'))?.text()).toBe('fraiche')
  })

  it('réseau en panne : la page en cache, y compris avec un slash final', async () => {
    const sw = await installed({ fetch: offline })
    expect(await (await sw.request(navigate('/fr/games/purple')))?.text()).toBe('<!doctype html>page /fr/games/purple')
    expect(await (await sw.request(navigate('/fr/games/purple/')))?.text()).toBe('<!doctype html>page /fr/games/purple')
  })

  it('navigateur hors ligne : le cache tout de suite, sans tenter le réseau', async () => {
    const sw = await installed({ onLine: false })
    expect(await (await sw.request(navigate('/fr/jeux')))?.text()).toBe('<!doctype html>page /fr/jeux')
    expect(sw.calls).toHaveLength(0)
  })

  it('réseau trop lent : la page en cache après le délai', async () => {
    const sw = await installed({ fetch: never })
    const response = await sw.request(navigate('/fr/jeux'))
    expect(await response?.text()).toBe('<!doctype html>page /fr/jeux')
  })

  it('serveur en panne (503, 502, 524) : la page en cache — sauf devant un défi Cloudflare, rendu tel quel', async () => {
    for (const status of [502, 503, 524]) {
      const sw = await installed({ fetch: () => new Response('panne', { status }) })
      expect(await (await sw.request(navigate('/fr/jeux')))?.text()).toBe('<!doctype html>page /fr/jeux')
    }
    const challenged = await installed({
      fetch: () => new Response('defi', { status: 503, headers: { 'cf-mitigated': 'challenge' } }),
    })
    const response = await challenged.request(navigate('/fr/jeux'))
    expect(response?.status).toBe(503)
    expect(await response?.text()).toBe('defi')
  })
})

describe('page des joueurs (protégée)', () => {
  it('n’est mise en cache qu’avec son marqueur : la page compte rendue à sa place ne l’est pas', async () => {
    const sw = await installed({
      fetch: (url, r) => (url.pathname === '/fr/joueurs' ? html('<!doctype html>compte ?redirect=/joueurs') : site(url, r)),
    })
    const pages = await sw.caches.open('lp-pages-v1')
    await pages.delete('/fr/joueurs') // le préchargement l’avait eue (site de test avec marqueur)
    await sw.request(navigate('/fr/joueurs'))
    expect(await pages.match('/fr/joueurs')).toBeUndefined()
  })

  it('entre dans le cache à la visite, puis se sert sans réseau', async () => {
    const sw = await installed()
    const pages = await sw.caches.open('lp-pages-v1')
    await pages.delete('/fr/joueurs') // comme si le préchargement l’avait manquée (visiteur sans mode)
    await sw.request(navigate('/fr/joueurs'))
    expect(await pages.match('/fr/joueurs')).toBeDefined()
    sw.navigator.onLine = false
    expect(await (await sw.request(navigate('/fr/joueurs')))?.text()).toContain('joueurs fr')
  })
})

describe('navigation sans réseau vers une page absente du cache', () => {
  it('redirige vers la page hors ligne de la langue, en retenant la page voulue', async () => {
    const sw = await installed({ fetch: offline })
    const response = await sw.request(navigate('/fr/compte?x=1'))
    expect(response?.status).toBe(302)
    expect(response?.headers.get('location')).toBe(ORIGIN + '/fr/hors-ligne?from=%2Fcompte%3Fx%3D1')
  })

  it('ramène la racine et les chemins sans langue vers la dernière langue vue', async () => {
    const sw = await installed({ fetch: offline })
    expect((await sw.request(navigate('/')))?.headers.get('location')).toBe(ORIGIN + '/fr/jeux')
    expect((await sw.request(navigate('/jeux')))?.headers.get('location')).toBe(ORIGIN + '/fr/jeux')
    expect((await sw.request(navigate('/en')))?.headers.get('location')).toBe(ORIGIN + '/en/jeux')
    expect((await sw.request(navigate('/en/')))?.headers.get('location')).toBe(ORIGIN + '/en/jeux')
  })

  it('se souvient de la langue d’une page visitée en ligne', async () => {
    const sw = await installed()
    await sw.request(navigate('/en/jeux'))
    sw.net.handler = offline
    const beforeRoot = sw.calls.length
    expect((await sw.request(navigate('/')))?.headers.get('location')).toBe(ORIGIN + '/en/jeux')
    expect(sw.calls.length).toBe(beforeRoot + 1) // la racine n’est pas en cache : le réseau est tenté
  })

  it('sert la page hors ligne préchargée — celle d’une autre langue à défaut — ou une page de secours minimale en 503', async () => {
    const sw = await installed({ fetch: offline })
    expect(await (await sw.request(navigate('/fr/hors-ligne?from=%2Fcompte')))?.text()).toBe('<!doctype html>page /fr/hors-ligne')
    // Langue jamais vue en ligne : la page de repli française, qui liste les jeux, plutôt que l’écran brut.
    expect(await (await sw.request(navigate('/en/hors-ligne')))?.text()).toBe('<!doctype html>page /fr/hors-ligne')

    const pages = await sw.caches.open('lp-pages-v1')
    await pages.delete('/fr/hors-ligne')
    const response = await sw.request(navigate('/en/hors-ligne'))
    expect(response?.status).toBe(503)
    const body = await response?.text()
    expect(body).toContain('Hors ligne')
    expect(body).toContain('Réessayer')
    expect(body).toContain('location.reload()')
  })
})

describe('navigation client de Next (contenu RSC)', () => {
  it('réseau quand tout va bien', async () => {
    const sw = await installed({ fetch: () => new Response('rsc', { status: 200 }) })
    expect(await (await sw.request(rsc('/fr/games/purple')))?.text()).toBe('rsc')
  })

  it('erreur réseau franche sans réseau ou si le réseau traîne : Next recharge la page, servie du cache', async () => {
    const offlineSw = await installed({ onLine: false })
    expect((await offlineSw.request(rsc('/fr/games/purple')))?.type).toBe('error')
    expect(offlineSw.calls).toHaveLength(0)
    const slow = await installed({ fetch: never })
    expect((await slow.request(rsc('/fr/games/purple')))?.type).toBe('error')
  })

  it('ne s’en mêle pas pour une page absente du cache', async () => {
    const sw = await installed({ fetch: offline })
    expect(await sw.request(rsc('/fr/online/salon'))).toBeUndefined()
  })

  it('laisse les préchargements de Next au réseau, sans délai ni erreur synthétique', async () => {
    const sw = await installed({ fetch: never })
    const prefetch = req('/fr/games/purple?_rsc=abc', { headers: { RSC: '1', 'Next-Router-Prefetch': '1' } })
    const outcome = await Promise.race([sw.request(prefetch), new Promise((resolve) => setTimeout(() => resolve('pending'), 120))])
    expect(outcome).toBe('pending')
    expect(sw.calls).toHaveLength(1)
  })

  it('une NAVIGATION dont l’URL porte ?_rsc= reste une navigation : la page en cache, pas une erreur', async () => {
    const sw = await installed({ onLine: false })
    const response = await sw.request(req('/fr/games/purple?_rsc=abc', { mode: 'navigate', headers: { Accept: 'text/html' } }))
    expect(await response?.text()).toBe('<!doctype html>page /fr/games/purple')
  })
})

describe('stockage en panne', () => {
  it('une navigation retombe sur le réseau quand le cache refuse de s’ouvrir', async () => {
    const sw = await installed()
    sw.caches.open = async () => {
      throw new Error('storage')
    }
    const response = await sw.request(navigate('/fr/games/purple'))
    expect(await response?.text()).toBe('<!doctype html>page /fr/games/purple')
    expect(sw.calls).toHaveLength(1)
  })
})

describe('worker neutralisé', () => {
  it('s’installe, vide ses caches et se désinscrit', async () => {
    const caches = new FakeCacheStorage()
    await caches.open('lp-static-v1')
    await caches.open('autre-site')
    const sw = boot({ fetch: site, caches, script: buildRetiringServiceWorkerScript('développement */ test') })
    await sw.install()
    await sw.activate()
    expect(sw.self.skipWaiting).toHaveBeenCalled()
    expect(await caches.keys()).toEqual(['autre-site'])
    expect(sw.self.registration.unregister).toHaveBeenCalled()
  })

  it('ne contient que de la syntaxe ES2017 (pas de ?. ni ??), pour les vieilles WebView', () => {
    for (const script of [buildServiceWorkerScript(CONFIG), buildRetiringServiceWorkerScript('x')]) {
      expect(script).not.toMatch(/\?\./)
      expect(script).not.toMatch(/\?\?/)
      expect(script).not.toMatch(/=>/)
    }
  })
})
