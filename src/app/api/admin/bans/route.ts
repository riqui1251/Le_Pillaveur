import { NextResponse } from 'next/server'
import { getActiveBans } from '@/lib/ban-server'
import { canViewSupervisionBans } from '@/lib/roles'
import { adminErrorResponse, requireRole } from '../_guard'

export async function GET() {
  try {
    await requireRole(canViewSupervisionBans)
    const bans = await getActiveBans()
    return NextResponse.json({ bans })
  } catch (error) {
    return adminErrorResponse(error, 'bans GET')
  }
}
