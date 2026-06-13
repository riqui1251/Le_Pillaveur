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
