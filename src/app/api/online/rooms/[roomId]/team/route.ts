import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { TABOU_MAX_PLAYERS } from '@/lib/tabou/engine'
import { MC_MAX_PLAYERS } from '@/lib/mots-codes/engine'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody } from '@/lib/online-errors'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'

type Params = { params: Promise<{ roomId: string }> }

const TABOU_MAX_PER_TEAM = TABOU_MAX_PLAYERS / 2

/** Le corps attendu est `{ team: 'A' | 'B' }`. */
const MAX_TEAM_BODY_BYTES = 1024

/**
 * Tours de compare-and-swap sur settingsJson : chaque tour perdu veut dire
 * qu'un autre choix d'équipe (ou un réglage de l'hôte) a été écrit entre la
 * lecture et l'écriture.
 */
const TEAM_WRITE_ATTEMPTS = 10

type TeamRoom = {
  status: string
  gameId: string | null
  settingsJson: string | null
  members: { userId: string }[]
}

function readTeamRoom(roomId: string): Promise<TeamRoom | null> {
  return prisma.onlineRoom.findUnique({
    where: { id: roomId },
    select: { status: true, gameId: true, settingsJson: true, members: { select: { userId: true } } },
  })
}

/** Refus tenus à la première lecture comme à chaque relecture après un conflit. */
function refusal(room: TeamRoom, userId: string): NextResponse | null {
  if (room.status !== 'waiting') {
    return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })
  }
  if (room.gameId !== 'toucher-coule' && room.gameId !== 'tabou' && room.gameId !== 'mots-codes') {
    return NextResponse.json(onlineErrorBody('teams_not_supported'), { status: 400 })
  }
  if (!room.members.some((m) => m.userId === userId)) {
    return NextResponse.json(onlineErrorBody('forbidden'), { status: 403 })
  }
  return null
}

/**
 * Choix d'équipe (Toucher-Coulé, Tabou Vocal) : chaque membre choisit SA
 * propre équipe pendant le lobby — contrairement aux settings qui sont
 * réservés à l'hôte.
 */
export const PUT = withApiRoute('online/rooms/[roomId]/team PUT', async (request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  let room = await readTeamRoom(roomId)
  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }
  const refused = refusal(room, user.id)
  if (refused) return refused

  const parsed = await readApiJson<{ team?: unknown } | null>(request, MAX_TEAM_BODY_BYTES)
  if (!parsed.ok) return parsed.response
  const team = parsed.body?.team === 'A' || parsed.body?.team === 'B' ? parsed.body.team : null
  if (!team) {
    return NextResponse.json(onlineErrorBody('invalid_team'), { status: 400 })
  }

  // Compare-and-swap sur le JSON lu : deux joueurs qui choisissaient ensemble
  // (ou l'hôte qui touchait un réglage) réécrivaient chacun l'objet entier
  // lu AVANT l'autre, et un choix disparaissait. Le contrôle team_full est
  // refait sur l'état frais à chaque tour.
  for (let attempt = 1; ; attempt += 1) {
    const settings = parseRoomSettings(room.settingsJson)
    const isTabou = room.gameId === 'tabou'
    const isMotsCodes = room.gameId === 'mots-codes'
    const teamsKey = isTabou ? 'tabouTeams' : isMotsCodes ? 'mcTeams' : 'tcTeams'
    const teams = { ...(settings[teamsKey] ?? {}) }
    const perTeam = isTabou
      ? TABOU_MAX_PER_TEAM
      : isMotsCodes
        ? MC_MAX_PLAYERS / 2
        : TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam
    const humansInTeam = room.members.filter(
      (m) => m.userId !== user.id && teams[m.userId] === team
    ).length
    if (humansInTeam >= perTeam) {
      return NextResponse.json(onlineErrorBody('team_full'), { status: 409 })
    }

    teams[user.id] = team
    const next: RoomSettings = { ...settings, [teamsKey]: teams }

    const { count } = await prisma.onlineRoom.updateMany({
      where: { id: roomId, status: 'waiting', settingsJson: room.settingsJson },
      data: { settingsJson: JSON.stringify(next) },
    })
    if (count === 1) break
    if (attempt >= TEAM_WRITE_ATTEMPTS) return apiError('version_conflict', 409)

    room = await readTeamRoom(roomId)
    if (!room) {
      return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
    }
    const refusedAgain = refusal(room, user.id)
    if (refusedAgain) return refusedAgain
  }

  publishRoomChanged(roomId, { type: 'lobby' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
})
