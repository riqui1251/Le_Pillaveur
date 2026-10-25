import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError, isCrossSiteRequest, readApiJson, withApiRoute } from '@/lib/api-route'

/**
 * Le contrat de l'enveloppe : quoi qu'il arrive dans un handler, le client
 * reçoit du JSON avec un code stable — jamais la page HTML de 500 de Next, que
 * `parseApiJson` ne sait rendre qu'en « réponse illisible ».
 */

/** Erreur telle que Prisma la lève : un `code` « P2002 » et un message bavard. */
function prismaError(code: string): Error & { code: string } {
  const error = new Error(
    `Unique constraint failed on the fields: (email) — valeur « joueur@example.test »`
  ) as Error & { code: string }
  error.name = 'PrismaClientKnownRequestError'
  error.code = code
  return error
}

function jsonRequest(payload: string, contentLength?: number): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  headers['content-length'] = String(
    contentLength ?? new TextEncoder().encode(payload).length
  )
  return new Request('https://example.test/api', { method: 'POST', headers, body: payload })
}

let logged: unknown[][]

beforeEach(() => {
  logged = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apiError', () => {
  it('pose le code dans `error` ET dans `code`', async () => {
    const response = apiError('auth_required', 401)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'auth_required',
      code: 'auth_required',
    })
  })

  it('emporte les détails d’accompagnement sans écraser le code', async () => {
    const response = apiError('friend_request_cooldown', 429, { status: 'declined-cooldown' })
    await expect(response.json()).resolves.toEqual({
      error: 'friend_request_cooldown',
      code: 'friend_request_cooldown',
      status: 'declined-cooldown',
    })
  })
})

describe('withApiRoute', () => {
  it('laisse passer la réponse du handler et ses arguments', async () => {
    const handler = withApiRoute(
      'test GET',
      async (_request: Request, context: { id: string }) =>
        Response.json({ ok: true, id: context.id })
    )
    const response = await handler(new Request('https://example.test/api'), { id: 'abc' })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, id: 'abc' })
    expect(logged).toEqual([])
  })

  it('traduit un JSON malformé en 400 invalid_json', async () => {
    const handler = withApiRoute('test POST', async () => {
      // Ce que lève `request.json()` sur un corps illisible.
      throw new SyntaxError('Unexpected token < in JSON at position 0')
    })
    const response = await handler()
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'invalid_json',
      code: 'invalid_json',
    })
  })

  it('traduit une violation d’unicité Prisma en 409 conflict', async () => {
    const handler = withApiRoute('test POST', async () => {
      throw prismaError('P2002')
    })
    const response = await handler()
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'conflict', code: 'conflict' })
  })

  it('traduit une ligne disparue (P2025) en 404 not_found', async () => {
    const handler = withApiRoute('test DELETE', async () => {
      throw prismaError('P2025')
    })
    const response = await handler()
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found', code: 'not_found' })
  })

  it('transforme n’importe quelle autre panne en 500 server_error', async () => {
    const handler = withApiRoute('test POST', async () => {
      throw new TypeError('lecture de `id` sur undefined')
    })
    const response = await handler()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'server_error',
      code: 'server_error',
    })
  })

  it('ne journalise NI le message NI le corps — seulement la route et le type', async () => {
    const handler = withApiRoute('auth/register POST', async () => {
      throw prismaError('P2002')
    })
    await handler()
    expect(logged).toEqual([['[api] auth/register POST', 'PrismaClientKnownRequestError', 'P2002']])
    // Le message Prisma recopie la ligne fautive : une adresse e-mail dans les
    // journaux, c'est exactement ce que le RGPD nous interdit de laisser filer.
    const trace = JSON.stringify(logged)
    expect(trace).not.toContain('joueur@example.test')
    expect(trace).not.toContain('Unique constraint')
  })

  it('ne confond pas un objet quelconque portant `code` avec une erreur Prisma', async () => {
    const handler = withApiRoute('test POST', async () => {
      throw Object.assign(new Error('boom'), { code: 'ECONNREFUSED' })
    })
    const response = await handler()
    expect(response.status).toBe(500)
  })
})

describe('readApiJson', () => {
  it('rend le corps analysé', async () => {
    const parsed = await readApiJson<{ mode: string }>(jsonRequest('{"mode":"soft"}'))
    expect(parsed).toEqual({ ok: true, body: { mode: 'soft' } })
  })

  it('refuse un corps illisible en 400 invalid_json', async () => {
    const parsed = await readApiJson(jsonRequest('pas du json'))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.response.status).toBe(400)
    await expect(parsed.response.json()).resolves.toEqual({
      error: 'invalid_json',
      code: 'invalid_json',
    })
  })

  it('refuse un corps au-dessus du plafond en 413, sans le lire', async () => {
    const parsed = await readApiJson(jsonRequest('{"a":1}'), 4)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.response.status).toBe(413)
    await expect(parsed.response.json()).resolves.toEqual({
      error: 'payload_too_large',
      code: 'payload_too_large',
    })
  })
})

/**
 * CSRF des routes SANS session (connexion, invité, déconnexion) : SameSite=Lax
 * ne les protège pas. Un formulaire posté depuis une page tierce connectait la
 * victime au compte de l'attaquant, ou effaçait le cookie d'un invité, sa
 * seule clé. L'enveloppe refuse AVANT le handler, donc avant toute lecture du
 * corps, d'après ce que le navigateur dit de la provenance.
 */
describe('withApiRoute — écriture venue d’un autre site', () => {
  const SITE = 'https://lepillaveur.test'

  beforeEach(() => {
    vi.stubEnv('SITE_URL', SITE)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** Écriture telle qu'un navigateur l'envoie, avec ce qu'il dit de sa provenance. */
  function write(
    headers: Record<string, string>,
    { method = 'POST', url = 'https://example.test/api' }: { method?: string; url?: string } = {}
  ): Request {
    const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(method)
    return new Request(url, { method, headers, body: hasBody ? '{"email":"a@b.c"}' : undefined })
  }

  function wrapped(options?: { allowCrossSite?: boolean }) {
    const handler = vi.fn(async (_request: Request) => Response.json({ ok: true }))
    return { handler, route: withApiRoute('test POST', handler, options) }
  }

  async function expectRefused(response: Response) {
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'cross_site_request',
      code: 'cross_site_request',
    })
  }

  it('refuse un POST annoncé Sec-Fetch-Site: cross-site, sans appeler le handler ni lire le corps', async () => {
    const { handler, route } = wrapped()
    // Le formulaire piégé de l'audit : enctype=text/plain dont le nom de champ
    // forme un JSON de connexion au compte de l'attaquant.
    const request = write({
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.example',
      'content-type': 'text/plain',
    })
    await expectRefused(await route(request))
    expect(handler).not.toHaveBeenCalled()
    expect(request.bodyUsed).toBe(false)
  })

  it('refuse un Origin étranger, même sans Sec-Fetch-Site (navigateur ancien)', async () => {
    const { handler, route } = wrapped()
    await expectRefused(await route(write({ origin: 'https://evil.example' })))
    expect(handler).not.toHaveBeenCalled()
  })

  it('refuse Origin: null (iframe sandbox, redirection), qui ne prouve rien', async () => {
    const { handler, route } = wrapped()
    await expectRefused(await route(write({ origin: 'null' })))
    expect(handler).not.toHaveBeenCalled()
  })

  it('accepte l’Origin du site même quand request.url porte l’hôte interne du proxy', async () => {
    const { handler, route } = wrapped()
    const response = await route(
      write({ origin: SITE, 'sec-fetch-site': 'same-origin' }, { url: 'http://127.0.0.1:3000/api' })
    )
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('accepte une requête de même origine que l’URL appelée', async () => {
    const { handler, route } = wrapped()
    const response = await route(
      write({ origin: 'https://example.test', 'sec-fetch-site': 'same-origin' })
    )
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('laisse passer sans Origin ni Sec-Fetch-Site (curl, script) : ce n’est pas du CSRF', async () => {
    const { handler, route } = wrapped()
    const response = await route(write({ 'content-type': 'application/json' }))
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('ne refuse jamais GET, HEAD ni OPTIONS, même venus d’un autre site', async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const { handler, route } = wrapped()
      const response = await route(
        write({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }, { method })
      )
      expect({ method, status: response.status }).toEqual({ method, status: 200 })
      expect(handler).toHaveBeenCalledTimes(1)
    }
  })

  it('allowCrossSite laisse passer le POST d’un autre site (form_post d’Apple)', async () => {
    const { handler, route } = wrapped({ allowCrossSite: true })
    const response = await route(
      write({ 'sec-fetch-site': 'cross-site', origin: 'https://appleid.apple.com' })
    )
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('ne touche pas à un handler appelé sans requête (les tests de l’enveloppe elle-même)', async () => {
    const handler = withApiRoute('test', async () => Response.json({ ok: true }))
    expect((await handler()).status).toBe(200)
  })

  it('isCrossSiteRequest : l’URL du site mal configurée n’ouvre rien, un Origin inconnu reste refusé', () => {
    vi.stubEnv('SITE_URL', 'pas une url')
    expect(isCrossSiteRequest(write({ origin: 'https://evil.example' }))).toBe(true)
    expect(isCrossSiteRequest(write({ origin: 'https://example.test' }))).toBe(false)
  })
})
