import { getClientIpFromRequest } from '@/lib/geo-server'

type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000
let lastCleanup = Date.now()

function cleanupExpired(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key)
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  cleanupExpired(now)

  const entry = store.get(key)
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  if (entry.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }

  entry.count += 1
  return { ok: true }
}

export function rateLimitKey(request: Request, scope: string, email?: string): string {
  const ip = getClientIpFromRequest(request) ?? 'unknown'
  const normalizedEmail = email?.trim().toLowerCase()
  return normalizedEmail ? `${scope}:${ip}:${normalizedEmail}` : `${scope}:${ip}`
}

/**
 * Clé indépendante de l'IP, pour les quotas qui suivent un compte connecté
 * (chat) : changer de réseau ou passer par un proxy ne doit pas remettre le
 * compteur à zéro, contrairement à rateLimitKey (anti-abus anonyme).
 */
export function userRateLimitKey(scope: string, userId: string): string {
  return `${scope}:user:${userId}`
}

const TEXT_ENCODER = new TextEncoder()

export type LimitedJsonBody<T> =
  | { ok: true; body: T }
  | { ok: false; reason: 'too_large' | 'invalid_json' }

/**
 * Lecture JSON bornée : l'App Router ne plafonne pas la taille des corps de
 * requête, n'importe quel client peut donc pousser plusieurs mégaoctets vers
 * une route qui écrit en base.
 *
 * Deux garde-fous, dans cet ordre, pour ne jamais matérialiser un corps
 * hostile en mémoire :
 * 1. le Content-Length annoncé, quand il est présent, permet de refuser sans
 *    lire une seule ligne du corps ;
 * 2. il est absent en transfert chunked (et un attaquant peut l'omettre), donc
 *    le flux est lu morceau par morceau et interrompu dès que le plafond réel
 *    est dépassé — jamais un `request.text()` sur l'intégralité du corps.
 */
export async function readJsonBodyLimited<T = unknown>(
  request: Request,
  maxBytes: number
): Promise<LimitedJsonBody<T>> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: 'too_large' }
  }

  const raw = await readBodyLimited(request, maxBytes)
  if (raw === TOO_LARGE) return { ok: false, reason: 'too_large' }
  if (raw === null) return { ok: false, reason: 'invalid_json' }

  try {
    return { ok: true, body: JSON.parse(raw) as T }
  } catch {
    return { ok: false, reason: 'invalid_json' }
  }
}

/** Sentinelle « plafond dépassé », distincte du null d'échec de lecture. */
const TOO_LARGE = Symbol('too_large')

/**
 * Lit le corps en comptant les octets au fil de l'eau et coupe le flux dès le
 * dépassement. Repli sur `text()` si l'environnement n'expose pas de flux
 * (corps déjà tamponné) : la taille est alors mesurée après coup, faute de
 * mieux.
 */
async function readBodyLimited(
  request: Request,
  maxBytes: number
): Promise<string | null | typeof TOO_LARGE> {
  const stream = request.body
  if (!stream) {
    const raw = await request.text().catch(() => null)
    if (raw === null) return null
    return TEXT_ENCODER.encode(raw).length > maxBytes ? TOO_LARGE : raw
  }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let raw = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) {
        void reader.cancel().catch(() => {})
        return TOO_LARGE
      }
      raw += decoder.decode(value, { stream: true })
    }
  } catch {
    return null
  }
  return raw + decoder.decode()
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: `Trop de tentatives. Réessayez dans ${retryAfterSec} secondes.`,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    }
  )
}
