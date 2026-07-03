import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildIceServers } from '@/lib/rtc/ice'

/**
 * Serveurs ICE pour le client vocal : STUN publics + identifiants TURN
 * éphémères (si le relais coturn est configuré via TURN_HOST / TURN_SECRET).
 * Réservé aux utilisateurs connectés — les identifiants expirent d'eux-mêmes.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  return NextResponse.json(
    buildIceServers({
      turnHost: process.env.TURN_HOST,
      turnSecret: process.env.TURN_SECRET,
    })
  )
}
