import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { onlineErrorBody } from '@/lib/online-errors'
import { readJsonBodyLimited } from '@/lib/rate-limit'

type Params = { params: Promise<{ roomId: string }> }

/** Les réglages sont une poignée de champs courts : 64 Ko est déjà très large. */
const MAX_SETTINGS_BODY_BYTES = 64 * 1024

// `satisfies` adosse chaque liste blanche à l'union du type : une valeur qui
// n'existe pas dans RoomSettings devient une erreur de compilation, ce qui rend
// honnêtes les `as` posés à l'affectation (Set.has ne sait pas narrower).
// Les Set restent `Set<string>` pour pouvoir tester une chaîne quelconque.
const VALID_DIFFICULTIES = new Set<string>(
  ['facile', 'normal', 'difficile', 'extreme'] satisfies NonNullable<
    RoomSettings['difficulty']
  >[]
)
const VALID_PLINKO_DIFFICULTIES = new Set<string>(
  ['easy', 'medium', 'hard'] satisfies NonNullable<RoomSettings['plinkoDifficulty']>[]
)
const VALID_VISIBILITIES = new Set(['public', 'private', 'invite'])
// Non typée sur RoomSettings['tcMode'] : l'union du type a pris du retard sur
// le jeu, qui gère bien le 4v4 (TC_MODES dans toucher-coule/engine.ts).
const VALID_TC_MODES = new Set(['1v1', '2v2', '3v3', '4v4'])

/** L'hôte met à jour les paramètres (difficulté, etc.) pendant le lobby */
export async function PUT(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }
  if (room.status !== 'waiting') {
    return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })
  }
  if (room.hostUserId !== user.id) {
    return NextResponse.json(onlineErrorBody('host_only_settings'), { status: 403 })
  }

  // ONLINE_ERROR_CODES n'a aucun code générique « corps trop gros » :
  // `signal_too_large` (vocabulaire du vocal WebRTC) est le seul déjà traduit
  // dans onlineLobby.errors, donc réutilisé ici par défaut. À remplacer par un
  // code dédié (ex. `body_too_large`) le jour où online-errors.ts en gagne un.
  const parsed = await readJsonBodyLimited<Record<string, unknown>>(
    request,
    MAX_SETTINGS_BODY_BYTES
  )
  if (!parsed.ok) {
    return parsed.reason === 'too_large'
      ? NextResponse.json(onlineErrorBody('signal_too_large'), { status: 413 })
      : NextResponse.json(onlineErrorBody('invalid_json'), { status: 400 })
  }
  // Forme libre comme avant : chaque réglage est validé un à un ci-dessous.
  const body = parsed.body

  const current = parseRoomSettings(room.settingsJson)
  const next: RoomSettings = { ...current }

  if (typeof body.difficulty === 'string' && VALID_DIFFICULTIES.has(body.difficulty)) {
    next.difficulty = body.difficulty as NonNullable<RoomSettings['difficulty']>
  }
  // Valeur rediffusée à tous les membres du lobby : liste blanche obligatoire,
  // comme les autres réglages (une chaîne libre était persistée telle quelle).
  if (
    typeof body.plinkoDifficulty === 'string' &&
    VALID_PLINKO_DIFFICULTIES.has(body.plinkoDifficulty)
  ) {
    next.plinkoDifficulty = body.plinkoDifficulty as NonNullable<
      RoomSettings['plinkoDifficulty']
    >
  }
  if (body.hiLoMode === 'standard' || body.hiLoMode === 'traversee') {
    next.hiLoMode = body.hiLoMode
  }
  if (typeof body.tcMode === 'string' && VALID_TC_MODES.has(body.tcMode)) {
    next.tcMode = body.tcMode as NonNullable<RoomSettings['tcMode']>
  }
  if (typeof body.quizCount === 'number' && [10, 15, 20].includes(body.quizCount)) {
    next.quizCount = body.quizCount
  }
  if (typeof body.lgDebateMin === 'number' && [1, 2, 3, 4, 5].includes(body.lgDebateMin)) {
    next.lgDebateMin = body.lgDebateMin
  }
  if (typeof body.lgExtraWolf === 'boolean') {
    next.lgExtraWolf = body.lgExtraWolf
  }
  if (
    typeof body.botsCount === 'number' &&
    Number.isInteger(body.botsCount) &&
    body.botsCount >= 0 &&
    body.botsCount <= 11
  ) {
    next.botsCount = body.botsCount
  }
  if (typeof body.menteurPalifico === 'boolean') {
    next.menteurPalifico = body.menteurPalifico
  }
  if (typeof body.menteurCalza === 'boolean') {
    next.menteurCalza = body.menteurCalza
  }
  if (typeof body.tcPowerups === 'boolean') {
    next.tcPowerups = body.tcPowerups
  }
  if (
    typeof body.imposteurCount === 'number' &&
    Number.isInteger(body.imposteurCount) &&
    body.imposteurCount >= 1 &&
    body.imposteurCount <= 3
  ) {
    next.imposteurCount = body.imposteurCount
  }
  if (typeof body.bluffRounds === 'number' && [6, 8, 10].includes(body.bluffRounds)) {
    next.bluffRounds = body.bluffRounds
  }
  if (typeof body.espionDiscussionMin === 'number' && [3, 5, 7].includes(body.espionDiscussionMin)) {
    next.espionDiscussionMin = body.espionDiscussionMin
  }
  if (typeof body.espionRoundsToWin === 'number' && [3, 5, 7].includes(body.espionRoundsToWin)) {
    next.espionRoundsToWin = body.espionRoundsToWin
  }
  if (typeof body.tabouTargetScore === 'number' && [15, 20, 25].includes(body.tabouTargetScore)) {
    next.tabouTargetScore = body.tabouTargetScore
  }
  if (typeof body.crobardRounds === 'number' && [6, 8, 10].includes(body.crobardRounds)) {
    next.crobardRounds = body.crobardRounds
  }
  if (typeof body.sfRounds === 'number' && [5, 8, 12].includes(body.sfRounds)) {
    next.sfRounds = body.sfRounds
  }
  if (typeof body.dilRounds === 'number' && [10, 15, 20].includes(body.dilRounds)) {
    next.dilRounds = body.dilRounds
  }
  if (typeof body.dilCoquin === 'boolean') {
    next.dilCoquin = body.dilCoquin
  }
  if (typeof body.pbcRounds === 'number' && [3, 5, 8].includes(body.pbcRounds)) {
    next.pbcRounds = body.pbcRounds
  }
  if (typeof body.preManches === 'number' && [1, 3, 5].includes(body.preManches)) {
    next.preManches = body.preManches
  }

  const visibilityUpdate =
    typeof body.visibility === 'string' && VALID_VISIBILITIES.has(body.visibility)
      ? { visibility: body.visibility }
      : {}

  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: { settingsJson: JSON.stringify(next), ...visibilityUpdate },
  })

  publishRoomChanged(roomId, { type: 'lobby' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
