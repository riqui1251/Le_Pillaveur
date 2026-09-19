import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto, leaveOtherRooms, purgeAbsentLobbyMembers } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'
import { canJoinInviteRoom } from '@/lib/online/room-invites'
import { parseRoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { onlineErrorBody } from '@/lib/online-errors'

/**
 * Nombre de sièges qu'un HUMAIN peut occuper à cette table. Toucher-Coulé
 * garde sa capacité par format d'équipes ; les autres jeux serveur-autoritaires
 * prennent la borne haute de leur adaptateur. Les bots ne comptent PAS : ce
 * sont des sièges que l'hôte choisit de remplir au lancement
 * (settings.botsCount), pas des joueurs qui s'assoient — un humain a toujours
 * priorité, et c'est le lancement qui borne le total humains + bots. Les jeux
 * client-autoritaires (sans adaptateur) restent sans plafond, comme avant.
 */
function humanCapacity(gameId: string | null, settingsJson: string | null): number | null {
  if (gameId === 'toucher-coule') {
    const settings = parseRoomSettings(settingsJson)
    return TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam * 2
  }
  return getGameAdapter(gameId)?.maxPlayers ?? null
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const body = await request.json()
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : ''

  // Les membres (siège + présence seulement, jamais la ligne User) viennent
  // avec la salle : c'est sur eux que se libèrent les sièges des absents avant
  // de compter les places (voir plus bas).
  const membersSelect = {
    members: {
      select: { userId: true, lastSeenAt: true },
      orderBy: { joinedAt: 'asc' as const },
    },
  }
  let room = null
  if (roomId) {
    room = await prisma.onlineRoom.findUnique({ where: { id: roomId }, include: membersSelect })
  } else if (code.length === 6) {
    room = await prisma.onlineRoom.findUnique({ where: { code }, include: membersSelect })
  } else {
    return NextResponse.json(onlineErrorBody('code_required'), { status: 400 })
  }

  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }
  if (room.status !== 'waiting') {
    // Retour en partie : un joueur marqué « parti » peut reprendre sa place
    // tant qu'un bot ne l'a pas remplacé (voir src/lib/online/replacement.ts).
    if (room.status === 'playing') {
      let rejoinedJson: string | null = null
      const adapter = getGameAdapter(room.gameId)
      if (adapter) {
        const state = adapter.parse(room.gameStateJson)
        const next = state ? adapter.rejoin(state, user.id) : null
        if (next) rejoinedJson = adapter.serialize(next)
      }
      if (rejoinedJson) {
        // Une seule table à la fois : les autres sont quittées proprement
        // (marqué « parti » si une partie y tourne, hôte transféré, salle
        // vide supprimée) — voir leaveOtherRooms.
        await leaveOtherRooms(user.id, room.id)
        await prisma.onlineRoomMember.upsert({
          where: { roomId_userId: { roomId: room.id, userId: user.id } },
          create: { roomId: room.id, userId: user.id, isReady: true },
          update: { lastSeenAt: new Date(), isReady: true },
        })
        await prisma.onlineRoom.update({
          where: { id: room.id },
          data: { gameStateJson: rejoinedJson, stateVersion: room.stateVersion + 1 },
        })
        // L'effectif de la partie en cours (liveGames) vient de changer.
        invalidateLobbiesCache()
        publishRoomChanged(room.id, { type: 'changed', stateVersion: room.stateVersion + 1 })
        const dto = await buildRoomDto(room.id, user.id)
        return NextResponse.json({ room: dto })
      }
    }
    return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })
  }

  if (room.visibility === 'invite' && !(await canJoinInviteRoom(room.id, user.id))) {
    return NextResponse.json(onlineErrorBody('invite_only'), { status: 403 })
  }

  // Les sièges des absents (onglet fermé sans /leave) se libèrent AVANT de
  // compter les places : la purge ne passait que par le sondage d'un membre
  // présent (buildRoomDto), et une table pleine « en base » refusait le
  // nouveau venu jusqu'à ce sondage — jusqu'à 25 s au flux vivant — alors
  // qu'il avait le code sous les yeux. Gratuit quand personne n'est absent.
  const { absent } = await purgeAbsentLobbyMembers(room, user.id)

  // Plafond de sièges HUMAINS de la table, refusé ICI et non au lancement :
  // avant, seul Toucher-Coulé était plafonné à l'entrée — un 17e joueur
  // s'asseyait, le lancement échouait sur max_players et aucun siège ne se
  // libérait. « Les autres » : reprendre son propre siège n'est jamais refusé.
  const capacity = humanCapacity(room.gameId, room.settingsJson)
  if (capacity !== null) {
    const others = room.members.filter(
      (m) => m.userId !== user.id && !absent.includes(m.userId)
    ).length
    if (others >= capacity) {
      return NextResponse.json(onlineErrorBody('room_full'), { status: 409 })
    }
  }

  // Une seule table à la fois : les autres sont quittées proprement (marqué
  // « parti » si une partie y tourne, hôte transféré, salle vide supprimée)
  // — voir leaveOtherRooms.
  await leaveOtherRooms(user.id, room.id)

  await prisma.onlineRoomMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
    create: { roomId: room.id, userId: user.id, isReady: false },
    update: { lastSeenAt: new Date(), isReady: false },
  })

  if (room.visibility === 'invite') {
    await prisma.onlineRoomInvite.updateMany({
      where: { roomId: room.id, invitedUserId: user.id, status: 'pending' },
      data: { status: 'accepted', respondedAt: new Date() },
    })
  }

  // Effectif et liste des membres (isReady) sont affichés au guichet.
  invalidateLobbiesCache()
  publishRoomChanged(room.id, { type: 'lobby' })

  const dto = await buildRoomDto(room.id, user.id)
  return NextResponse.json({ room: dto })
}
