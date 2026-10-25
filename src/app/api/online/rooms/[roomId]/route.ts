import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, closeGameSessionBeforeRoomDelete, touchMemberPresence } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { onlineErrorBody } from '@/lib/online-errors'
import { takeDeparture } from '@/lib/online/departures'
import { armRoomTicker } from '@/lib/online/room-ticker'
import { withApiRoute } from '@/lib/api-route'
import { isBriefingExpired } from '@/lib/online/briefing'
import { startBriefedGame } from './briefing-start'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Écritures du départ tentées au plus : chaque échec veut dire qu'un coup est
 * passé entre la lecture et l'écriture. On relit et on recommence ; au-delà,
 * le départ non marqué est rattrapé par le remplacement AFK.
 */
const LEAVE_WRITE_ATTEMPTS = 3

type LeavingRoom = {
  gameId: string | null
  status: string
  gameStateJson: string | null
  stateVersion: number
}

/**
 * Marque le partant « parti » dans l'état de la partie en cours, par
 * compare-and-swap sur stateVersion comme /action et leaveOtherRooms : un
 * update nu réécrivait l'état LU avant le départ, effaçant un coup joué
 * entre-temps sous le même numéro de version (les clients ignoraient alors
 * l'événement). Renvoie la version écrite, ou null si rien n'a été écrit.
 */
async function markLeftInGame(
  roomId: string,
  userId: string,
  initial: LeavingRoom
): Promise<number | null> {
  let room = initial
  for (let attempt = 1; ; attempt += 1) {
    const adapter = getGameAdapter(room.gameId)
    if (!adapter || room.status !== 'playing') return null
    const state = adapter.parse(room.gameStateJson)
    // Partie terminée : markLeft ne fait rien, l'écran de fin et les votes
    // « Rejouer » restent à ceux qui sont encore à table.
    const next = state ? adapter.markLeft(state, userId, Date.now()) : null
    if (!next) return null
    const stateVersion = room.stateVersion + 1
    const { count } = await prisma.onlineRoom.updateMany({
      where: { id: roomId, stateVersion: room.stateVersion },
      data: {
        gameStateJson: adapter.serialize(next),
        stateVersion,
        // Un départ peut faire TOURNER le tour (les moteurs rendent la main
        // au suivant plutôt que de figer la table). `currentTurnUserId` est
        // la colonne que lisent les composants et les ticks d'arbitre (bots,
        // AFK) : sans cette écriture, la table resterait bloquée sur le
        // partant jusqu'au remplacement automatique. Même règle que /action.
        currentTurnUserId: adapter.isFinished(next) ? null : adapter.currentActorId(next),
      },
    })
    if (count > 0) return stateVersion
    if (attempt >= LEAVE_WRITE_ATTEMPTS) return null
    const fresh = await prisma.onlineRoom.findUnique({
      where: { id: roomId },
      select: { gameId: true, status: true, gameStateJson: true, stateVersion: true },
    })
    if (!fresh) return null
    room = fresh
  }
}

export const GET = withApiRoute('online/rooms/[roomId] GET', async (_request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const member = await prisma.onlineRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
  })
  if (!member) {
    // Départ FORCÉ (expulsion, siège d'absent libéré, relance sans lui,
    // remplacement par un bot) : le 403 dit pourquoi, une fois — la raison est
    // consommée, le sondage suivant retombe sur le message générique côté
    // client (voir online/departures.ts).
    const reason = takeDeparture(user.id, roomId)
    return NextResponse.json(
      reason ? { ...onlineErrorBody('forbidden'), reason } : onlineErrorBody('forbidden'),
      { status: 403 }
    )
  }

  // Sondé toutes les 25 s (lobby, flux SSE vivant) à 2 s (flux mort) : la
  // présence n'écrit en base qu'au plus toutes les 30 s
  // (PRESENCE_WRITE_INTERVAL_MS), le reste du temps l'UPDATE ne touche rien.
  await touchMemberPresence(roomId, user.id)
  let dto = await buildRoomDto(roomId, user.id)
  if (!dto) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }

  // Filet serveur du briefing : échéance passée sans qu'aucun tick de timeout
  // ne l'ait fait aboutir (horloges en avance, requêtes perdues) — le sondage
  // lance la partie lui-même. Même code que /briefing-ack, idempotent.
  if (dto.status === 'briefing' && dto.briefing && isBriefingExpired(dto.briefing, Date.now())) {
    await startBriefedGame(roomId)
    dto = await buildRoomDto(roomId, user.id)
    if (!dto) {
      return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
    }
  }

  return NextResponse.json({ room: dto })
})

/** Quitter la salle */
export const DELETE = withApiRoute('online/rooms/[roomId] DELETE', async (_request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  if (!room) {
    return NextResponse.json({ ok: true })
  }

  // Pas membre (ou déjà sorti) : rien à faire, et surtout rien à diffuser.
  // Sans ce garde, n'importe quel compte muni de l'identifiant d'une table
  // publique (le guichet le montre) faisait relire la salle à tous ses
  // joueurs, appel après appel.
  const left = await prisma.onlineRoomMember.deleteMany({
    where: { roomId, userId: user.id },
  })
  if (left.count === 0) {
    return NextResponse.json({ ok: true })
  }

  const remaining = await prisma.onlineRoomMember.count({ where: { roomId } })

  if (remaining === 0) {
    // Journal des parties : le dernier humain quitte la table (souvent une
    // partie contre des bots), elle s'arrête maintenant — durée estimée —, ou
    // à sa dernière écriture si elle était abandonnée depuis plus longtemps
    // que le seuil de purge (onglet resté ouvert). Ne lève jamais : un échec
    // du journal ne doit pas empêcher de sortir.
    await closeGameSessionBeforeRoomDelete(room, 'left')
    await prisma.onlineRoom.delete({ where: { id: roomId } }).catch(() => {})
    invalidateLobbiesCache()
    return NextResponse.json({ ok: true })
  }

  if (room.hostUserId === user.id) {
    const nextHost = await prisma.onlineRoomMember.findFirst({
      where: { roomId },
      orderBy: { joinedAt: 'asc' },
    })
    if (nextHost) {
      await prisma.onlineRoom.update({
        where: { id: roomId },
        data: { hostUserId: nextHost.userId },
      })
    }
  }

  // Partie en cours (jeux serveur-autoritaires) : le joueur qui quitte est
  // marqué « parti » dans l'état — il peut revenir (bouton Rejoindre) pendant
  // 3 min avant d'être remplacé par un bot. Voir src/lib/online/replacement.ts.
  const stateVersion = await markLeftInGame(roomId, user.id, room)
  if (stateVersion !== null) {
    // Le tour a pu passer à un bot, ou le dernier humain partir : le
    // minuteur de service se recale sur l'état écrit (online/room-ticker.ts)
    // — sans lui, rien ne le réarmait s'il n'y avait aucun minuteur posé.
    await armRoomTicker(roomId)
  }

  // Le guichet montre l'effectif, l'hôte et le statut de la table : tout ce
  // qui vient de bouger. Après la DERNIÈRE écriture, pour ne rien rater.
  invalidateLobbiesCache()

  // Un SEUL événement temps réel : `changed` (avec la version) quand la partie
  // a bougé — c'est ce que les clients en jeu attendent —, `lobby` sinon.
  publishRoomChanged(
    roomId,
    stateVersion === null ? { type: 'lobby' } : { type: 'changed', stateVersion }
  )

  return NextResponse.json({ ok: true })
})
