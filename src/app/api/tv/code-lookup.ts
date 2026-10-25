import { checkRateLimit, networkRateLimitKey, refundRateLimit } from '@/lib/rate-limit'

/**
 * Budget de codes INCONNUS par réseau, partagé par les routes publiques de
 * l'écran TV (état et flux). Sans lui, ces deux routes formaient un oracle
 * gratuit : 404 = code libre, 200 = table vivante, et le quota de lecture
 * (240/min) laissait balayer les codes à six caractères — puis s'asseoir à
 * une table 'private' avec le code trouvé.
 *
 * Seul un code NOUVEAU use le budget : une télé restée allumée sur une table
 * finie resonde le même code toutes les dix secondes, elle ne doit pas
 * épuiser le budget de toute la maison. Un balayage, lui, essaie un code
 * différent à chaque fois.
 *
 * Budget épuisé : TOUTE recherche est refusée (429), y compris celle d'un code
 * valide — sinon le 429 deviendrait lui-même la réponse « libre ».
 */
export const TV_CODE_MISS_LIMIT = 30
export const TV_CODE_MISS_WINDOW_MS = 10 * 60_000

export type TvCodeLookup<T> = { ok: true; value: T | null } | { ok: false; retryAfterSec: number }

export async function lookupTvCode<T>(
  request: Request,
  code: string,
  find: () => Promise<T | null>
): Promise<TvCodeLookup<T>> {
  const key = networkRateLimitKey(request, 'tv-code-miss')
  // L'unité est prise AVANT la lecture, comme pour la connexion : des essais
  // simultanés ne passent pas tous sous la limite. Elle est rendue ensuite si
  // le code existe ou s'il a déjà été raté dans la fenêtre.
  const budget = checkRateLimit(key, TV_CODE_MISS_LIMIT, TV_CODE_MISS_WINDOW_MS)
  if (!budget.ok) return budget

  let value: T | null
  try {
    value = await find()
  } catch (error) {
    refundRateLimit(key)
    throw error
  }

  if (value !== null) {
    refundRateLimit(key)
  } else if (!checkRateLimit(`${key}:${code}`, 1, TV_CODE_MISS_WINDOW_MS).ok) {
    refundRateLimit(key)
  }
  return { ok: true, value }
}
