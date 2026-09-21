import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

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
