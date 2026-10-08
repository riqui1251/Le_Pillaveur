import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import {
  countAddableTablemates,
  lookupTablemates,
  sendTableFriendRequests,
  type TablemateLookup,
} from '@/lib/friends'
import { checkRateLimit, userRateLimitKey } from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

/**
 * « AJOUTER LA TABLÉE EN AMIS » — carte « On remet ça ? » de l'écran de fin
 * en ligne (src/components/online/RematchNightCard.tsx).
 *
 * Le client ne fournit QUE l'identifiant de la salle : la liste des
 * destinataires est relue en base (membres réels de la salle, dont le
 * demandeur doit faire partie). Une liste d'identifiants venue du client
 * aurait fait de cette route un envoi de demandes en masse vers n'importe qui.
 *
 * - GET  ?roomId=… : combien de membres le bouton toucherait (0 : la carte
 *   ne propose pas le geste à une bande déjà toute amie) ;
 * - POST { roomId } : une demande à chacun, avec la logique du geste
 *   unitaire (src/lib/friends.ts) — auto-acceptation de la demande croisée,
 *   délai après un refus, ni banni ni bloqué.
 *
 * Ni l'une ni l'autre ne dit QUI a été écarté ni pourquoi : le compte des
 * écartés (ban, blocage, refus récent) ne sort jamais, il révélerait qui a
 * bloqué ou refusé qui. Invités admis, comme pour les demandes unitaires.
 */

/**
 * Quotas par COMPTE. L'envoi groupé fait jusqu'à trois écritures par membre
 * de la table : 5 par minute laissent largement passer le geste (un par fin
 * de partie) et coupent un script. La lecture, faite une fois par écran de
 * fin, en a 30.
 */
const TABLE_SEND_LIMIT = 5
const TABLE_READ_LIMIT = 30
const WINDOW_MS = 60_000

/** Identifiant de salle (cuid) : on refuse le reste avant toute lecture. */
const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function lookupRefusal(lookup: Exclude<TablemateLookup, { kind: 'ok' }>): NextResponse {
  return lookup.kind === 'room_not_found'
    ? apiError('room_not_found', 404)
    : apiError('not_a_member', 403)
}

export const GET = withApiRoute('friends/table GET', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const rate = checkRateLimit(userRateLimitKey('friend-table-read', user.id), TABLE_READ_LIMIT, WINDOW_MS)
  if (!rate.ok) return apiError('rate_limited', 429, { retryAfterSec: rate.retryAfterSec })

  const roomId = new URL(request.url).searchParams.get('roomId')?.trim() ?? ''
  if (!ROOM_ID_RE.test(roomId)) return apiError('code_required', 400)

  const lookup = await lookupTablemates(roomId, user.id)
  if (lookup.kind !== 'ok') return lookupRefusal(lookup)
  return NextResponse.json({ addable: await countAddableTablemates(user.id, lookup.tablemates) })
})

export const POST = withApiRoute('friends/table POST', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  // Avant la lecture du corps : un refus de quota ne coûte rien de plus.
  const rate = checkRateLimit(userRateLimitKey('friend-table', user.id), TABLE_SEND_LIMIT, WINDOW_MS)
  if (!rate.ok) return apiError('rate_limited', 429, { retryAfterSec: rate.retryAfterSec })

  const parsed = await readApiJson<{ roomId?: unknown }>(request)
  if (!parsed.ok) return parsed.response
  const roomId = typeof parsed.body.roomId === 'string' ? parsed.body.roomId.trim() : ''
  if (!ROOM_ID_RE.test(roomId)) return apiError('code_required', 400)

  const lookup = await lookupTablemates(roomId, user.id)
  if (lookup.kind !== 'ok') return lookupRefusal(lookup)

  const tally = await sendTableFriendRequests(user.id, lookup.tablemates)
  // Ni `skipped` ni `already` ne sortent, volontairement : rapprochés de
  // l'effectif de la table, ils donneraient le nombre d'écartés (voir
  // l'en-tête). La carte n'a besoin que de ce qui vient de se passer.
  return NextResponse.json({ requested: tally.requested, accepted: tally.accepted })
})
