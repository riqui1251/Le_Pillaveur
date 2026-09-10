import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { unblockUser } from '@/lib/moderation/blocks'

type Params = { params: Promise<{ userId: string }> }

/** Débloque un joueur. Idempotent : débloquer un non-bloqué répond ok. */
export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { userId } = await params
  await unblockUser(user.id, userId)
  return NextResponse.json({ ok: true })
}
