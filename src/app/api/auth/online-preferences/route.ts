import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { DEFAULT_ONLINE_ICON, isCosmeticUnlocked, type UnlockContext } from '@/lib/online/cosmetics'
import { loadGrantedKeys } from '@/lib/online/progression-server'
import { sanitizeOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'

/**
 * Personnalisation du joueur en ligne (icône, effet de pseudo, cadre).
 * Les valeurs sont validées contre les catalogues online PUIS contre la
 * progression : un cosmétique non débloqué (niveau/grant/rôle — voir
 * src/lib/online/cosmetics.ts) est ignoré et l'équipement existant conservé
 * (l'icône retombe sur le défaut plutôt que l'équipement précédent, car elle
 * n'a jamais pu être invalide avant équipement — toujours une valeur connue).
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const sanitized = sanitizeOnlinePreferences(body as Partial<OnlinePreferences>)

  const grantedKeys = await loadGrantedKeys(user.id)
  const ctx: UnlockContext = { xp: user.onlineXp, role: user.role, grantedKeys }

  const iconAllowed =
    sanitized.icon === DEFAULT_ONLINE_ICON || isCosmeticUnlocked(ctx, 'icon', sanitized.icon ?? '')
  const effectAllowed =
    sanitized.specialEffect == null ||
    isCosmeticUnlocked(ctx, 'effect', sanitized.specialEffect)
  const frameAllowed =
    sanitized.iconFrame == null || isCosmeticUnlocked(ctx, 'frame', sanitized.iconFrame)

  const next: OnlinePreferences = {
    ...sanitized,
    icon: iconAllowed ? sanitized.icon : (user.onlinePreferences.icon ?? DEFAULT_ONLINE_ICON),
    specialEffect: effectAllowed ? sanitized.specialEffect : user.onlinePreferences.specialEffect ?? null,
    iconFrame: frameAllowed ? sanitized.iconFrame : user.onlinePreferences.iconFrame ?? null,
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { onlinePreferencesJson: JSON.stringify(next) },
  })

  return NextResponse.json({ ok: true, onlinePreferences: next })
}
