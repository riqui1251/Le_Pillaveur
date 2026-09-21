import { getClientIpFromRequest } from '@/lib/geo-server'
import { ipNetworkKey } from '@/lib/ip-network'

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

/** Adresse du client, ou « unknown » : sans IP lisible, un compteur à part. */
function clientIp(request: Request): string {
  return getClientIpFromRequest(request) ?? 'unknown'
}

export function rateLimitKey(request: Request, scope: string, email?: string): string {
  const ip = clientIp(request)
  const normalizedEmail = email?.trim().toLowerCase()
  return normalizedEmail ? `${scope}:${ip}:${normalizedEmail}` : `${scope}:${ip}`
}

/**
 * Clé par RÉSEAU et non par adresse (ipNetworkKey : IPv4 entière, IPv6
 * ramenée à son /64), pour les quotas qui doivent compter « un foyer, un
 * lieu ». Derrière une box IPv4, tous les téléphones sortent avec la même
 * adresse ; en IPv6, chacun a la sienne dans le même /64 et en change chaque
 * jour — par adresse, une tablée n'était jamais comptée ensemble et un script
 * contournait le compteur en changeant d'adresse. Par /64, les deux familles
 * mesurent la même chose. Forme : « scope:203.0.113.7 » ou
 * « scope:2a01:cb05:0545:a200::/64 ».
 */
export function networkRateLimitKey(request: Request, scope: string): string {
  return `${scope}:${ipNetworkKey(clientIp(request))}`
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

/**
 * 429 commun à toutes les routes. `error` garde sa phrase française : des
 * écrans l'affichent encore telle quelle. `code` et `retryAfterSec` (le même
 * délai que l'en-tête Retry-After) permettent à un client de traduire et de
 * dire au joueur combien de temps attendre, dans sa langue. Le code reste un
 * littéral côté client (JoinGate, TryBotsGate) : ce module lit la base et les
 * en-têtes de requête serveur, il ne s'importe pas dans un composant.
 */
export function rateLimitResponse(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: `Trop de tentatives. Réessayez dans ${retryAfterSec} secondes.`,
      code: 'rate_limited',
      retryAfterSec,
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
