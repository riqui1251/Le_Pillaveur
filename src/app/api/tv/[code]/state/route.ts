import { createHash, randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { buildTvRoomDto } from '@/lib/online-room'
import { checkRateLimit, rateLimitKey, rateLimitResponse } from '@/lib/rate-limit'
import { toTvDisplayPayload } from './tv-payload'

/**
 * État d'une salle pour l'écran TV — PUBLIC, indexé par CODE (le code = jeton
 * d'accès pour un écran non authentifié). L'état de jeu passe par le masquage
 * spectateur neutre : aucun secret (rngState, navires intacts) ne sort, et les
 * identifiants de compte sont remplacés par des alias (voir tv-payload.ts).
 */
export const dynamic = 'force-dynamic'

/**
 * Budget par IP, TOUS CODES CONFONDUS — c'est ce qui compte : compter par
 * code laisserait un balayage de codes à six caractères (jusqu'ici gratuit)
 * repartir de zéro à chaque essai. Une télé légitime tient très en dessous :
 * un sondage par minute quand le flux SSE fonctionne, plus un
 * rafraîchissement par changement de la table (groupés côté client). 240
 * appels par minute laissent donc de la marge à un bar qui allume plusieurs
 * écrans derrière la même IP, même sur une partie très remuante.
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

export async function GET(request: Request, { params }: Params) {
  const { code } = await params
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return NextResponse.json({ error: 'invalid-code' }, { status: 400 })
  }

  const limit = checkRateLimit(rateLimitKey(request, 'tv-state'), RATE_LIMIT, RATE_WINDOW_MS)
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSec)
  }

  const room = await buildTvRoomDto(normalized)
  if (!room) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  return NextResponse.json({ room: toTvDisplayPayload(room, (id) => tvAlias(normalized, id)) })
}
