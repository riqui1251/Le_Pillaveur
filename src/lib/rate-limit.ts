import { createHash } from 'crypto'
import { getClientIpFromRequest } from '@/lib/geo-server'
import { ipNetworkKey } from '@/lib/ip-network'

type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

/**
 * Plafond d'entrées du compteur. Chaque clé neuve (une IP, un e-mail) en crée
 * une, purgée seulement à la fin de sa fenêtre (jusqu'à une heure) : un script
 * qui varie la clé à chaque requête faisait gonfler la mémoire du conteneur
 * sans limite. Au-delà, les entrées les plus anciennes sont évincées.
 */
export const RATE_LIMIT_MAX_ENTRIES = 50_000

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
    // Supprimée puis reposée : la clé passe en fin d'ordre d'insertion, celui
    // que suit l'éviction.
    store.delete(key)
    store.set(key, { count: 1, resetAt: now + windowMs })
    evictOldestEntries()
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

function evictOldestEntries(): void {
  if (store.size <= RATE_LIMIT_MAX_ENTRIES) return
  for (const key of store.keys()) {
    store.delete(key)
    if (store.size <= RATE_LIMIT_MAX_ENTRIES) return
  }
}

/**
 * Rend l'unité qu'un checkRateLimit accepté vient de prendre. Pour un quota
 * qui ne compte que les ÉCHECS (connexion) : la tentative est comptée AVANT le
 * calcul — deux essais simultanés ne passent pas tous deux sous la limite —
 * puis rendue si elle réussit.
 */
export function refundRateLimit(key: string): void {
  const entry = store.get(key)
  if (entry && entry.count > 0 && entry.resetAt > Date.now()) entry.count -= 1
}

export type RateLimitRule = { key: string; limit: number; windowMs: number }

/**
 * Plusieurs quotas pour une même requête (adresse, réseau, compte) : refus au
 * premier compteur plein, et les unités déjà prises par les précédents sont
 * rendues — une requête refusée n'use pas les autres compteurs.
 */
export function checkRateLimits(
  rules: RateLimitRule[]
): { ok: true } | { ok: false; retryAfterSec: number } {
  const taken: string[] = []
  for (const rule of rules) {
    const result = checkRateLimit(rule.key, rule.limit, rule.windowMs)
    if (!result.ok) {
      for (const key of taken) refundRateLimit(key)
      return result
    }
    taken.push(rule.key)
  }
  return { ok: true }
}

/**
 * Empreinte courte (SHA-256 tronqué à 128 bits) d'un identifiant mis dans une
 * clé : jamais l'adresse en clair dans la mémoire du limiteur, et une taille
 * fixe quelle que soit la saisie (un « e-mail » de 8 Ko restait tel quel).
 */
function keyDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

/** Adresse du client, ou « unknown » : sans IP lisible, un compteur à part. */
function clientIp(request: Request): string {
  return getClientIpFromRequest(request) ?? 'unknown'
}

export function rateLimitKey(request: Request, scope: string, email?: string): string {
  const ip = clientIp(request)
  const normalizedEmail = email?.trim().toLowerCase()
  return normalizedEmail ? `${scope}:${ip}:${keyDigest(normalizedEmail)}` : `${scope}:${ip}`
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

/**
 * Clé par ADRESSE e-mail, quelle que soit l'IP, pour les routes sans session
 * (connexion, mot de passe oublié) : changer d'adresse IP à chaque essai ne
 * remet pas le compteur d'un compte à zéro. Valable pour une adresse inconnue
 * comme pour un compte existant — un refus réservé aux comptes existants dirait
 * lesquels existent.
 */
export function emailRateLimitKey(scope: string, email: string): string {
  return `${scope}:email:${keyDigest(email.trim().toLowerCase())}`
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

/**
 * Lecture TEXTE bornée, mêmes garde-fous que readJsonBodyLimited : pour les
 * formulaires HTML (application/x-www-form-urlencoded) et les POST « One-Click »
 * des messageries (RFC 8058), qui n'envoient pas de JSON.
 */
export async function readTextBodyLimited(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false; reason: 'too_large' | 'unreadable' }> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: 'too_large' }
  }
  const raw = await readBodyLimited(request, maxBytes)
  if (raw === TOO_LARGE) return { ok: false, reason: 'too_large' }
  if (raw === null) return { ok: false, reason: 'unreadable' }
  return { ok: true, text: raw }
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
