import { NextResponse } from 'next/server'
import { requireSupervisionUser } from '@/lib/auth-server'
import { getVisitorsByCountry } from '@/lib/ip-history-server'

export async function GET(request: Request) {
  try {
    await requireSupervisionUser()
    const { searchParams } = new URL(request.url)
    const countryParam = searchParams.get('country')
    const scope = searchParams.get('scope') === 'today' ? 'today' : 'online'

    const country =
      countryParam === null || countryParam === '' || countryParam === 'unknown'
        ? '??'
        : countryParam

    const visitors = await getVisitorsByCountry(
      country === '??' ? null : country,
      scope
    )

    return NextResponse.json({ country, scope, visitors })
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }
    console.error('admin visitors-by-country error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
