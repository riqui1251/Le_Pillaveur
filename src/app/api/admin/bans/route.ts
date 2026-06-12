import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { getActiveBans } from '@/lib/ban-server'
import { canViewSupervisionBans } from '@/lib/roles'

export async function GET() {
  try {
    const actor = await getCurrentUser()
    if (!actor || !canViewSupervisionBans(actor.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    const bans = await getActiveBans()
    return NextResponse.json({ bans })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin bans GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
