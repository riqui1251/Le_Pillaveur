import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildPendingInvitesForUser } from '@/lib/online/room-invites'

/** Invitations de lobby en attente pour l'utilisateur courant. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const invites = await buildPendingInvitesForUser(user.id)
  return NextResponse.json({ invites })
}
