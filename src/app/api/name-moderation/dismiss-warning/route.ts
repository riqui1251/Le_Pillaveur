import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { dismissNameModerationWarning } from '@/lib/name-moderation-attempts-server'

/** L'utilisateur ferme le bandeau d'avertissement de modération de pseudo. */
export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  await dismissNameModerationWarning(user.id)
  return NextResponse.json({ ok: true })
}
