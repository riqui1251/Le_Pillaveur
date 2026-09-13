import { NextResponse } from 'next/server'
import { canAccessSupervision, canViewSupervisionAnalytics } from '@/lib/roles'
import { lookupByIp, type IpLookupMode } from '@/lib/analytics-server'
import { adminErrorResponse, requireRole } from '../_guard'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    // `mode=network` (même réseau : foyer ou lieu, jamais « même personne »)
    // est réservé aux admins, comme l'onglet Pays/IP. Toute autre valeur, ou
    // aucune, garde la recherche exacte et ses droits (modérateur et plus).
    const mode: IpLookupMode = searchParams.get('mode') === 'network' ? 'network' : 'exact'
    const actor = await requireRole(mode === 'network' ? canViewSupervisionAnalytics : canAccessSupervision)
    const ip = searchParams.get('ip')?.trim() ?? ''

    if (!ip || ip.length > 45) {
      return NextResponse.json({ error: 'IP invalide' }, { status: 400 })
    }

    // Détail des navigateurs (pays, dates, compte connecté) : réservé aux
    // admins, comme les cartes visiteurs. Un modérateur n'en reçoit que le
    // nombre, seul affiché par le bandeau.
    const result = await lookupByIp(ip, mode, {
      visitorDetails: canViewSupervisionAnalytics(actor.role),
    })
    return NextResponse.json(result)
  } catch (error) {
    return adminErrorResponse(error, 'ip-lookup GET')
  }
}
