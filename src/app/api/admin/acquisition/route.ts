import { NextResponse } from 'next/server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getAcquisitionStats } from '@/lib/acquisition-server'
import { DEFAULT_STATS_PERIOD, PERIOD_DAYS, parseStatsPeriod } from '@/lib/supervision/stats-period'
import { FORBIDDEN, requireRole } from '../_guard'

/**
 * Provenance des visites (Supervision › Statistiques › Audience) : arrivées
 * par canal, pages d'arrivée, campagnes utm et hôtes inconnus, sur la période
 * de l'onglet (`?period=d1|d7|d30`, 7 jours par défaut). Compteurs agrégés
 * sans identifiant ; même garde que les visiteurs par pays (admin+).
 */
export const GET = withApiRoute('admin/acquisition GET', async (request: Request) => {
  try {
    await requireRole(canViewSupervisionAnalytics)
  } catch (error) {
    if (error instanceof Error && error.message === FORBIDDEN) return apiError('forbidden', 403)
    throw error
  }

  const raw = new URL(request.url).searchParams.get('period')
  const period = raw === null ? DEFAULT_STATS_PERIOD : parseStatsPeriod(raw)
  if (period === null) return apiError('invalid_action', 400)

  const stats = await getAcquisitionStats(PERIOD_DAYS[period])
  return NextResponse.json({ period, days: PERIOD_DAYS[period], computedAt: new Date().toISOString(), ...stats })
})
