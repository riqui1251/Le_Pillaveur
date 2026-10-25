import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import { buildIceServers } from '@/lib/rtc/ice'
import { isVoiceEnabled } from '@/lib/site-settings'
import { isFeatureBanned } from '@/lib/feature-bans'
import { apiError, withApiRoute } from '@/lib/api-route'
import { checkRateLimit, rateLimitResponse, userRateLimitKey } from '@/lib/rate-limit'

/**
 * Serveurs ICE pour le client vocal : STUN publics + identifiants TURN
 * éphémères (si le relais coturn est configuré via TURN_HOST / TURN_SECRET).
 * Réservé aux membres d'une salle — le vocal n'existe qu'à table — et les
 * identifiants, nominatifs, expirent d'eux-mêmes.
 *
 * Renvoie aussi le droit d'accès au vocal : coupé pour tout le site (réglage
 * super admin) ou pour ce joueur seul (ban vocal modérateur), dans `reason`.
 * Le client n'a alors pas d'identifiants — c'est la 1re barrière ; la route de
 * signalisation revérifie (défense en profondeur).
 */

/**
 * Appels par COMPTE et par minute. useVoiceChat en fait un par entrée dans le
 * vocal ; au-delà, c'est un script qui collectionne des identifiants. Refusé,
 * le client retombe sur STUN seul : le vocal marche encore pour la plupart.
 */
const CREDENTIALS_LIMIT = 10
const CREDENTIALS_WINDOW_MS = 60_000

export const GET = withApiRoute('rtc/credentials GET', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) {
    return apiError('auth_required', 401)
  }

  const rate = checkRateLimit(
    userRateLimitKey('rtc-credentials', user.id),
    CREDENTIALS_LIMIT,
    CREDENTIALS_WINDOW_MS
  )
  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec)
  }

  const [enabled, banned] = await Promise.all([
    isVoiceEnabled(),
    isFeatureBanned(user.id, 'voice'),
  ])
  if (!enabled) {
    return apiError('voice_unavailable', 403, { reason: 'disabled' })
  }
  if (banned) {
    return apiError('voice_unavailable', 403, { reason: 'banned' })
  }

  // `roomId` est vérifié quand le client le donne ; sans lui, il faut au
  // moins être assis à une table.
  const roomId = new URL(request.url).searchParams.get('roomId')
  const member = roomId
    ? await prisma.onlineRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId: user.id } },
        select: { id: true },
      })
    : await prisma.onlineRoomMember.findFirst({
        where: { userId: user.id },
        select: { id: true },
      })
  if (!member) {
    return apiError('not_a_member', 403)
  }

  return NextResponse.json(
    buildIceServers(
      {
        turnHost: process.env.TURN_HOST,
        turnSecret: process.env.TURN_SECRET,
      },
      user.id
    )
  )
})
