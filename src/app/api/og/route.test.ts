import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAMES } from '@/lib/games'
import { locales } from '@/i18n/routing'

/**
 * GET /api/og — cartes de partage. Un rendu gèle le thread Node ~400 ms :
 * next/og est simulé ici pour COMPTER les rendus (et lire le texte dessiné),
 * la base aussi ; la route et ses quotas sont les vrais. Cartes de marque et
 * de jeu mémoïsées par (type, jeu, langue), paramètres inconnus ignorés ;
 * invitations relues en base par le code (host= ignoré) et mémoïsées par
 * (code, langue) quelques minutes ; quota par réseau avant tout rendu neuf.
 */

type Node = unknown

const { renders, roomDb } = vi.hoisted(() => ({
  renders: [] as Node[],
  roomDb: { findUnique: vi.fn() },
}))

/** Texte porté par un arbre d'éléments : chaînes des props, enfants compris. */
function textOf(node: Node): string[] {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(textOf)
  if (node && typeof node === 'object' && 'props' in node) {
    return Object.values((node as { props: Record<string, unknown> }).props).flatMap(textOf)
  }
  return []
}

vi.mock('next/og', () => ({
  ImageResponse: class {
    private readonly element: Node
    constructor(element: Node) {
      this.element = element
      renders.push(element)
    }
    async arrayBuffer(): Promise<ArrayBuffer> {
      return new TextEncoder().encode(textOf(this.element).join('|')).buffer as ArrayBuffer
    }
  },
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    (key: string, values?: Record<string, string>) =>
      `${locale}:${namespace}.${key}${values ? ' ' + Object.values(values).join(' / ') : ''}`,
}))
vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: roomDb } }))

type RouteModule = typeof import('./route')
let route: RouteModule

let seq = 0
let ip = ''

const og = (query: string, from = ip) =>
  route.GET(new Request(`http://test/api/og?${query}`, { headers: { 'x-forwarded-for': from } }))

const drawn = async (res: Response) => new TextDecoder().decode(await res.arrayBuffer())

const GAME_A = GAMES[0].id
const GAME_B = GAMES[1].id

beforeEach(async () => {
  vi.clearAllMocks()
  renders.length = 0
  seq += 1
  ip = `198.51.100.${seq}`
  roomDb.findUnique.mockResolvedValue(null)
  vi.resetModules()
  route = await import('./route')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('cartes de marque et de jeu mémoïsées', () => {
  it('un paramètre aléatoire ne relance plus le rendu', async () => {
    for (let i = 0; i < 50; i += 1) {
      const res = await og(`type=game&game=${GAME_A}&locale=fr&v=${Math.random()}`, `10.20.${i}.1`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      expect(res.headers.get('cache-control')).toContain('max-age=86400')
    }
    expect(renders).toHaveLength(1)
  })

  it('une carte par (type, jeu, langue) : jeu inconnu = carte de marque, langue inconnue = français', async () => {
    await og('type=site&locale=fr')
    await og('type=site&locale=en&utm=x')
    await og('type=game&game=jeu-invente&locale=fr')
    await og('type=autre&locale=xx')
    await og(`type=game&game=${GAME_A}&locale=fr`)
    await og(`type=game&game=${GAME_A}&locale=es`)
    await og(`type=game&game=${GAME_B}&locale=fr&host=Pirate`)
    expect(renders).toHaveLength(5)
  })

  it('rendus simultanés de la même carte : un seul rendu partagé', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) => og(`type=game&game=${GAME_B}&locale=it&v=${i}`))
    )
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200])
    expect(renders).toHaveLength(1)
    // Chaque réponse porte sa propre copie de l'image.
    expect(await drawn(responses[4])).toContain(`it:games.catalog.${GAME_B}.title`)
    expect(await drawn(responses[0])).toContain(`it:games.catalog.${GAME_B}.title`)
  })
})

describe('quota par réseau avant un rendu neuf', () => {
  it('20 rendus neufs par minute, puis 429 sans rendu ; ce qui est en mémoire reste servi', async () => {
    const keys = GAMES.flatMap((game) => locales.map((locale) => `type=game&game=${game.id}&locale=${locale}`))
    for (let i = 0; i < 20; i += 1) expect((await og(keys[i])).status).toBe(200)
    expect(renders).toHaveLength(20)

    const refused = await og(keys[20])
    expect(refused.status).toBe(429)
    expect(await refused.json()).toMatchObject({ error: 'rate_limited', code: 'rate_limited' })
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(refused.headers.get('cache-control')).toBe('no-store')
    expect(renders).toHaveLength(20)

    expect((await og(keys[0])).status).toBe(200)
    expect((await og(keys[20], '203.0.113.30')).status).toBe(200)
  })
})

describe('invitation', () => {
  it('hôte et jeu relus en base par le code : host= et game= de l’URL ignorés', async () => {
    roomDb.findUnique.mockResolvedValue({ gameId: GAME_A, host: { name: 'Suzon', displayName: 'Suz' } })

    const res = await og(`type=invite&code=abc123&host=Le%20site%20vous%20doit%2050%E2%82%AC&game=${GAME_B}&locale=fr`)

    expect(res.status).toBe(200)
    expect(roomDb.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'ABC123' } }))
    const text = await drawn(res)
    expect(text).toContain('fr:og.inviteTitle Suzon / fr:games.catalog.' + GAME_A + '.title')
    expect(text).toContain('ABC123')
    expect(text).not.toContain('50')
    expect(text).not.toContain(GAME_B)
    expect(res.headers.get('x-robots-tag')).toBe('noindex')
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
  })

  it('mémoïsée par (code, langue) cinq minutes, puis relue', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T20:00:00Z'))
    roomDb.findUnique.mockResolvedValue({ gameId: GAME_A, host: { name: 'Suzon', displayName: null } })

    for (let i = 0; i < 10; i += 1) await og(`type=invite&code=ABC123&locale=fr&host=x${i}`, `10.30.${i}.1`)
    await og('type=invite&code=ABC123&locale=en')
    expect(roomDb.findUnique).toHaveBeenCalledTimes(2)
    expect(renders).toHaveLength(2)

    vi.setSystemTime(new Date('2026-10-20T20:05:01Z'))
    roomDb.findUnique.mockResolvedValue({ gameId: GAME_A, host: { name: 'Suzanne', displayName: null } })
    const res = await og('type=invite&code=ABC123&locale=fr')
    expect(await drawn(res)).toContain('Suzanne')
    expect(renders).toHaveLength(3)
  })

  it('code inconnu : carte nue (sans le code), rendue une seule fois ; chaque essai compte au quota', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 21; i += 1) {
      const code = `ZZ${String(i).padStart(4, '0')}`
      const res = await og(`type=invite&code=${code}&locale=fr`)
      statuses.push(res.status)
      if (res.status === 200) {
        const text = await drawn(res)
        expect(text).toContain('fr:og.inviteTitleBare')
        expect(text).not.toContain(code)
      }
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true)
    expect(statuses[20]).toBe(429)
    expect(renders).toHaveLength(1)
    expect(roomDb.findUnique).toHaveBeenCalledTimes(20)
  })

  it('code mal formé : carte nue, sans lecture en base', async () => {
    const res = await og('type=invite&code=<script>&locale=fr')
    expect(res.status).toBe(200)
    expect(await drawn(res)).toContain('fr:og.inviteTitleBare')
    expect(roomDb.findUnique).not.toHaveBeenCalled()
  })
})
