import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { findLeftHumanPlayer, ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { getGameAdapter, SERVER_AUTHORITATIVE_GAMES } from '@/lib/online/game-adapters'
import { onlineErrorBody } from '@/lib/online-errors'
import { checkRateLimit, rateLimitResponse, userRateLimitKey } from '@/lib/rate-limit'

const REPLACEABLE_GAMES = SERVER_AUTHORITATIVE_GAMES

/**
 * La bannière sonde toutes les 15 s (RejoinBanner) : 4 appels par minute et
 * par onglet. 30 laissent plusieurs onglets ouverts et coupent la boucle d'un
 * script. Par COMPTE, jamais par IP (une tablée partage le Wi-Fi du salon).
 */
const REJOINABLE_LIMIT = 30
const REJOINABLE_WINDOW_MS = 60_000

/** Réponse gardée par compte : les onglets d'un même joueur se la partagent. */
const REJOINABLE_CACHE_MS = 5_000
const REJOINABLE_CACHE_MAX = 5_000

/** Parties ouvertes les plus récentes du joueur examinées : une seule compte en pratique. */
const OPEN_SESSIONS_SCAN = 5

type Rejoinable = { roomId: string; code: string; gameId: string | null; deadline: number }

const cache = new Map<string, { at: number; found: Rejoinable | null }>()

function remember(userId: string, found: Rejoinable | null, now: number): void {
  if (cache.size >= REJOINABLE_CACHE_MAX) {
    for (const [key, entry] of cache) {
      if (now - entry.at >= REJOINABLE_CACHE_MS) cache.delete(key)
    }
    if (cache.size >= REJOINABLE_CACHE_MAX) cache.clear()
  }
  cache.set(userId, { at: now, found })
}

/**
 * Les parties où le joueur est assis, trouvées par le journal des parties
 * (OnlineGameSessionPlayer, indexé par compte) : avant, la route lisait et
 * parsait l'état COMPLET des 50 dernières parties du site à chaque sondage —
 * des mégaoctets de dessins, sur l'unique connexion SQLite. Seuls les états
 * de SES parties encore ouvertes sont lus.
 */
async function findRejoinable(userId: string): Promise<Rejoinable | null> {
  const seats = await prisma.onlineGameSessionPlayer.findMany({
    where: { userId, session: { endedAt: null, gameId: { in: REPLACEABLE_GAMES } } },
    select: { session: { select: { roomId: true } } },
    orderBy: { session: { startedAt: 'desc' } },
    take: OPEN_SESSIONS_SCAN,
  })
  const roomIds = [...new Set(seats.map((s) => s.session.roomId))]
  if (roomIds.length === 0) return null

  const rooms = await prisma.onlineRoom.findMany({
    where: { id: { in: roomIds }, status: 'playing' },
    select: { id: true, code: true, gameId: true, gameStateJson: true },
  })
  rooms.sort((a, b) => roomIds.indexOf(a.id) - roomIds.indexOf(b.id))

  for (const room of rooms) {
    // Partie terminée : plus rien à reprendre — la bannière s'affichait à 0 s.
    const adapter = getGameAdapter(room.gameId)
    const state = adapter?.parse(room.gameStateJson)
    if (!adapter || state === null || state === undefined || adapter.isFinished(state)) continue
    const player = findLeftHumanPlayer(room.gameStateJson, userId)
    if (!player) continue
    return {
      roomId: room.id,
      code: room.code,
      gameId: room.gameId,
      deadline: (player.leftAt ?? 0) + ONLINE_REPLACE_GRACE_MS,
    }
  }
  return null
}

/**
 * Partie en cours que l'utilisateur peut REJOINDRE : il en est parti
 * (leftAt marqué) et un bot ne l'a pas encore remplacé. Générique à tous
 * les jeux serveur-autoritaires (contrat `players[]` — voir replacement.ts).
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const rate = checkRateLimit(
    userRateLimitKey('room-rejoinable', user.id),
    REJOINABLE_LIMIT,
    REJOINABLE_WINDOW_MS
  )
  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec)
  }

  const now = Date.now()
  const cached = cache.get(user.id)
  let found: Rejoinable | null
  if (cached && now - cached.at < REJOINABLE_CACHE_MS) {
    found = cached.found
  } else {
    found = await findRejoinable(user.id)
    remember(user.id, found, now)
  }

  if (!found) return NextResponse.json({ rejoinable: null })
  return NextResponse.json({
    rejoinable: {
      roomId: found.roomId,
      code: found.code,
      gameId: found.gameId,
      /** Millisecondes restantes avant remplacement par un bot (indicatif). */
      graceLeftMs: Math.max(0, found.deadline - Date.now()),
    },
  })
}
