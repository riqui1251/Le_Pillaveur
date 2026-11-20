import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, withApiRoute } from '@/lib/api-route'

/**
 * Le compte a vu ou passé le tuto des nouveaux joueurs : on le note pour ne
 * pas le lui reproposer sur un autre appareil. Première date gardée — rejouer
 * le tuto depuis le menu ne la déplace pas.
 */
export const POST = withApiRoute('auth/tour-seen POST', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  await prisma.user.updateMany({
    where: { id: user.id, tourSeenAt: null },
    data: { tourSeenAt: new Date() },
  })

  return NextResponse.json({ ok: true })
})
