import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildProgression } from '@/lib/online/progression-server'

/** Progression du compte connecté : XP, niveau, cosmétiques débloqués. */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const progression = await buildProgression(user)
  return NextResponse.json({ progression })
}
