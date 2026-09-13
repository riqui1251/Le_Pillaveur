import { NextResponse } from 'next/server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getVisitorsByCountry } from '@/lib/ip-history-server'
import { adminErrorResponse, requireRole } from '../_guard'

export async function GET(request: Request) {
  try {
    // Cartes visiteurs (IP des navigateurs, dernier compte vu) : réservées aux
    // admins, comme l'onglet Pays/IP et /api/admin/stats qui servent la liste.
    await requireRole(canViewSupervisionAnalytics)
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
    return adminErrorResponse(error, 'visitors-by-country GET')
  }
}
