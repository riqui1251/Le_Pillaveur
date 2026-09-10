import { NextResponse } from 'next/server'
import { canManageSiteSettings } from '@/lib/roles'
import { isVoiceEnabled, setVoiceEnabled } from '@/lib/site-settings'
import { logStaffAction } from '@/lib/supervision-overview-server'
import { adminErrorResponse, requireRole, requireSignedIn } from '../_guard'

/**
 * Réglages globaux du site. Lecture : tout compte connecté (le réglage
 * conditionne l'affichage du vocal côté joueur). Écriture : super admin
 * uniquement (ex. activer/désactiver le vocal partout).
 */
export async function GET() {
  try {
    await requireSignedIn()
    return NextResponse.json({ voiceEnabled: await isVoiceEnabled() })
  } catch (error) {
    return adminErrorResponse(error, 'site-settings GET')
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireRole(canManageSiteSettings)
    const body = await request.json().catch(() => ({}))

    if (typeof body.voiceEnabled === 'boolean') {
      const previous = await isVoiceEnabled()
      await setVoiceEnabled(body.voiceEnabled)
      // F42 : couper le vocal du site entier ne laissait aucune trace.
      if (previous !== body.voiceEnabled) {
        await logStaffAction({
          actorId: actor.id,
          action: 'site-setting',
          detail: `Vocal ${body.voiceEnabled ? 'activé' : 'désactivé'} sur tout le site`,
        })
      }
    }

    return NextResponse.json({ voiceEnabled: await isVoiceEnabled() })
  } catch (error) {
    return adminErrorResponse(error, 'site-settings PATCH')
  }
}
