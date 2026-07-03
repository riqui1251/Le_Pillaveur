import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { canManageSiteSettings } from '@/lib/roles'
import { isVoiceEnabled, setVoiceEnabled } from '@/lib/site-settings'

/**
 * Réglages globaux du site. Lecture : tout membre du staff (supervision).
 * Écriture : super admin uniquement (ex. activer/désactiver le vocal partout).
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  return NextResponse.json({ voiceEnabled: await isVoiceEnabled() })
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user || !canManageSiteSettings(user.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  if (typeof body.voiceEnabled === 'boolean') {
    await setVoiceEnabled(body.voiceEnabled)
  }
  return NextResponse.json({ voiceEnabled: await isVoiceEnabled() })
}
