import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { getNameModerationStatusForUser } from '@/lib/name-moderation-attempts-server'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
    }

    const status = await getNameModerationStatusForUser(user.id)
    return NextResponse.json(status)
  } catch (error) {
    console.error('name-moderation status GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
