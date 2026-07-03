import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { publishRtcSignal, type RtcSignal } from '@/lib/online/room-bus'

type Params = { params: Promise<{ roomId: string }> }

const SIGNAL_KINDS = new Set<RtcSignal['kind']>(['hello', 'offer', 'answer', 'ice', 'bye'])
/** Un SDP audio fait ~5-10 Ko ; au-delà de 32 Ko c'est suspect. */
const MAX_PAYLOAD_BYTES = 32_000

/**
 * Relai de signalisation WebRTC pour le VOCAL de salle : transmet un message
 * (offer/answer/ice/hello/bye) à UN autre membre de la même salle via son flux
 * SSE. Le serveur ne stocke rien et ne voit jamais l'audio — il ne fait que
 * mettre les pairs en relation.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { roomId } = await params
  const body = await request.json().catch(() => null)
  const to = typeof body?.to === 'string' ? body.to : ''
  const kind = body?.kind as RtcSignal['kind']

  if (!to || !SIGNAL_KINDS.has(kind)) {
    return NextResponse.json({ error: 'Signal invalide' }, { status: 400 })
  }
  if (to === user.id) {
    return NextResponse.json({ error: 'Signal invalide' }, { status: 400 })
  }
  if (JSON.stringify(body?.payload ?? null).length > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: 'Signal trop volumineux' }, { status: 413 })
  }

  // Expéditeur ET destinataire doivent être membres de la salle.
  const members = await prisma.onlineRoomMember.findMany({
    where: { roomId, userId: { in: [user.id, to] } },
    select: { userId: true },
  })
  const memberIds = new Set(members.map((m) => m.userId))
  if (!memberIds.has(user.id)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  if (!memberIds.has(to)) {
    return NextResponse.json({ error: 'Destinataire hors salle' }, { status: 404 })
  }

  publishRtcSignal(roomId, to, {
    from: user.id,
    kind,
    payload: body?.payload ?? null,
    at: Date.now(),
  })

  return NextResponse.json({ ok: true })
}
