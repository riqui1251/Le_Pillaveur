import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { parseOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'
import { levelForXp } from '@/lib/online/cosmetics'
import { parseBriefing, type RoomBriefing } from '@/lib/online/briefing'
import { publishRoomChanged } from '@/lib/online/room-bus'

const ROOM_CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const ROOM_CODE_LENGTH = 6

function generateRoomCode(): string {
  const bytes = randomBytes(ROOM_CODE_LENGTH)
  let out = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length]
  }
  return out
}

export type RoomMemberDto = {
  userId: string
  displayName: string
  isHost: boolean
  isReady: boolean
  isSelf: boolean
  /** Personnalisation du joueur en ligne (icône/effet/cadre du compte). */
  preferences: OnlinePreferences
  /** Niveau de progression en ligne (dérivé de l'XP). */
  level: number
  /** Rôle brut du compte — sert à dériver l'écusson de rang (crestTierForRole). */
  role: string
}

export type RoomDto = {
  id: string
  code: string
  status: string
  visibility: string
  gameId: string | null
  hostUserId: string
  members: RoomMemberDto[]
  allReady: boolean
  canLaunch: boolean
  settings: RoomSettings
  stateVersion: number
  currentTurnUserId: string | null
  gameStateJson: string | null
  /** Briefing tuto en cours (statut 'briefing') : qui a fini de lire. */
  briefing: RoomBriefing | null
}

export type LobbyListItem = {
  id: string
  code: string
  gameId: string
  hostName: string
  memberCount: number
  members: { displayName: string; isReady: boolean }[]
}

/**
 * Une partie EN COURS montrée au guichet. Purement informative : on ne peut
 * pas rejoindre une salle lancée (POST /api/online/rooms/join répond
 * `game_already_started`, sauf reprise de siège d'un joueur déjà inscrit), donc
 * ce DTO ne porte VOLONTAIREMENT ni le code de la table ni son id de jointure.
 */
export type LiveGameItem = {
  id: string
  gameId: string
  /** Pseudos des joueurs — seulement pour les tables PUBLIQUES (cf. summarizeLiveGames). */
  playerNames: string[]
  playerCount: number
  /**
   * Âge de la table en minutes. Il n'existe pas de colonne `startedAt` : on
   * mesure depuis `createdAt` (ouverture de la table), c'est donc « ouverte
   * il y a X », pas « joue depuis X » — le libellé i18n dit bien l'ouverture.
   */
  openedAgoMinutes: number
}

export type LobbyOverview = {
  lobbies: LobbyListItem[]
  /** Parties en cours DÉTAILLÉES — publiques uniquement. */
  liveGames: LiveGameItem[]
  /**
   * Total ANONYME de parties en cours, toutes visibilités confondues : c'est
   * la SEULE trace laissée par une table privée ou sur invitation.
   */
  liveGamesTotal: number
}

/** Ligne brute d'une salle candidate, telle que la lit `buildLobbyOverview`. */
export type LiveRoomRow = {
  id: string
  gameId: string | null
  status: string
  visibility: string
  createdAt: Date
  /**
   * Détail chargé UNIQUEMENT pour les tables publiques. `summarizeLiveGames`
   * le rejette de toute façon si la visibilité n'est pas 'public' : la vie
   * privée ne dépend pas de la prudence de l'appelant.
   */
  detail?: { names: string[]; playerCount: number }
}

/** Statuts d'une vraie partie en ligne. 'cast' (afficheur TV d'une partie LOCALE) n'en est pas une. */
const LIVE_STATUSES = ['playing', 'briefing'] as const

/**
 * Met en forme les parties en cours pour le guichet.
 * Deux règles, non négociables :
 * - une salle non 'playing'/'briefing' (notamment 'cast') n'existe pas ici ;
 * - une table non publique ne sort JAMAIS ni pseudo, ni jeu, ni identifiant :
 *   elle n'est qu'une unité dans le total anonyme.
 * Fonction pure (le `now` est injectable) pour rester testable sans base.
 */
export function summarizeLiveGames(
  rows: LiveRoomRow[],
  now: number = Date.now()
): { liveGames: LiveGameItem[]; liveGamesTotal: number } {
  const live = rows.filter(
    (row) => (LIVE_STATUSES as readonly string[]).includes(row.status) && Boolean(row.gameId)
  )

  const liveGames = live
    .filter((row) => row.visibility === 'public' && row.detail)
    .map((row) => ({
      id: row.id,
      gameId: row.gameId!,
      playerNames: row.detail!.names,
      playerCount: row.detail!.playerCount,
      openedAgoMinutes: Math.max(0, Math.floor((now - row.createdAt.getTime()) / 60000)),
    }))
    // La plus fraîche en tête : c'est celle qui donne le sentiment de vie.
    .sort((a, b) => a.openedAgoMinutes - b.openedAgoMinutes)

  return { liveGames, liveGamesTotal: live.length }
}

function computeReadyState(
  membersWithIds: { userId: string; isReady: boolean }[],
  gameId: string | null,
  settings: RoomSettings
) {
  const allReady = membersWithIds.length > 0 && membersWithIds.every((m) => m.isReady)
  if (gameId === 'toucher-coule') {
    // Les bots comblent les sièges vides : un seul joueur prêt suffit.
    const capacity = TC_MODES[settings.tcMode ?? '1v1'].playersPerTeam * 2
    return { allReady, canLaunch: allReady && membersWithIds.length <= capacity }
  }
  // Bornes du registre (jeux serveur-autoritaires) ; 2 joueurs par défaut.
  // L'hôte peut AJOUTER des bots (settings.botsCount) : le minimum s'applique
  // au TOTAL humains + bots.
  const adapter = getGameAdapter(gameId)
  const min = adapter?.minPlayers ?? 2
  const max = adapter?.maxPlayers ?? Number.MAX_SAFE_INTEGER
  const bots = adapter?.botsFillable ? Math.max(0, settings.botsCount ?? 0) : 0
  const total = membersWithIds.length + bots
  return {
    allReady,
    canLaunch: allReady && total >= min && membersWithIds.length <= max && total <= max,
  }
}

/**
 * Retire les champs secrets serveur (ex. `rngState` du moteur Petit Buveur)
 * avant tout envoi au client — anti-triche : empêche de prédire dés/cases.
 * No-op pour les jeux sans champ secret.
 */
export function stripEngineSecret(json: string | null): string | null {
  if (!json) return json
  try {
    const obj = JSON.parse(json)
    if (obj && typeof obj === 'object' && 'rngState' in obj) {
      delete (obj as Record<string, unknown>).rngState
      return JSON.stringify(obj)
    }
    return json
  } catch {
    return json
  }
}

/**
 * Variante PAR UTILISATEUR : certains jeux ont des secrets asymétriques
 * (Toucher-Coulé : les navires ennemis non touchés ne doivent jamais quitter
 * le serveur). Passe par le registre d'adaptateurs ; retombe sur
 * `stripEngineSecret` pour les jeux client-autoritaires.
 */
export function stripEngineSecretForUser(
  gameId: string | null,
  json: string | null,
  userId: string
): string | null {
  if (!json) return json
  const adapter = getGameAdapter(gameId)
  if (adapter) {
    const state = adapter.parse(json)
    if (!state) return null
    return adapter.clientViewJson(state, userId)
  }
  return stripEngineSecret(json)
}

/**
 * Variante SPECTATEUR NEUTRE (écran TV partagé, aucun viewer précis) : masque
 * tous les secrets pour un observateur sans camp (TC : navires intacts des
 * DEUX équipes cachés). Registre d'adaptateurs, même repli que ci-dessus.
 */
export function stripEngineSecretForSpectator(gameId: string | null, json: string | null): string | null {
  if (!json) return json
  const adapter = getGameAdapter(gameId)
  if (adapter) {
    const state = adapter.parse(json)
    if (!state) return null
    return adapter.spectatorViewJson(state)
  }
  return stripEngineSecret(json)
}

/** DTO minimal en LECTURE SEULE pour l'écran TV — pas de notion de « soi ». */
export type TvRoomDto = {
  code: string
  status: string
  gameId: string | null
  hostUserId: string
  members: Array<{
    userId: string
    displayName: string
    isHost: boolean
    isReady: boolean
    preferences: OnlinePreferences
    level: number
    role: string
  }>
  settings: RoomSettings
  stateVersion: number
  currentTurnUserId: string | null
  gameStateJson: string | null
}

/**
 * Construit le DTO TV d'une salle À PARTIR DE SON CODE (le code = jeton d'accès
 * pour un écran non authentifié). État de jeu passé par le masquage spectateur.
 */
export async function buildTvRoomDto(code: string): Promise<TvRoomDto | null> {
  const room = await prisma.onlineRoom.findUnique({
    where: { code },
    include: {
      members: { include: { user: true }, orderBy: { joinedAt: 'asc' } },
    },
  })
  if (!room) return null

  return {
    code: room.code,
    status: room.status,
    gameId: room.gameId,
    hostUserId: room.hostUserId,
    members: room.members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      isHost: m.userId === room.hostUserId,
      isReady: m.isReady,
      preferences: parseOnlinePreferences(m.user.onlinePreferencesJson),
      level: levelForXp(m.user.onlineXp),
      role: m.user.role,
    })),
    settings: parseRoomSettings(room.settingsJson),
    stateVersion: room.stateVersion,
    currentTurnUserId: room.currentTurnUserId,
    gameStateJson: stripEngineSecretForSpectator(room.gameId, room.gameStateJson),
  }
}

export async function buildRoomDto(roomId: string, currentUserId: string): Promise<RoomDto | null> {
  const room = await prisma.onlineRoom.findUnique({
    where: { id: roomId },
    include: {
      members: {
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })

  if (!room) return null

  const memberDtos = room.members.map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    isHost: m.userId === room.hostUserId,
    isReady: m.isReady,
    isSelf: m.userId === currentUserId,
    preferences: parseOnlinePreferences(m.user.onlinePreferencesJson),
    level: levelForXp(m.user.onlineXp),
    role: m.user.role,
  }))

  const settings = parseRoomSettings(room.settingsJson)
  const { allReady, canLaunch } = computeReadyState(
    memberDtos.map((m) => ({ userId: m.userId, isReady: m.isReady })),
    room.gameId,
    settings
  )

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    visibility: room.visibility,
    gameId: room.gameId,
    hostUserId: room.hostUserId,
    members: memberDtos,
    allReady,
    canLaunch,
    settings,
    stateVersion: room.stateVersion,
    currentTurnUserId: room.currentTurnUserId,
    gameStateJson: stripEngineSecretForUser(room.gameId, room.gameStateJson, currentUserId),
    briefing: room.status === 'briefing' ? parseBriefing(room.briefingJson) : null,
  }
}

/**
 * Une table « waiting » abandonnée (plus personne de vivant à l'intérieur
 * depuis 5 min) se ferme d'elle-même : sinon les codes s'accumulent
 * indéfiniment quand un onglet se ferme sans passer par /leave (crash, mise
 * en veille, connexion coupée).
 */
const STALE_WAITING_ROOM_MS = 5 * 60 * 1000

export async function cleanupStaleWaitingRooms(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_WAITING_ROOM_MS)
  const stale = await prisma.onlineRoom.findMany({
    where: {
      status: 'waiting',
      // L'obsolescence se mesure sur la PRÉSENCE des membres, jamais sur
      // `updatedAt` de la salle : ce champ ne bouge que si la LIGNE room est
      // réécrite, or rejoindre (/join), se mettre prêt (/ready) et le
      // rafraîchissement de présence n'écrivent QUE sur OnlineRoomMember.
      // Un groupe qui met 6-8 min à se rassembler voyait donc sa table purgée
      // sous ses yeux dès qu'un visiteur ouvrait le hub (buildLobbyList).
      // `lastSeenAt` est réécrit à chaque GET /rooms/[roomId] (poll ~2 s en
      // lobby), /join et /ready : un seul onglet ouvert suffit à garder la
      // table en vie. `none` couvre aussi le cas « aucun membre du tout »
      // (salle vide → supprimée immédiatement, comme avant).
      members: { none: { lastSeenAt: { gte: cutoff } } },
    },
    select: { id: true },
  })
  if (stale.length === 0) return

  const ids = stale.map((r) => r.id)
  await prisma.onlineRoom.deleteMany({ where: { id: { in: ids } } })
  // Notifie tout client encore branché en SSE sur une de ces salles (l'hôte
  // resté dans son lobby, par ex.) : il retombera aussitôt sur le Guichet.
  for (const id of ids) publishRoomChanged(id, { type: 'lobby' })
}

/**
 * Une salle 'playing'/'briefing' vit entièrement par les ticks envoyés par
 * les clients connectés (bots, horloge de phase, remplacement AFK — voir
 * online/replacement.ts) : dès que le dernier humain part sans passer par
 * /leave (crash, onglet fermé, connexion coupée), plus personne n'envoie
 * jamais rien et `updatedAt` se fige pour de bon. Sans ce ménage, la salle
 * reste « en jeu » indéfiniment (visible en Supervision des jours après).
 * Le seuil est volontairement large : une partie active reçoit des ticks en
 * continu, ce délai n'est atteint qu'après un abandon réel.
 */
const STALE_ACTIVE_ROOM_MS = 60 * 60 * 1000

export async function cleanupStaleActiveRooms(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_ACTIVE_ROOM_MS)
  const stale = await prisma.onlineRoom.findMany({
    where: {
      status: { in: ['playing', 'briefing'] },
      updatedAt: { lt: cutoff },
      // Même garde de présence qu'en lobby, mais en ET et non en remplacement :
      // pendant une partie le poll client interroge GET /state, qui ne
      // rafraîchit PAS `lastSeenAt` — la présence seule sous-estimerait la vie
      // de la salle. `updatedAt`, lui, bouge à chaque coup joué. On exige donc
      // les deux : aucune écriture d'état ET plus personne vu depuis 60 min.
      members: { none: { lastSeenAt: { gte: cutoff } } },
    },
    select: { id: true },
  })
  if (stale.length === 0) return

  const ids = stale.map((r) => r.id)
  await prisma.onlineRoom.deleteMany({ where: { id: { in: ids } } })
  for (const id of ids) publishRoomChanged(id, { type: 'lobby' })
}

/** Les deux ménages ensemble — pour les points d'entrée qui veulent tout couvrir. */
export async function cleanupAbandonedRooms(): Promise<void> {
  await Promise.all([cleanupStaleWaitingRooms(), cleanupStaleActiveRooms()])
}

export async function buildLobbyList(): Promise<LobbyListItem[]> {
  await cleanupStaleWaitingRooms()

  const rooms = await prisma.onlineRoom.findMany({
    where: { status: 'waiting', gameId: { not: null }, visibility: 'public' },
    include: {
      host: { select: { displayName: true } },
      members: {
        include: { user: { select: { displayName: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rooms.map((room) => ({
    id: room.id,
    code: room.code,
    gameId: room.gameId!,
    hostName: room.host.displayName,
    memberCount: room.members.length,
    members: room.members.map((m) => ({
      displayName: m.user.displayName,
      isReady: m.isReady,
    })),
  }))
}

/**
 * Une partie vraiment vivante réécrit sa ligne salle à chaque coup joué
 * (`stateVersion` → `updatedAt`) : au-delà de ce délai sans la moindre
 * écriture, la salle est un fantôme et ne doit pas gonfler le compteur —
 * annoncer « 4 parties en cours » alors que personne ne joue serait un
 * mensonge. On FILTRE plutôt que de purger : le ménage des salles actives
 * (cleanupStaleActiveRooms, seuil 60 min) reste hors de ce chemin très chaud.
 */
const LIVE_ROOM_FRESH_MS = 15 * 60 * 1000
/** Bornes de coût : ce que la liste ramène au maximum, quoi qu'il arrive. */
const LIVE_ROOMS_SCAN_MAX = 60
const LIVE_GAME_DETAIL_MAX = 12
const LIVE_GAME_NAMES_MAX = 6

/**
 * Tout ce que le guichet affiche : tables ouvertes + parties en cours.
 * Trois requêtes bornées au total, aucune n'ouvre les membres de TOUTES les
 * salles : la première (buildLobbyList) sert les tables ouvertes, la deuxième
 * ne lit que des scalaires (pour le total anonyme, visibilités comprises), la
 * troisième ne charge des pseudos que pour les tables publiques.
 */
export async function buildLobbyOverview(): Promise<LobbyOverview> {
  // Ménage des tables ouvertes seulement — déjà fait par buildLobbyList.
  const lobbies = await buildLobbyList()

  const freshSince = new Date(Date.now() - LIVE_ROOM_FRESH_MS)
  const liveWhere = {
    status: { in: [...LIVE_STATUSES] },
    gameId: { not: null },
    updatedAt: { gte: freshSince },
  }

  const [rooms, publicRooms] = await Promise.all([
    prisma.onlineRoom.findMany({
      where: liveWhere,
      select: { id: true, gameId: true, status: true, visibility: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: LIVE_ROOMS_SCAN_MAX,
    }),
    prisma.onlineRoom.findMany({
      where: { ...liveWhere, visibility: 'public' },
      select: {
        id: true,
        _count: { select: { members: true } },
        members: {
          select: { user: { select: { displayName: true } } },
          orderBy: { joinedAt: 'asc' },
          take: LIVE_GAME_NAMES_MAX,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: LIVE_GAME_DETAIL_MAX,
    }),
  ])

  const detailByRoom = new Map(
    publicRooms.map((room) => [
      room.id,
      { names: room.members.map((m) => m.user.displayName), playerCount: room._count.members },
    ])
  )

  const { liveGames, liveGamesTotal } = summarizeLiveGames(
    rooms.map((room) => ({ ...room, detail: detailByRoom.get(room.id) }))
  )

  return { lobbies, liveGames, liveGamesTotal }
}

export async function createUniqueRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode()
    const exists = await prisma.onlineRoom.findUnique({ where: { code } })
    if (!exists) return code
  }
  throw new Error('Impossible de générer un code de salle')
}

export async function touchMemberPresence(roomId: string, userId: string): Promise<void> {
  await prisma.onlineRoomMember.updateMany({
    where: { roomId, userId },
    data: { lastSeenAt: new Date() },
  })
}

/**
 * Supprime une salle si elle n'a plus aucun membre — évite les lobbys
 * fantômes quand un joueur en quitte une pour en créer/rejoindre une autre
 * (create/join retirent sa membership sans jamais passer par DELETE).
 */
export async function deleteRoomIfEmpty(roomId: string): Promise<void> {
  const remaining = await prisma.onlineRoomMember.count({ where: { roomId } })
  if (remaining === 0) {
    await prisma.onlineRoom.delete({ where: { id: roomId } }).catch(() => {})
  }
}
