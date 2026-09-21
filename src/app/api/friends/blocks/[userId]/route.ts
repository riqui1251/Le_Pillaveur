import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { unblockUser } from '@/lib/moderation/blocks'
import { apiError, withApiRoute } from '@/lib/api-route'

type Params = { params: Promise<{ userId: string }> }

/** Débloque un joueur. Idempotent : débloquer un non-bloqué répond ok. */
export const DELETE = withApiRoute(
  'friends/blocks/[userId] DELETE',
  async (_request: Request, { params }: Params) => {
    const user = await getCurrentUser()
    if (!user) return apiError('auth_required', 401)

    const { userId } = await params
    await unblockUser(user.id, userId)
    return NextResponse.json({ ok: true })
  }
)
