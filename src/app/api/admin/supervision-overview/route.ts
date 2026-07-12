import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getSupervisionOverview } from '@/lib/supervision-overview-server'

export async function GET() {
  try {
    const actor = await getCurrentUser()
    if (!actor || !canViewSupervisionAnalytics(actor.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const overview = await getSupervisionOverview(actor.role)
    return NextResponse.json(overview)
  } catch (error) {
    console.error('admin supervision-overview error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
