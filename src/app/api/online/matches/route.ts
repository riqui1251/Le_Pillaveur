import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { listRecentTables } from '@/lib/online/match-history'

export const dynamic = 'force-dynamic'

/**
 * Mes dernières tables (fiche compte) : les dernières parties en ligne
 * classées du joueur connecté, avec leurs partenaires humains et le flag
 * « ami » qui décide de l'invitation à la revanche. Voir
 * src/lib/online/match-history.ts pour le regroupement par partie.
 */
export const GET = withApiRoute('online/matches GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const tables = await listRecentTables(user.id)
  return NextResponse.json({ tables }, { headers: { 'Cache-Control': 'no-store' } })
})
