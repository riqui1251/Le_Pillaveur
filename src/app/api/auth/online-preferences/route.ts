import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { canCustomizePlayerFrame } from '@/lib/roles'
import { sanitizeOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'

/**
 * Personnalisation du joueur en ligne (icône, effet de pseudo, cadre staff) —
 * même vocabulaire que les joueurs locaux, mais lié au compte. Les valeurs
 * sont validées côté serveur contre les sets autorisés ; le cadre reste
 * réservé au staff (comme en local, mais appliqué serveur).
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const allowFrame = canCustomizePlayerFrame(user.role)

  const sanitized = sanitizeOnlinePreferences(body as Partial<OnlinePreferences>, { allowFrame })
  // Un non-staff conserve son cadre existant (il ne peut ni le poser ni le retirer).
  const next: OnlinePreferences = allowFrame
    ? sanitized
    : { ...sanitized, iconFrame: user.onlinePreferences.iconFrame ?? null }

  await prisma.user.update({
    where: { id: user.id },
    data: { onlinePreferencesJson: JSON.stringify(next) },
  })

  return NextResponse.json({ ok: true, onlinePreferences: next })
}
