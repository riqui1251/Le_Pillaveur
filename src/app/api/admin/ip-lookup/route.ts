import { NextResponse } from 'next/server'
import { requireSupervisionUser } from '@/lib/auth-server'
import { lookupByIp } from '@/lib/analytics-server'

export async function GET(request: Request) {
  try {
    await requireSupervisionUser()
    const { searchParams } = new URL(request.url)
    const ip = searchParams.get('ip')?.trim() ?? ''

    if (!ip || ip.length > 45) {
      return NextResponse.json({ error: 'IP invalide' }, { status: 400 })
    }

    const result = await lookupByIp(ip)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin ip-lookup error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
