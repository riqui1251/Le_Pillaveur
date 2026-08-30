import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { buildLobbyList } from '@/lib/online-room'
import { onlineErrorBody } from '@/lib/online-errors'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const lobbies = await buildLobbyList()
  return NextResponse.json({ lobbies })
}
