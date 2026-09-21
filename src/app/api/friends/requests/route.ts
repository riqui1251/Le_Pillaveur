import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { isUserCurrentlyBanned } from '@/lib/ban-server'
import { formatAccountCode } from '@/lib/account-code'
import { listPendingRequests, sendFriendRequest } from '@/lib/friends'
import { isBlockedBetween } from '@/lib/moderation/blocks'
import { checkRateLimit, userRateLimitKey } from '@/lib/rate-limit'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

/**
 * Quota d'envoi de demandes d'ami, par COMPTE et par minute.
 *
 * Pourquoi cette route et pas une autre : elle fait 2 à 4 LECTURES plus une
 * écriture par appel, elle est ouverte à n'importe quel compte invité, et elle
 * distingue « code inconnu » (404 account_code_not_found) d'un code valide —
 * de quoi balayer l'espace des codes de compte à la volée. Avec
 * connection_limit=1 (src/lib/prisma.ts), une route d'écriture sans plafond ne
 * fait d'ailleurs plus seulement échouer son appelant : elle met TOUTE la
 * soirée en file derrière l'unique connexion.
 *
 * 20 par minute : personne n'ajoute vingt amis à la main en une minute, et le
 * geste normal (coller un code, cliquer) en consomme un.
 */
const FRIEND_REQUEST_LIMIT = 20
const FRIEND_REQUEST_WINDOW_MS = 60_000

/** Demandes d'amis reçues et envoyées, en attente. */
export const GET = withApiRoute('friends/requests GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const requests = await listPendingRequests(user.id)
  return NextResponse.json(requests)
})

/**
 * Envoie une demande d'ami — soit à partir d'un code de compte (LP-XXXXXX),
 * soit directement par userId (ex. depuis la liste des joueurs d'un lobby,
 * où l'identité du joueur est déjà connue sans avoir besoin de son code).
 */
export const POST = withApiRoute('friends/requests POST', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  // Avant la lecture du corps : un refus de quota ne doit rien coûter de plus.
  // `apiError` et non `rateLimitResponse` : le panneau amis lit `data.error`
  // (useFriends), où rateLimitResponse met une PHRASE française — l'écran la
  // recopierait telle quelle à un joueur EN/ES/IT. Ici `error` porte le code
  // « rate_limited », que le panneau traduit déjà.
  const rate = checkRateLimit(
    userRateLimitKey('friend-request', user.id),
    FRIEND_REQUEST_LIMIT,
    FRIEND_REQUEST_WINDOW_MS
  )
  if (!rate.ok) return apiError('rate_limited', 429, { retryAfterSec: rate.retryAfterSec })

  const parsed = await readApiJson<{ userId?: unknown; accountCode?: unknown }>(request)
  if (!parsed.ok) return parsed.response
  const body = parsed.body
  const directUserId = typeof body.userId === 'string' ? body.userId.trim() : ''

  let target
  if (directUserId) {
    target = await prisma.user.findUnique({ where: { id: directUserId } })
    if (!target) return apiError('user_not_found', 404)
  } else {
    const raw = typeof body.accountCode === 'string' ? body.accountCode : ''
    const accountCode = formatAccountCode(raw)
    if (!accountCode) return apiError('invalid_account_code', 400)
    target = await prisma.user.findUnique({ where: { accountCode } })
    if (!target) return apiError('account_code_not_found', 404)
  }

  if (target.id === user.id) return apiError('self_request', 400)
  if (await isUserCurrentlyBanned(target.id)) return apiError('cannot_add_player', 403)
  // Blocage : plus aucune demande ne passe, dans un sens comme dans l'autre.
  // MÊME code que le ban, à dessein : un refus distinct révélerait qui a
  // bloqué qui.
  if (await isBlockedBetween(user.id, target.id)) return apiError('cannot_add_player', 403)

  const result = await sendFriendRequest(user.id, target.id)
  // `status` reste dans le corps : le panneau amis le lit pour distinguer le
  // délai de latence après un refus des autres motifs.
  if (result.status === 'declined-cooldown') {
    return apiError('friend_request_cooldown', 429, { status: result.status })
  }
  return NextResponse.json({ status: result.status, friendship: result.friendship })
})
