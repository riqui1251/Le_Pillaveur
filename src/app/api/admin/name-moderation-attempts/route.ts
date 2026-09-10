import { NextResponse } from 'next/server'
import { canManageUsers } from '@/lib/roles'
import {
  listFlaggedNameModerationUsers,
  listNameModerationAttemptsForAdmin,
} from '@/lib/name-moderation-attempts-server'
import { adminErrorResponse, requireRole } from '../_guard'

export async function GET(request: Request) {
  try {
    await requireRole(canManageUsers)

    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')

    const [attempts, flaggedUsers] = await Promise.all([
      listNameModerationAttemptsForAdmin({
        userId: userId ?? undefined,
        limit: 100,
      }),
      listFlaggedNameModerationUsers(30),
    ])

    return NextResponse.json({ attempts, flaggedUsers })
  } catch (error) {
    return adminErrorResponse(error, 'name-moderation-attempts GET')
  }
}
