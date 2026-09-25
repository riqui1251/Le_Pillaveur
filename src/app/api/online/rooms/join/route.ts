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
import { forgetDeparture } from '@/lib/online/departures'
import { armRoomTicker } from '@/lib/online/room-ticker'
import {
  checkRateLimit,
  rateLimitResponse,
  readJsonBodyLimited,
  userRateLimitKey,
} from '@/lib/rate-limit'

/**
 * Rejoindre lit la salle, purge les absents, quitte les autres tables puis
 * écrit un siège : rien ne le bornait. Vingt par minute laisse passer le
 * va-et-vient d'une soirée (code mal tapé, retour en partie, changement de
 * table) et coupe la boucle d'un client cassé.
 * Quota par COMPTE et jamais par IP : une tablée partage le Wi-Fi du salon, et
 * un opérateur mobile met des centaines d'abonnés derrière une même IPv4.
 */
const JOIN_LIMIT = 20
const JOIN_WINDOW_MS = 60_000

/** Un code de 6 caractères ou un identifiant de salle : 8 Ko est très large. */
const MAX_JOIN_BODY_BYTES = 8 * 1024

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

  const rate = checkRateLimit(userRateLimitKey('room-join', user.id), JOIN_LIMIT, JOIN_WINDOW_MS)
  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec)
  }

  // Refus de corps trop gros : `payload_too_large`, le code générique que
  // withApiRoute/readApiJson posent déjà partout ailleurs (il est traduit dans
  // les 4 langues). Surtout pas `signal_too_large`, réservé au vocal WebRTC :
  // parler de « signal » à qui crée une table n'a aucun sens.
  const parsed = await readJsonBodyLimited<Record<string, unknown> | null>(
    request,
    MAX_JOIN_BODY_BYTES
  )
  if (!parsed.ok) {
    return parsed.reason === 'too_large'
      ? NextResponse.json(onlineErrorBody('payload_too_large'), { status: 413 })
      : NextResponse.json(onlineErrorBody('invalid_json'), { status: 400 })
  }
  // `?? {}` : un corps JSON `null` est valide et ferait planter les lectures.
  const body = parsed.body ?? {}

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
  // Partie finie mais table pas encore revenue en attente : l'ami en retard
  // s'assoit (plus bas) au lieu de buter sur game_already_started.
  let finishedGame = false
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
        // Partie terminée, hors reprise de siège — et hors version sentinelle
        // de la relance (négative) : la nouvelle partie s'y distribue, l'état
        // terminé n'y est plus qu'un reliquat.
        finishedGame = !next && Boolean(state) && room.stateVersion > 0 && adapter.isFinished(state)
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
        // Un humain de retour à une table désertée : le minuteur de service,
        // coupé faute d'humain présent, reprend sur l'état écrit.
        await armRoomTicker(room.id)
        forgetDeparture(user.id, room.id)
        // L'effectif de la partie en cours (liveGames) vient de changer.
        invalidateLobbiesCache()
        publishRoomChanged(room.id, { type: 'changed', stateVersion: room.stateVersion + 1 })
        const dto = await buildRoomDto(room.id, user.id)
        return NextResponse.json({ room: dto })
      }
    }
    // Une partie EN COURS ne s'ouvre toujours pas : on n'entre pas au milieu
    // d'une donne. Une partie FINIE, si — la suite est commune avec le lobby.
    if (!finishedGame) {
      return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })
    }
  }

  // Retardataire d'une partie finie : il s'assoit « pas prêt », voit l'écran
  // de fin, peut voter « Rejouer » — la relance distribue aux membres
  // présents, il en est — ou attendre que la table revienne en attente
  // (back-to-lobby). Mêmes gardes qu'au lobby : invitation, plafond de sièges
  // humains. La purge des absents ne touche qu'aux tables ouvertes (no-op ici).

  // Entrer par l'IDENTIFIANT (bandeaux Rejoindre / invitation d'ami) et non
  // par le code : une table non publique n'ouvre alors qu'à ses membres et à
  // ses invités. Une table « privée » se rejoint avec son code, et son id,
  // lui, ne vaut pas le code — il a pu se lire ailleurs, et une partie finie
  // (le retardataire ci-dessus, le retour à la table) le garde. Pour
  // l'inconnu, la table n'existe pas. Le code seul, lui, suffit toujours à
  // une table privée ; jamais à une table sur invitation.
  const byIdOnly = Boolean(roomId)
  const needsInvite =
    room.visibility === 'invite' || (byIdOnly && room.visibility !== 'public')
  if (needsInvite && !(await canJoinInviteRoom(room.id, user.id))) {
    return room.visibility === 'invite'
      ? NextResponse.json(onlineErrorBody('invite_only'), { status: 403 })
      : NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
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

  // De retour à cette table : la raison d'un départ forcé précédent ne vaut
  // plus (online/departures.ts).
  forgetDeparture(user.id, room.id)

  // Effectif et liste des membres (isReady) sont affichés au guichet — et
  // l'effectif d'une partie finie (liveGames). `lobby` : les écrans de fin
  // relisent la salle complète, le nouveau venu y apparaît.
  invalidateLobbiesCache()
  publishRoomChanged(room.id, { type: 'lobby' })

  const dto = await buildRoomDto(room.id, user.id)
  return NextResponse.json({ room: dto })
}
