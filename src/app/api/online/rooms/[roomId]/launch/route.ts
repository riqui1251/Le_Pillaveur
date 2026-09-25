import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { buildRoomDto } from '@/lib/online-room'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'
import { serializeBriefing } from '@/lib/online/briefing'
import { parseRoomSettings } from '@/lib/online-game-state'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { mcTeamCounts } from '@/lib/mots-codes/server-adapter'
import { onlineErrorBody } from '@/lib/online-errors'
import { readJsonBodyLimited } from '@/lib/rate-limit'
import { recordDeparture } from '@/lib/online/departures'

type Params = { params: Promise<{ roomId: string }> }

/**
 * Le seul corps attendu est `{ force: true }` : un plafond serré, lu avec le
 * même garde-fou que les réglages (settings/route.ts) plutôt qu'un
 * `request.json()` à cru.
 */
const MAX_LAUNCH_BODY_BYTES = 1024

/**
 * L'hôte lance la partie quand tous sont prêts — initialise l'état synchronisé.
 *
 * Corps facultatif `{ force: true }` : l'hôte lance SANS attendre les
 * retardataires. Les membres non prêts (jamais l'hôte) sortent de l'effectif
 * soumis aux contrôles (bornes du jeu, équipes), et ne sont retirés de la
 * table QU'UNE FOIS ces contrôles passés — un refus ne libère aucun siège.
 * Puis le lancement suit son cours normal (briefing). Un ami qui a posé son
 * téléphone ne bloque plus la table sur « 4/5 prêts » ; expulsé, il verra 403
 * à son prochain sondage et pourra revenir par le code. Sans `force`, rien ne
 * change : tous doivent être prêts.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(onlineErrorBody('auth_required'), { status: 401 })
  }

  const { roomId } = await params
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: {
      // Le lancement ne lit d'un membre que son siège et sa coche : pas de
      // ligne User entière (passwordHash, e-mail…) sortie de la base pour rien.
      members: {
        select: { userId: true, isReady: true },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })

  if (!room) {
    return NextResponse.json(onlineErrorBody('room_not_found'), { status: 404 })
  }
  // Avec ou sans `force`, seul l'hôte lance : le code reste celui que les
  // clients traduisent déjà pour ce refus.
  if (room.hostUserId !== user.id) {
    return NextResponse.json(onlineErrorBody('host_only_launch'), { status: 403 })
  }
  if (room.status !== 'waiting') {
    return NextResponse.json(onlineErrorBody('game_already_started'), { status: 409 })
  }

  // Le lancement normal n'envoie aucun corps : absent, mal formé ou trop gros
  // vaut « pas de force ». Seul `true` strict compte.
  const parsed = await readJsonBodyLimited<unknown>(request, MAX_LAUNCH_BODY_BYTES)
  const body = parsed.ok ? parsed.body : null
  const force =
    typeof body === 'object' && body !== null && (body as { force?: unknown }).force === true

  // Avec `force`, les retardataires (pas prêts, jamais l'hôte) sortent de
  // l'effectif CONTRÔLÉ ci-dessous, mais restent en base jusqu'au verdict : un
  // refus (min_players, équipes de Mots Codés…) libérait leurs sièges pour
  // rien — l'hôte recevait une erreur ET une table amputée.
  const laggards = force
    ? room.members.filter((m) => !m.isReady && m.userId !== room.hostUserId)
    : []
  const members =
    laggards.length > 0 ? room.members.filter((m) => m.isReady || m.userId === room.hostUserId) : room.members

  // Toucher-Coulé : capacité dépendante du format d'équipes (bots de complément).
  if (room.gameId === 'toucher-coule') {
    const settings = parseRoomSettings(room.settingsJson)
    const capacity = TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam * 2
    if (members.length > capacity) {
      // Code + `count` : le client traduit lui-même (avant, la phrase française
      // partait telle quelle chez les joueurs EN/ES/IT).
      return NextResponse.json(onlineErrorBody('max_players', { count: capacity }), { status: 400 })
    }
  } else {
    // Bornes du registre (jeux serveur-autoritaires) ; 2 joueurs par défaut.
    // Le minimum s'applique au TOTAL humains + bots choisis par l'hôte.
    const adapter = getGameAdapter(room.gameId)
    const settings = parseRoomSettings(room.settingsJson)
    const min = adapter?.minPlayers ?? 2
    const max = adapter?.maxPlayers ?? Number.MAX_SAFE_INTEGER
    const bots = adapter?.botsFillable ? Math.max(0, settings.botsCount ?? 0) : 0
    const total = members.length + bots
    if (total < min) {
      return NextResponse.json(onlineErrorBody('min_players', { count: min }), { status: 400 })
    }
    if (members.length > max || total > max) {
      return NextResponse.json(onlineErrorBody('max_players', { count: max }), { status: 400 })
    }
  }

  // Mots Codés : 2 joueurs minimum PAR ÉQUIPE après répartition automatique.
  if (room.gameId === 'mots-codes') {
    const settings = parseRoomSettings(room.settingsJson)
    const choices: Record<string, 'gold' | 'red'> = {}
    for (const [userId, team] of Object.entries(settings.mcTeams ?? {})) {
      choices[userId] = team === 'A' ? 'gold' : 'red'
    }
    const counts = mcTeamCounts(members.map((m) => m.userId), choices)
    if (counts.gold < 2 || counts.red < 2) {
      return NextResponse.json(onlineErrorBody('team_min_players'), { status: 400 })
    }
  }

  // Avec `force`, il ne reste que des membres prêts et l'hôte — qui, en
  // forçant, se déclare prêt par le geste même : sa coche ne compte plus.
  if (!force && !members.every((m) => m.isReady)) {
    return NextResponse.json(onlineErrorBody('players_not_ready'), { status: 400 })
  }

  // Contrôles passés : les retardataires quittent la table pour de bon. Le
  // guichet et les clients de la table le voient tout de suite, et les
  // expulsés découvrent leur 403 au sondage suivant.
  if (laggards.length > 0) {
    await prisma.onlineRoomMember.deleteMany({
      where: { roomId, userId: { in: laggards.map((m) => m.userId) } },
    })
    // Départ forcé par l'hôte : leur 403 le dira (online/departures.ts).
    for (const m of laggards) recordDeparture(m.userId, roomId, 'kicked')
    invalidateLobbiesCache()
    publishRoomChanged(roomId, { type: 'lobby' })
  }

  // La partie ne démarre PAS tout de suite : briefing tuto synchronisé — la
  // vraie création de l'état de jeu a lieu dans /briefing-ack, quand TOUS les
  // joueurs ont fini de lire (ou au timeout). Le rematch, lui, appelle
  // launchOnlineRoom en direct et saute donc le briefing.
  await prisma.onlineRoom.update({
    where: { id: roomId },
    data: {
      status: 'briefing',
      briefingJson: serializeBriefing({ startedAt: Date.now(), acks: [] }),
    },
  })
  // La table quitte `lobbies` et entre dans `liveGames` du guichet.
  invalidateLobbiesCache()
  publishRoomChanged(roomId, { type: 'changed' })

  const dto = await buildRoomDto(roomId, user.id)
  return NextResponse.json({ room: dto })
}
