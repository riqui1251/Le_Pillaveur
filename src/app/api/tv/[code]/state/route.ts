import { NextResponse } from 'next/server'
import { buildTvRoomDto } from '@/lib/online-room'

/**
 * État d'une salle pour l'écran TV — PUBLIC, indexé par CODE (le code = jeton
 * d'accès pour un écran non authentifié). L'état de jeu passe par le masquage
 * spectateur neutre : aucun secret (rngState, navires intacts) ne sort.
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ code: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { code } = await params
  const normalized = code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return NextResponse.json({ error: 'invalid-code' }, { status: 400 })
  }

  const room = await buildTvRoomDto(normalized)
  if (!room) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  return NextResponse.json({ room })
}
