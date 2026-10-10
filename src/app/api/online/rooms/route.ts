import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, cleanupAbandonedRooms, createUniqueRoomCode, leaveOtherRooms } from '@/lib/online-room'
import { GAMES, hasContentIn } from '@/lib/games'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { onlineErrorBody } from '@/lib/online-errors'
import { awardAchievement } from '@/lib/online/achievements'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'
import {
  checkRateLimit,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

const ROOM_LANGS = new Set(['fr', 'en', 'es', 'it'])

/**
 * Créer une table coûte une petite dizaine de requêtes plus deux ménages
 * (leaveOtherRooms, cleanupAbandonedRooms) : c'est l'appel le plus lourd du
 * lobby, et rien ne le bornait. Dix par minute laisse de la marge à une soirée
 * qui hésite entre deux jeux, et coupe la boucle d'un client cassé.
 * Quota par COMPTE et jamais par IP : une tablée partage le Wi-Fi du salon, et
 * un opérateur mobile met des centaines d'abonnés derrière une même IPv4.
 */
const CREATE_LIMIT = 10
const CREATE_WINDOW_MS = 60_000

/** Deux champs courts (gameId, visibility) : 8 Ko est déjà très large. */
const MAX_CREATE_BODY_BYTES = 8 * 1024

/** Créer un lobby pour un jeu précis */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
    }

    const rate = checkRateLimit(
      userRateLimitKey('room-create', user.id),
      CREATE_LIMIT,
      CREATE_WINDOW_MS
    )
    if (!rate.ok) {
      return rateLimitResponse(rate.retryAfterSec)
    }

    // Refus de corps trop gros : `payload_too_large`, le code générique que
    // withApiRoute/readApiJson posent déjà partout ailleurs (il est traduit dans
    // les 4 langues). Surtout pas `signal_too_large`, réservé au vocal WebRTC :
    // parler de « signal » à qui crée une table n'a aucun sens.
    const parsed = await readJsonBodyLimited<Record<string, unknown> | null>(
      request,
      MAX_CREATE_BODY_BYTES
    )
    if (!parsed.ok) {
      return parsed.reason === 'too_large'
        ? NextResponse.json(onlineErrorBody('payload_too_large'), { status: 413 })
        : NextResponse.json(onlineErrorBody('invalid_json'), { status: 400 })
    }
    // `?? {}` : un corps JSON `null` est valide et ferait planter les
    // lectures ci-dessous.
    const body = parsed.body ?? {}

    const gameId = typeof body.gameId === 'string' ? body.gameId.trim() : ''
    // `onlineReady` en plus de `!hidden` : sans lui, on ouvrait une table pour
    // un jeu PUREMENT LOCAL (hi-lo, monsieur-3, pmu, plinko — visibles au hub,
    // donc pas `hidden`). La salle se créait, puis n'avait aucun écran en
    // ligne à rendre : les joueurs restaient bloqués sur une table fantôme.
    const game = GAMES.find((g) => g.id === gameId && !g.hidden && g.onlineReady)
    if (!game) {
      return NextResponse.json(onlineErrorBody('invalid_game'), { status: 400 })
    }

    // Langue de la SALLE (contenu localisé côté serveur, ex. mots de
    // l'Imposteur) : celle du créateur au moment de la création — le cookie
    // que le middleware pose à chaque page localisée visitée. Sans cookie, le
    // français : un visiteur des pages /fr n'est donc jamais refusé ci-dessous.
    const cookieLang = (await cookies()).get(LOCALE_COOKIE)?.value
    const lang = cookieLang && ROOM_LANGS.has(cookieLang) ? cookieLang : 'fr'

    // Jeu dont les cartes n'existent pas dans cette langue (GameMeta.contentLangs) :
    // le lancement tirerait des cartes françaises à une table anglaise.
    // Refusé AVANT de quitter les autres tables — un refus ne doit coûter à l'hôte aucune de ses places.
    if (!hasContentIn(game, lang)) {
      return NextResponse.json(onlineErrorBody('content_lang_unavailable'), { status: 400 })
    }

    // Une seule table à la fois : les autres sont quittées proprement
    // (marqué « parti » si une partie y tourne, hôte transféré, salle vide
    // supprimée) — voir leaveOtherRooms.
    await leaveOtherRooms(user.id)
    await cleanupAbandonedRooms()

    // Visibilité choisie à la création (l'hôte peut la changer ensuite dans
    // les réglages du lobby) : 'public' = visible dans la liste des lobbies,
    // 'private' (défaut) = accessible par code/QR/invitation seulement.
    const visibility = body.visibility === 'public' ? 'public' : 'private'

    const code = await createUniqueRoomCode()
    const room = await prisma.onlineRoom.create({
      data: {
        code,
        gameId,
        hostUserId: user.id,
        visibility,
        settingsJson: JSON.stringify(
          gameId === 'plinko'
            ? { plinkoDifficulty: 'medium', lang }
            : { difficulty: 'normal', lang }
        ),
        members: {
          create: { userId: user.id, isReady: false },
        },
      },
    })
    // Le guichet en cache ignore cette table : sans invalidation, une table
    // publique fraîchement créée mettait jusqu'à 3 s à y apparaître.
    invalidateLobbiesCache()

    // Succès « première table créée » — jamais bloquant.
    await awardAchievement(prisma, user.id, 'first_room')

    const dto = await buildRoomDto(room.id, user.id)
    return NextResponse.json({ room: dto })
  } catch (err) {
    console.error('[POST /api/online/rooms]', err)
    return NextResponse.json(
      onlineErrorBody('server_error'),
      { status: 500 }
    )
  }
}
