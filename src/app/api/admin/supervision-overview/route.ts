import { NextResponse } from 'next/server'
import { canViewSupervisionAnalytics } from '@/lib/roles'
import { getSupervisionOverview } from '@/lib/supervision-overview-server'
import { adminErrorResponse, requireRole } from '../_guard'

export async function GET() {
  try {
    const actor = await requireRole(canViewSupervisionAnalytics)
    const overview = await getSupervisionOverview(actor.role)
    return NextResponse.json(overview)
  } catch (error) {
    return adminErrorResponse(error, 'supervision-overview GET')
  }
}
