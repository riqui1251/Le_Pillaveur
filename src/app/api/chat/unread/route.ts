import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { countChatUnread } from '@/lib/chat-unread-server'

/**
 * Compteur de messages non lus par canal — le calcul vit dans
 * chat-unread-server.ts, partagé avec /api/me/nav : le badge de la barre et
 * le panneau de chat doivent dire exactement la même chose.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  return NextResponse.json(await countChatUnread(user.id), { headers: { 'Cache-Control': 'no-store' } })
}
