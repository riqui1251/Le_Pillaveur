import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { TABOU_MAX_PLAYERS } from '@/lib/tabou/engine'
import { MC_MAX_PLAYERS } from '@/lib/mots-codes/engine'
import { publishRoomChanged } from '@/lib/online/room-bus'

type Params = { params: Promise<{ roomId: string }> }

const TABOU_MAX_PER_TEAM = TABOU_MAX_PLAYERS / 2

/**
 * Choix d'équipe (Toucher-Coulé, Tabou Vocal) : chaque membre choisit SA
 * propre équipe pendant le lobby — contrairement aux settings qui sont
 * réservés à l'hôte.
 */
export async function PUT(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: { members: { select: { userId: true } } },
  })
  if (!room) {
    return NextResponse.json({ error: 'Lobby introuvable' }, { status: 404 })
  }
  if (room.status !== 'waiting') {
    return NextResponse.json({ error: 'La partie est déjà lancée' }, { status: 409 })
  }
  if (room.gameId !== 'toucher-coule' && room.gameId !== 'tabou' && room.gameId !== 'mots-codes') {
    return NextResponse.json({ error: 'Ce jeu ne gère pas les équipes' }, { status: 400 })
  }
  if (!room.members.some((m) => m.userId === user.id)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const team = body.team === 'A' || body.team === 'B' ? body.team : null
  if (!team) {
    return NextResponse.json({ error: 'Équipe invalide' }, { status: 400 })
  }

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
    return NextResponse.json({ error: 'Cette équipe est complète' }, { status: 409 })
  }

  teams[user.id] = team
  const next: RoomSettings = { ...settings, [teamsKey]: teams }

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: { settingsJson: JSON.stringify(next) },
  })

  publishRoomChanged(roomId, { type: 'lobby' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
