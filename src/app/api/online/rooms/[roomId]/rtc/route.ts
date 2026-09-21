import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { publishRtcSignal, type RtcSignal } from '@/lib/online/room-bus'
import { isVoiceEnabled } from '@/lib/site-settings'
import { isFeatureBanned } from '@/lib/feature-bans'
import { onlineErrorBody } from '@/lib/online-errors'
import {
  checkRateLimit,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

type Params = { params: Promise<{ roomId: string }> }

const SIGNAL_KINDS = new Set<RtcSignal['kind']>(['hello', 'offer', 'answer', 'ice', 'bye'])
/** Un SDP audio fait ~5-10 Ko ; au-delà de 32 Ko c'est suspect. */
const MAX_PAYLOAD_BYTES = 32_000

/**
 * Corps complet (enveloppe + payload) lu sous plafond AVANT le parse : le
 * contrôle des 32 Ko ci-dessus arrive après `JSON.stringify`, donc après avoir
 * matérialisé en mémoire ce qu'on voulait refuser. 64 Ko laisse la place à
 * l'enveloppe autour d'un SDP au plafond.
 */
const MAX_RTC_BODY_BYTES = 64 * 1024

/**
 * Plafond de signalisation, par COMPTE et par minute.
 *
 * La rafale d'ouverture du vocal est MULTIPLIÉE par le nombre de pairs, et le
 * compte se fait vite : pour chaque pair, useVoiceChat envoie un `hello`, sa
 * réponse, un `offer` ou un `answer`, puis UN message par candidat ICE. Or
 * src/lib/rtc/ice.ts déclare TURN en udp ET en tcp à côté des deux STUN :
 * chaque connexion produit host (IPv4 + IPv6), srflx, relay udp et relay tcp,
 * soit une dizaine de candidats. Sur une table à 8 : 7 pairs × (3 + ~12)
 * ≈ 105 messages, tous dans la même fenêtre d'une minute — 120 était atteint
 * dès qu'une tablée complète activait le vocal en même temps, et un 429 ici se
 * traduit par un joueur qui n'entend personne (useVoiceChat se contente de
 * signaler la perte, il ne rouvre pas).
 *
 * 300 laisse le triple de marge à la plus grosse tablée, renégociations
 * comprises, tout en arrêtant le relais d'un client qui boucle — chaque
 * message part dans l'EventSource d'un pair, sans écriture en base pour
 * l'amortir. Jamais par IP : une tablée partage le Wi-Fi du salon, et un
 * opérateur mobile met des centaines d'abonnés derrière une même IPv4.
 */
const RTC_LIMIT = 300
const RTC_WINDOW_MS = 60_000

/**
 * Relai de signalisation WebRTC pour le VOCAL de salle : transmet un message
 * (offer/answer/ice/hello/bye) à UN autre membre de la même salle via son flux
 * SSE. Le serveur ne stocke rien et ne voit jamais l'audio — il ne fait que
 * mettre les pairs en relation.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const rate = checkRateLimit(userRateLimitKey('room-rtc', user.id), RTC_LIMIT, RTC_WINDOW_MS)
  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec)
  }

  const { roomId } = await params
  const parsed = await readJsonBodyLimited<Record<string, unknown> | null>(
    request,
    MAX_RTC_BODY_BYTES
  )
  if (!parsed.ok) {
    // Le vocabulaire du vocal a déjà son code traduit pour ce refus.
    return parsed.reason === 'too_large'
      ? NextResponse.json(onlineErrorBody('signal_too_large'), { status: 413 })
      : NextResponse.json(onlineErrorBody('invalid_signal'), { status: 400 })
  }
  const body = parsed.body

  const to = typeof body?.to === 'string' ? body.to : ''
  const kind = body?.kind as RtcSignal['kind']

  if (!to || !SIGNAL_KINDS.has(kind)) {
    return NextResponse.json(onlineErrorBody('invalid_signal'), { status: 400 })
  }
  if (to === user.id) {
    return NextResponse.json(onlineErrorBody('invalid_signal'), { status: 400 })
  }

  // Défense en profondeur : même si un client contourne l'absence
  // d'identifiants ICE, il ne peut pas signaler si le vocal est coupé
  // (site entier) ou s'il en est banni.
  const [enabled, banned] = await Promise.all([
    isVoiceEnabled(),
    isFeatureBanned(user.id, 'voice'),
  ])
  if (!enabled || banned) {
    return NextResponse.json(onlineErrorBody('voice_unavailable'), { status: 403 })
  }
  if (JSON.stringify(body?.payload ?? null).length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(onlineErrorBody('signal_too_large'), { status: 413 })
  }

  // Expéditeur ET destinataire doivent être membres de la salle.
  const members = await prisma.onlineRoomMember.findMany({
    where: { roomId, userId: { in: [user.id, to] } },
    select: { userId: true },
  })
  const memberIds = new Set(members.map((m) => m.userId))
  if (!memberIds.has(user.id)) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }
  if (!memberIds.has(to)) {
    return NextResponse.json(onlineErrorBody('recipient_not_in_room'), { status: 404 })
  }

  publishRtcSignal(roomId, to, {
    from: user.id,
    kind,
    payload: body?.payload ?? null,
    at: Date.now(),
  })

  return NextResponse.json({ ok: true })
}
