import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import { checkRateLimit, userRateLimitKey } from '@/lib/rate-limit'
import {
  getPlayerNameValidationError,
  isValidPlayerId,
  sanitizePlayer,
  sanitizePlayers,
  type Player,
} from '@/lib/players'
import { ensureServerModerationTermsLoaded } from '@/lib/name-moderation/extra-terms-server'
import { getModerationErrorMessage } from '@/lib/name-moderation'
import { resolveRequestLocale } from '@/lib/name-moderation/request-locale'
import { logRejectedNameOnServer } from '@/lib/name-moderation-attempt-log'

/** La liste entière d'un compte : quelques Ko d'ordinaire. Refusé au-delà, avant tout parse. */
const LOCAL_PLAYERS_BODY_MAX_BYTES = 512 * 1024
const LOCAL_PLAYERS_STORED_MAX_CHARS = 500_000

/**
 * Le Petit Buveur pousse la liste à chaque joueur qui boit, une fin de partie
 * une fois par joueur : 60 par minute laissent passer une tablée pressée et
 * bornent un script (écritures en base, journal de modération).
 */
const LOCAL_PLAYERS_PUT_LIMIT = 60
const LOCAL_PLAYERS_PUT_WINDOW_MS = 60_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Forme minimale d'un joueur : sans elle, la liste est refusée plutôt que réparée. */
function hasPlayerShape(item: unknown): item is Record<string, unknown> {
  return (
    isRecord(item) &&
    isValidPlayerId(item.id) &&
    typeof item.createdAt === 'number' &&
    Number.isFinite(item.createdAt) &&
    isRecord(item.stats) &&
    isRecord(item.preferences)
  )
}

export const GET = withApiRoute('players/local GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { localPlayersJson: true, updatedAt: true },
  })

  let players: Player[] = []
  if (dbUser?.localPlayersJson) {
    try {
      // Assainie aussi en sortie : une liste enregistrée avant la validation
      // du PUT ne doit plus repartir telle quelle vers les appareils du compte.
      players = sanitizePlayers(JSON.parse(dbUser.localPlayersJson))
    } catch {
      // Colonne illisible (JSON tronqué ou corrompu) : liste vide plutôt qu'une 500.
    }
  }

  return NextResponse.json({
    players,
    updatedAt: dbUser?.updatedAt?.toISOString() ?? null,
  })
})

export const PUT = withApiRoute('players/local PUT', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const rate = checkRateLimit(
    userRateLimitKey('local-players', user.id),
    LOCAL_PLAYERS_PUT_LIMIT,
    LOCAL_PLAYERS_PUT_WINDOW_MS
  )
  if (!rate.ok) return apiError('rate_limited', 429, { retryAfterSec: rate.retryAfterSec })

  const parsed = await readApiJson<unknown>(request, LOCAL_PLAYERS_BODY_MAX_BYTES)
  if (!parsed.ok) return parsed.response
  const items = isRecord(parsed.body) ? parsed.body.players : undefined
  if (!Array.isArray(items)) return apiError('invalid_json', 400)

  await ensureServerModerationTermsLoaded()
  const requestLocale = await resolveRequestLocale({ userLocale: user.locale })

  const players: Player[] = []
  for (const item of items) {
    if (!hasPlayerShape(item)) return apiError('invalid_json', 400)
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
      // Refus de pseudo : `error` garde une phrase, déjà rendue dans la langue
      // de la requête, comme les autres routes de pseudo ; `code` porte la raison.
      return NextResponse.json(
        {
          error: getModerationErrorMessage(reason, requestLocale, 'player'),
          code: reason,
        },
        { status: 400 }
      )
    }
    const player = sanitizePlayer(item)
    if (player) players.push(player)
  }

  const json = JSON.stringify(players)
  if (json.length > LOCAL_PLAYERS_STORED_MAX_CHARS) return apiError('payload_too_large', 413)

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { localPlayersJson: json },
    select: { updatedAt: true },
  })

  return NextResponse.json({
    ok: true,
    updatedAt: updated.updatedAt.toISOString(),
  })
})
