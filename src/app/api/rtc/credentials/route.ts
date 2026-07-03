import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildIceServers } from '@/lib/rtc/ice'
import { isVoiceEnabled } from '@/lib/site-settings'
import { isFeatureBanned } from '@/lib/feature-bans'

/**
 * Serveurs ICE pour le client vocal : STUN publics + identifiants TURN
 * éphémères (si le relais coturn est configuré via TURN_HOST / TURN_SECRET).
 * Réservé aux utilisateurs connectés — les identifiants expirent d'eux-mêmes.
 *
 * Renvoie aussi le droit d'accès au vocal : coupé pour tout le site (réglage
 * super admin) ou pour ce joueur seul (ban vocal modérateur). Le client n'a
 * alors pas d'identifiants — c'est la 1re barrière ; la route de signalisation
 * revérifie (défense en profondeur).
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const [enabled, banned] = await Promise.all([
    isVoiceEnabled(),
    isFeatureBanned(user.id, 'voice'),
  ])
  if (!enabled) {
    return NextResponse.json({ error: 'voice-disabled', reason: 'disabled' }, { status: 403 })
  }
  if (banned) {
    return NextResponse.json({ error: 'voice-banned', reason: 'banned' }, { status: 403 })
  }

  return NextResponse.json(
    buildIceServers({
      turnHost: process.env.TURN_HOST,
      turnSecret: process.env.TURN_SECRET,
    })
  )
}
