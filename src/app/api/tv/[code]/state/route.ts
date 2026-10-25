import { createHash, randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { buildTvRoomDto } from '@/lib/online-room'
import { apiError, withApiRoute } from '@/lib/api-route'
import { checkRateLimit, networkRateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { lookupTvCode } from '@/app/api/tv/code-lookup'
import { toTvDisplayPayload } from './tv-payload'

/**
 * État d'une salle pour l'écran TV — PUBLIC, indexé par CODE (le code = jeton
 * d'accès pour un écran non authentifié). L'état de jeu passe par le masquage
 * spectateur neutre : aucun secret (rngState, navires intacts) ne sort, et les
 * identifiants de compte sont remplacés par des alias (voir tv-payload.ts).
 */
export const dynamic = 'force-dynamic'

/**
 * Budget par RÉSEAU (IPv4 entière, IPv6 /64), TOUS CODES CONFONDUS : compter
 * par code laisserait un balayage repartir de zéro à chaque essai, et par
 * adresse exacte un script qui change d'adresse dans son /64 n'était jamais
 * freiné. Les codes inconnus ont en plus leur propre budget, bien plus serré
 * (code-lookup.ts). Une télé légitime tient très en dessous : un sondage par
 * minute quand le flux SSE fonctionne, plus un rafraîchissement par
 * changement de la table (groupés côté client). 240 appels par minute
 * laissent donc de la marge à un bar qui allume plusieurs écrans derrière la
 * même box, même sur une partie très remuante.
 */
const RATE_LIMIT = 240
const RATE_WINDOW_MS = 60_000

/**
 * Sel tiré au démarrage du serveur : les alias ne sont donc reliables ni aux
 * identifiants réels, ni d'un redémarrage à l'autre. Ils restent stables tant
 * que le processus vit, ce qui suffit à une soirée (clés React, corrélations
 * entre l'état de jeu et la liste des joueurs).
 */
const ALIAS_SALT = randomBytes(16).toString('hex')

function tvAlias(code: string, realId: string): string {
  return `p${createHash('sha256').update(`${ALIAS_SALT}:${code}:${realId}`).digest('hex').slice(0, 16)}`
}

type Params = { params: Promise<{ code: string }> }

export const GET = withApiRoute('tv/[code]/state GET', async (request: Request, { params }: Params) => {
  const { code } = await params
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return apiError('room_not_found', 400)
  }

  const limit = checkRateLimit(networkRateLimitKey(request, 'tv-state'), RATE_LIMIT, RATE_WINDOW_MS)
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSec)
  }

  const lookup = await lookupTvCode(request, normalized, () => buildTvRoomDto(normalized))
  if (!lookup.ok) {
    return rateLimitResponse(lookup.retryAfterSec)
  }
  const room = lookup.value
  if (!room) {
    return apiError('room_not_found', 404)
  }

  return NextResponse.json({ room: toTvDisplayPayload(room, (id) => tvAlias(normalized, id)) })
})
