import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { isCosmeticUnlocked, type UnlockContext } from '@/lib/online/cosmetics'
import { loadGrantedKeys } from '@/lib/online/progression-server'
import { sanitizeOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'

/**
 * Personnalisation du joueur en ligne (icône, effet de pseudo, cadre).
 * Les valeurs sont validées contre les sets autorisés PUIS contre la
 * progression : un cosmétique non débloqué (niveau/grant/rôle — voir
 * src/lib/online/cosmetics.ts) est ignoré et l'équipement existant conservé.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const sanitized = sanitizeOnlinePreferences(body as Partial<OnlinePreferences>, {
    allowFrame: true,
  })

  const grantedKeys = await loadGrantedKeys(user.id)
  const ctx: UnlockContext = { xp: user.onlineXp, role: user.role, grantedKeys }

  const effectAllowed =
    sanitized.specialEffect == null ||
    isCosmeticUnlocked(ctx, 'effect', sanitized.specialEffect)
  const frameAllowed =
    sanitized.iconFrame == null || isCosmeticUnlocked(ctx, 'frame', sanitized.iconFrame)

  const next: OnlinePreferences = {
    ...sanitized,
    specialEffect: effectAllowed ? sanitized.specialEffect : user.onlinePreferences.specialEffect ?? null,
    iconFrame: frameAllowed ? sanitized.iconFrame : user.onlinePreferences.iconFrame ?? null,
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { onlinePreferencesJson: JSON.stringify(next) },
  })

  return NextResponse.json({ ok: true, onlinePreferences: next })
}
