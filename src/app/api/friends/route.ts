import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { listFriends } from '@/lib/friends'
import { apiError, withApiRoute } from '@/lib/api-route'

/** Liste des amis acceptés de l'utilisateur courant. */
export const GET = withApiRoute('friends GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const friends = await listFriends(user.id)
  return NextResponse.json({ friends })
})
