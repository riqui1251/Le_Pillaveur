import { NextResponse } from 'next/server'
import { requireSupervisionUser } from '@/lib/auth-server'
import { canManageUsers } from '@/lib/roles'
import {
  listFlaggedNameModerationUsers,
  listNameModerationAttemptsForAdmin,
} from '@/lib/name-moderation-attempts-server'

export async function GET(request: Request) {
  try {
    const actor = await requireSupervisionUser()
    if (!canManageUsers(actor.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    const [attempts, flaggedUsers] = await Promise.all([
      listNameModerationAttemptsForAdmin({
        userId: userId ?? undefined,
        limit: 100,
      }),
      listFlaggedNameModerationUsers(30),
    ])

    return NextResponse.json({ attempts, flaggedUsers })
  } catch (error) {
    console.error('admin name-moderation-attempts GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
