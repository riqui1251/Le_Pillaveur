import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { listFriends } from '@/lib/friends'

/** Liste des amis acceptés de l'utilisateur courant. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const friends = await listFriends(user.id)
  return NextResponse.json({ friends })
}
