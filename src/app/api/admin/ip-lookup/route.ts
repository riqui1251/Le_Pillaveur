import { NextResponse } from 'next/server'
import { canAccessSupervision } from '@/lib/roles'
import { lookupByIp } from '@/lib/analytics-server'
import { adminErrorResponse, requireRole } from '../_guard'

export async function GET(request: Request) {
  try {
    await requireRole(canAccessSupervision)
    const { searchParams } = new URL(request.url)
    const ip = searchParams.get('ip')?.trim() ?? ''

    if (!ip || ip.length > 45) {
      return NextResponse.json({ error: 'IP invalide' }, { status: 400 })
    }

    const result = await lookupByIp(ip)
    return NextResponse.json(result)
  } catch (error) {
    return adminErrorResponse(error, 'ip-lookup GET')
  }
}
