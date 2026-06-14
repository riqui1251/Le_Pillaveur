import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import {
  getPlayerNameValidationError,
  sanitizePlayerName,
  type Player,
} from '@/lib/players'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { getModerationErrorMessage } from '@/lib/name-moderation'
import { resolveRequestLocale } from '@/lib/name-moderation/request-locale'
import { logRejectedNameOnServer } from '@/lib/name-moderation-attempt-log'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { localPlayersJson: true, updatedAt: true },
  })

  let players: Player[] = []
  if (dbUser?.localPlayersJson) {
    try {
      const parsed = JSON.parse(dbUser.localPlayersJson)
      if (Array.isArray(parsed)) players = parsed
    } catch {}
  }

  return NextResponse.json({
    players,
    updatedAt: dbUser?.updatedAt?.toISOString() ?? null,
  })
}

export async function PUT(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  await ensureServerModerationTermsLoaded()
  const requestLocale = await resolveRequestLocale({ userLocale: user.locale })

  const body = await request.json()
  if (!Array.isArray(body.players)) {
    return NextResponse.json({ error: 'Format invalide' }, { status: 400 })
  }

  for (const item of body.players) {
    if (!item || typeof item !== 'object') continue
    const rawName = typeof item.name === 'string' ? item.name : ''
    const reason = getPlayerNameValidationError(rawName)
    if (reason) {
      if (reason === 'profanity') {
        await logRejectedNameOnServer(request, {
          attemptedName: rawName,
          reason,
          context: 'local_player_add',
          userId: user.id,
        })
      }
      return NextResponse.json(
        {
          error: getModerationErrorMessage(reason, requestLocale, 'player'),
          code: reason,
        },
        { status: 400 }
      )
    }
    item.name = sanitizePlayerName(rawName)
  }

  const json = JSON.stringify(body.players)
  if (json.length > 500_000) {
    return NextResponse.json({ error: 'Données trop volumineuses' }, { status: 413 })
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { localPlayersJson: json },
    select: { updatedAt: true },
  })

  return NextResponse.json({
    ok: true,
    updatedAt: updated.updatedAt.toISOString(),
  })
}
