import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'
import { onlineErrorBody } from '@/lib/online-errors'
import { readJsonBodyLimited } from '@/lib/rate-limit'
import { GAMES, hasContentIn } from '@/lib/games'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { apiError, withApiRoute } from '@/lib/api-route'

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

/**
 * Réglages de la table quand elle change de jeu : ceux du jeu précédent
 * repartent à zéro. Un format d'équipes de Toucher-Coulé, les équipes de Mots
 * Codés ou un nombre de manches n'ont aucun sens pour le suivant — et, gardés
 * en silence, ils ressortiraient le jour où la table revient à ce jeu, choisis
 * par personne. Restent ceux de la TABLE : sa langue (contenu localisé
 * serveur), la difficulté par défaut posée à la création, et les bots, bornés
 * par le nouveau jeu (aucun s'il ne se complète pas, jamais plus que les
 * sièges laissés par les humains).
 */
function settingsForGame(current: RoomSettings, gameId: string, humans: number): RoomSettings {
  const next: RoomSettings = { difficulty: 'normal' }
  if (current.lang) next.lang = current.lang
  const adapter = getGameAdapter(gameId)
  if (adapter?.botsFillable) {
    const bots = Math.min(
      Math.max(0, current.botsCount ?? 0),
      Math.max(0, adapter.maxPlayers - humans)
    )
    if (bots > 0) next.botsCount = bots
  }
  return next
}

/**
 * Tours de compare-and-swap sur settingsJson : un choix d'équipe (/team) écrit
 * entre la lecture et l'écriture fait perdre le tour, on relit et on rejoue.
 */
const SETTINGS_WRITE_ATTEMPTS = 10

type SettingsRoom = { status: string; hostUserId: string }

/** Refus tenus à la première lecture comme à chaque relecture après un conflit. */
function settingsRefusal(room: SettingsRoom, userId: string): NextResponse | null {
  if (room.status !== 'waiting') {
    return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })
  }
  if (room.hostUserId !== userId) {
    return NextResponse.json(onlineErrorBody('host_only_settings'), { status: 403 })
  }
  return null
}

/**
 * L'hôte met à jour les paramètres (difficulté, etc.) pendant le lobby — et
 * peut changer de JEU (`gameId`) sans refaire de table : même code, mêmes
 * joueurs, qui suivent vers la page du nouveau jeu (GameOnlineLobby). Refus :
 * `invalid_game` (400) pour un jeu pas jouable en ligne, `max_players` (409,
 * avec `count`) si la tablée dépasse déjà le nouveau jeu,
 * `content_lang_unavailable` (409) si ses cartes n'existent pas dans la
 * langue de la table.
 */
export const PUT = withApiRoute('online/rooms/[roomId]/settings PUT', async (request: Request, { params }: Params) => {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  let room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }
  const refused = settingsRefusal(room, user.id)
  if (refused) return refused

  // Refus de corps trop gros : `payload_too_large`, le code générique que
  // withApiRoute/readApiJson posent déjà partout ailleurs (il est traduit dans
  // les 4 langues). Surtout pas `signal_too_large`, réservé au vocal WebRTC :
  // parler de « signal » à qui règle sa table n'a aucun sens.
  const parsed = await readJsonBodyLimited<Record<string, unknown>>(
    request,
    MAX_SETTINGS_BODY_BYTES
  )
  if (!parsed.ok) {
    return parsed.reason === 'too_large'
      ? NextResponse.json(onlineErrorBody('payload_too_large'), { status: 413 })
      : NextResponse.json(onlineErrorBody('invalid_json'), { status: 400 })
  }
  // Forme libre comme avant : chaque réglage est validé un à un ci-dessous.
  const body = parsed.body

  // Réglages demandés, validés une fois pour toutes ; ils s'appliquent sur la
  // salle lue, relue après chaque conflit d'écriture.
  const patch: RoomSettings = {}
  if (typeof body.difficulty === 'string' && VALID_DIFFICULTIES.has(body.difficulty)) {
    patch.difficulty = body.difficulty as NonNullable<RoomSettings['difficulty']>
  }
  // Valeur rediffusée à tous les membres du lobby : liste blanche obligatoire,
  // comme les autres réglages (une chaîne libre était persistée telle quelle).
  if (
    typeof body.plinkoDifficulty === 'string' &&
    VALID_PLINKO_DIFFICULTIES.has(body.plinkoDifficulty)
  ) {
    patch.plinkoDifficulty = body.plinkoDifficulty as NonNullable<
      RoomSettings['plinkoDifficulty']
    >
  }
  if (body.hiLoMode === 'standard' || body.hiLoMode === 'traversee') {
    patch.hiLoMode = body.hiLoMode
  }
  if (typeof body.tcMode === 'string' && VALID_TC_MODES.has(body.tcMode)) {
    patch.tcMode = body.tcMode as NonNullable<RoomSettings['tcMode']>
  }
  if (typeof body.quizCount === 'number' && [10, 15, 20].includes(body.quizCount)) {
    patch.quizCount = body.quizCount
  }
  if (typeof body.lgDebateMin === 'number' && [1, 2, 3, 4, 5].includes(body.lgDebateMin)) {
    patch.lgDebateMin = body.lgDebateMin
  }
  if (typeof body.lgExtraWolf === 'boolean') {
    patch.lgExtraWolf = body.lgExtraWolf
  }
  if (
    typeof body.botsCount === 'number' &&
    Number.isInteger(body.botsCount) &&
    body.botsCount >= 0 &&
    body.botsCount <= 11
  ) {
    patch.botsCount = body.botsCount
  }
  if (typeof body.menteurPalifico === 'boolean') {
    patch.menteurPalifico = body.menteurPalifico
  }
  if (typeof body.menteurCalza === 'boolean') {
    patch.menteurCalza = body.menteurCalza
  }
  if (typeof body.tcPowerups === 'boolean') {
    patch.tcPowerups = body.tcPowerups
  }
  if (
    typeof body.imposteurCount === 'number' &&
    Number.isInteger(body.imposteurCount) &&
    body.imposteurCount >= 1 &&
    body.imposteurCount <= 3
  ) {
    patch.imposteurCount = body.imposteurCount
  }
  if (typeof body.bluffRounds === 'number' && [6, 8, 10].includes(body.bluffRounds)) {
    patch.bluffRounds = body.bluffRounds
  }
  if (typeof body.espionDiscussionMin === 'number' && [3, 5, 7].includes(body.espionDiscussionMin)) {
    patch.espionDiscussionMin = body.espionDiscussionMin
  }
  if (typeof body.espionRoundsToWin === 'number' && [3, 5, 7].includes(body.espionRoundsToWin)) {
    patch.espionRoundsToWin = body.espionRoundsToWin
  }
  if (typeof body.tabouTargetScore === 'number' && [15, 20, 25].includes(body.tabouTargetScore)) {
    patch.tabouTargetScore = body.tabouTargetScore
  }
  if (typeof body.crobardRounds === 'number' && [6, 8, 10].includes(body.crobardRounds)) {
    patch.crobardRounds = body.crobardRounds
  }
  if (typeof body.sfRounds === 'number' && [5, 8, 12].includes(body.sfRounds)) {
    patch.sfRounds = body.sfRounds
  }
  if (typeof body.dilRounds === 'number' && [10, 15, 20].includes(body.dilRounds)) {
    patch.dilRounds = body.dilRounds
  }
  if (typeof body.dilCoquin === 'boolean') {
    patch.dilCoquin = body.dilCoquin
  }
  if (typeof body.pbcRounds === 'number' && [3, 5, 8].includes(body.pbcRounds)) {
    patch.pbcRounds = body.pbcRounds
  }
  if (typeof body.preManches === 'number' && [1, 3, 5].includes(body.preManches)) {
    patch.preManches = body.preManches
  }

  const visibilityUpdate =
    typeof body.visibility === 'string' && VALID_VISIBILITIES.has(body.visibility)
      ? { visibility: body.visibility }
      : {}

  // Compare-and-swap sur les réglages lus (et le jeu) : un choix d'équipe
  // (/team) écrit entre la lecture et l'écriture était effacé par l'objet
  // entier réécrit ici.
  for (let attempt = 1; ; attempt += 1) {
    // Changement de jeu : même garde qu'à la création (POST /rooms) — un jeu
    // masqué ou purement local n'a pas d'écran en ligne à rendre. Le jeu
    // actuel redemandé n'est pas un changement.
    let nextGameId: string | null = null
    let humans = 0
    if (body.gameId !== undefined) {
      const requested = typeof body.gameId === 'string' ? body.gameId.trim() : ''
      const game = GAMES.find((g) => g.id === requested && !g.hidden && g.onlineReady)
      if (!game) {
        return NextResponse.json(onlineErrorBody('invalid_game'), { status: 400 })
      }
      if (game.id !== room.gameId) {
        nextGameId = game.id
        humans = await prisma.onlineRoomMember.count({ where: { roomId } })
        // Une tablée déjà trop nombreuse pour le nouveau jeu ne pourrait plus
        // être lancée : refusé ici, plutôt qu'une table qui bute sur
        // max_players au lancement (même borne, même code, même `count`).
        const max = getGameAdapter(game.id)?.maxPlayers ?? Number.MAX_SAFE_INTEGER
        if (humans > max) {
          return NextResponse.json(onlineErrorBody('max_players', { count: max }), { status: 409 })
        }
        // La langue de la table est posée à sa création (POST /rooms) et suit
        // le changement de jeu (settingsForGame) : une table anglaise ne passe
        // pas à un jeu dont les cartes n'existent qu'en français. Seul le
        // CHANGEMENT est contrôlé — une table déjà ouverte sur ce jeu garde ses
        // autres réglages.
        if (!hasContentIn(game, parseRoomSettings(room.settingsJson).lang)) {
          return NextResponse.json(onlineErrorBody('content_lang_unavailable'), { status: 409 })
        }
      }
    }

    const current = parseRoomSettings(room.settingsJson)
    const next: RoomSettings = {
      ...(nextGameId ? settingsForGame(current, nextGameId, humans) : current),
      ...patch,
    }
    const where = {
      id: roomId,
      status: 'waiting',
      hostUserId: user.id,
      gameId: room.gameId,
      settingsJson: room.settingsJson,
    }

    let written: number
    if (nextGameId) {
      // Nouveau jeu = nouvelle décision : chacun se remet « prêt » en
      // connaissance de cause. Les deux écritures ensemble — une table au jeu
      // changé mais aux joueurs encore « prêts » se lancerait d'un clic. La
      // remise à zéro ne suit que si la salle a bien changé de jeu.
      const [roomWrite] = await prisma.$transaction([
        prisma.onlineRoom.updateMany({
          where,
          data: { gameId: nextGameId, settingsJson: JSON.stringify(next), ...visibilityUpdate },
        }),
        prisma.onlineRoomMember.updateMany({
          where: { roomId, room: { gameId: nextGameId } },
          data: { isReady: false },
        }),
      ])
      written = roomWrite.count
    } else {
      const roomWrite = await prisma.onlineRoom.updateMany({
        where,
        data: { settingsJson: JSON.stringify(next), ...visibilityUpdate },
      })
      written = roomWrite.count
    }
    if (written === 1) break
    if (attempt >= SETTINGS_WRITE_ATTEMPTS) return apiError('version_conflict', 409)

    room = await prisma.onlineRoom.findUnique({ where: { id: roomId } })
    if (!room) {
      return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
    }
    const refusedAgain = settingsRefusal(room, user.id)
    if (refusedAgain) return refusedAgain
  }

  // Un passage public ↔ privé/invitation change ce que le guichet liste — et
  // un changement de jeu, le jeu affiché de la table.
  invalidateLobbiesCache()

  publishRoomChanged(roomId, { type: 'lobby' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
})
