import { prisma } from '@/lib/prisma'

/**
 * Réglages globaux du site (table SiteSetting clé/valeur). Pour l'instant :
 * le vocal peut être coupé pour TOUT le site par un super admin.
 */

const VOICE_ENABLED_KEY = 'voiceEnabled'

/** Le vocal est activé par défaut ; seul un « 0» explicite le désactive. */
export async function isVoiceEnabled(): Promise<boolean> {
  const row = await prisma.siteSetting.findUnique({ where: { key: VOICE_ENABLED_KEY } })
  return row?.value !== '0'
}

export async function setVoiceEnabled(enabled: boolean): Promise<void> {
  const value = enabled ? '1' : '0'
  await prisma.siteSetting.upsert({
    where: { key: VOICE_ENABLED_KEY },
    create: { key: VOICE_ENABLED_KEY, value },
    update: { value },
  })
}
