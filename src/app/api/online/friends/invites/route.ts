import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildPendingInvitesForUser } from '@/lib/online/room-invites'
import { onlineErrorBody } from '@/lib/online-errors'

/** Invitations de lobby en attente pour l'utilisateur courant. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const invites = await buildPendingInvitesForUser(user.id)
  return NextResponse.json({ invites })
}
