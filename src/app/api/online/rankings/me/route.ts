import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildMyGameStats } from '@/lib/online/rankings'

export const dynamic = 'force-dynamic'

/** Mes stats en ligne par jeu (page compte). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const stats = await buildMyGameStats(prisma, user.id)
  return NextResponse.json({ stats })
}
