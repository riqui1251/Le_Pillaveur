import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { parseRoomSettings, type RoomSettings } from '@/lib/online-game-state'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { TC_MODES } from '@/lib/toucher-coule/engine'
import { parseOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'
import { levelForXp } from '@/lib/online/cosmetics'
import { parseBriefing, type RoomBriefing } from '@/lib/online/briefing'
import { publishRoomChanged } from '@/lib/online/room-bus'
import { closeGameSession, closeGameSessionsOfPurgedRooms } from '@/lib/online/game-sessions'
import { invalidateLobbiesCache } from '@/lib/online/lobbies-cache'

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
  /** Table privée ou sur invitation — signalée, mais montrée comme les autres. */
  isPrivate: boolean
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
  /** Parties en cours : toutes visibilités, et AUCUN pseudo (cf. summarizeLiveGames). */
  liveGames: LiveGameItem[]
  /**
   * Total des parties en cours, y compris celles que le plafond d'affichage
   * (LIVE_ROOMS_SCAN_MAX) laisse de côté.
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
  /** Effectif de la table — la seule chose qu'on dise de ses joueurs. */
  playerCount: number
}

/** Statuts d'une vraie partie en ligne. 'cast' (afficheur TV d'une partie LOCALE) n'en est pas une. */
const LIVE_STATUSES = ['playing', 'briefing'] as const

/**
 * Met en forme les parties en cours pour le guichet.
 * Deux règles, non négociables :
 * - une salle non 'playing'/'briefing' (notamment 'cast') n'existe pas ici ;
 * - AUCUN pseudo ne sort d'ici, quelle que soit la visibilité : le guichet dit
 *   le jeu, l'effectif et l'âge de la table, jamais qui y joue. Une table
 *   ouverte à tous n'est pas pour autant une table dont on publie les noms.
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
    .map((row) => ({
      id: row.id,
      gameId: row.gameId!,
      isPrivate: row.visibility !== 'public',
      playerCount: row.playerCount,
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

/**
 * Ce qu'un DTO de salle lit d'un compte — et rien d'autre. `include: { user:
 * true }` chargeait la ligne User ENTIÈRE de chaque membre (passwordHash,
 * email, lastIp, bannissement…) à chaque sondage (alors toutes les 1,5-2 s
 * par joueur) pour n'en garder que quatre champs : des données sensibles qui
 * sortaient de la base pour rien. Toute nouvelle lecture s'ajoute ICI.
 */
const ROOM_MEMBER_USER_SELECT = {
  displayName: true,
  onlinePreferencesJson: true,
  onlineXp: true,
  role: true,
} as const

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
      members: { include: { user: { select: ROOM_MEMBER_USER_SELECT } }, orderBy: { joinedAt: 'asc' } },
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
        include: { user: { select: ROOM_MEMBER_USER_SELECT } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })

  if (!room) return null

  // Sièges des absents libérés AVANT de décrire la table : le sondage qui
  // constate l'absence renvoie déjà une table sans eux, hôte transmis compris
  // (purge gratuite tant que tout le monde est là — voir
  // purgeAbsentLobbyMembers).
  const purge = await purgeAbsentLobbyMembers(room, currentUserId)
  const purged = new Set(purge.absent)
  const hostUserId = purge.hostUserId
  const members = purged.size === 0 ? room.members : room.members.filter((m) => !purged.has(m.userId))

  const memberDtos = members.map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    isHost: m.userId === hostUserId,
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
    hostUserId,
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
      // `lastSeenAt` est rafraîchi par GET /rooms/[roomId] (au plus toutes
      // les PRESENCE_WRITE_INTERVAL_MS, soit 30 s — sous le sondage de 25 s
      // d'un lobby au flux SSE vivant, une réécriture toutes les ~50 s),
      // /join et /ready : un seul onglet ouvert suffit à garder la table en
      // vie, avec une marge de 4 min sous ce seuil. `none` couvre aussi le
      // cas « aucun membre du tout » (salle vide → supprimée immédiatement,
      // comme avant).
      members: { none: { lastSeenAt: { gte: cutoff } } },
    },
    select: { id: true, updatedAt: true },
  })
  if (stale.length === 0) return

  const ids = stale.map((r) => r.id)
  // Journal des parties : une salle revenue au lobby sans fin de partie peut
  // encore porter une ligne ouverte. Fermée AVANT la suppression, à la
  // dernière écriture de la salle (ne lève jamais : la purge passe quoi qu'il
  // arrive).
  await closeGameSessionsOfPurgedRooms(prisma, stale)
  await prisma.onlineRoom.deleteMany({ where: { id: { in: ids } } })
  // Des tables ouvertes viennent de disparaître : le guichet en cache doit
  // les oublier avant son prochain lecteur.
  invalidateLobbiesCache()
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
      // les deux : aucune écriture d'état ET plus personne vu depuis 60 min
      // (la présence s'écrit au plus toutes les 30 s, PRESENCE_WRITE_INTERVAL_MS :
      // sans conséquence à cette échelle).
      members: { none: { lastSeenAt: { gte: cutoff } } },
    },
    select: { id: true, updatedAt: true },
  })
  if (stale.length === 0) return

  const ids = stale.map((r) => r.id)
  // Journal des parties : la partie abandonnée s'est arrêtée au dernier coup
  // (`updatedAt`), pas 60 min plus tard à la purge. Fermée AVANT la
  // suppression, sans jamais faire échouer celle-ci.
  await closeGameSessionsOfPurgedRooms(prisma, stale)
  await prisma.onlineRoom.deleteMany({ where: { id: { in: ids } } })
  // Le compteur de parties en cours du guichet vient de changer.
  invalidateLobbiesCache()
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
/** Borne de coût : ce que la liste ramène au maximum, quoi qu'il arrive. */
const LIVE_ROOMS_SCAN_MAX = 60

/**
 * Tout ce que le guichet affiche : tables ouvertes + parties en cours.
 * Deux requêtes bornées au total : la première (buildLobbyList) sert les
 * tables ouvertes, la seconde ne lit que des scalaires et l'effectif des
 * parties en cours — aucun membre, donc aucun pseudo de partie lancée.
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

  // Une seule lecture, scalaires et effectif : le guichet n'ouvre plus les
  // membres des salles, puisqu'il ne nomme personne.
  const rooms = await prisma.onlineRoom.findMany({
    where: liveWhere,
    select: {
      id: true,
      gameId: true,
      status: true,
      visibility: true,
      createdAt: true,
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: LIVE_ROOMS_SCAN_MAX,
  })

  const { liveGames, liveGamesTotal } = summarizeLiveGames(
    rooms.map((room) => ({ ...room, playerCount: room._count.members }))
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

/**
 * Granularité d'écriture de la présence d'un membre (`lastSeenAt`).
 *
 * GET /rooms/[roomId] est sondé toutes les 25 s en lobby quand le flux SSE
 * est vivant, toutes les 2 s quand il est mort (1,5 s en partie — cf.
 * hooks/online-room-polling.ts) : réécrire `lastSeenAt` à chaque sondage
 * faisait, aux cadences serrées, 5 transactions d'écriture SQLite par seconde
 * pour 10 joueurs qui ne font qu'attendre. La présence ne sert qu'à des
 * seuils de MINUTES — purge des tables ouvertes (5 min,
 * cleanupStaleWaitingRooms), purge des parties (60 min,
 * cleanupStaleActiveRooms), tables « figées » de Supervision (3/5/10 min,
 * STALLED_MS) — et l'AFK se mesure sur `updatedAt` de la salle, pas ici.
 * Retard maximal de `lastSeenAt` : 30 s + un sondage, soit au pire ~55 s en
 * lobby flux vivant (le filtre ne laisse passer qu'un sondage de 25 s sur
 * deux, donc une écriture toutes les ~50 s ; Supervision peut afficher
 * jusqu'à ~55 s d'inactivité sur un lobby bien vivant). Le seuil le plus
 * court (3 min) garde une marge de 2 min. Tout nouveau seuil lu sur
 * `lastSeenAt` doit rester nettement au-dessus de cette valeur.
 */
export const PRESENCE_WRITE_INTERVAL_MS = 30 * 1000

/**
 * Rafraîchit la présence du membre — en base seulement si sa dernière trace
 * date de plus de PRESENCE_WRITE_INTERVAL_MS. Le filtre est dans le `where` :
 * un sondage qui n'a rien à écrire émet un UPDATE sans ligne touchée — un
 * verrou d'écriture SQLite bref, mais aucune page écrite ni fsync. Ce n'est
 * pas « aucune transaction » : ces UPDATE vides se sérialisent avec les
 * vraies écritures (coups, chat). Si la contention des écrivains apparaissait
 * sur le VPS, lire `lastSeenAt` d'abord (findUnique sur roomId_userId, index
 * existant) et n'émettre l'UPDATE que si la trace a plus de 30 s. `now` est
 * injectable pour les tests.
 */
export async function touchMemberPresence(
  roomId: string,
  userId: string,
  now: number = Date.now()
): Promise<void> {
  await prisma.onlineRoomMember.updateMany({
    where: { roomId, userId, lastSeenAt: { lt: new Date(now - PRESENCE_WRITE_INTERVAL_MS) } },
    data: { lastSeenAt: new Date(now) },
  })
}

/**
 * Salle en jeu restée sans la moindre écriture d'état au-delà du seuil de la
 * purge (STALE_ACTIVE_ROOM_MS) : sa partie est abandonnée depuis sa dernière
 * écriture, même si personne n'est encore passé la purger.
 */
export function isAbandonedActiveRoom(
  room: { status: string; updatedAt: Date },
  now: number = Date.now()
): boolean {
  return (
    (room.status === 'playing' || room.status === 'briefing') &&
    room.updatedAt.getTime() < now - STALE_ACTIVE_ROOM_MS
  )
}

/**
 * Journal des parties d'une salle supprimée HORS purge : départ du dernier
 * membre (DELETE /rooms/[roomId], deleteRoomIfEmpty) ou fermeture par le staff.
 * À appeler AVANT la suppression.
 *
 * En temps normal, la partie s'arrête maintenant, avec le motif de l'appelant
 * (durée estimée). Mais une partie abandonnée plus longtemps que le seuil de
 * purge (onglet fermé en pleine partie, retour trois heures plus tard pour
 * créer une table) serait datée à ce retour : c'est précisément l'artefact que
 * la purge évite. Elle est alors close comme la purge l'aurait fait :
 * 'abandoned', à la dernière écriture de la salle. Ne lève jamais : quitter une
 * table ne doit pas échouer à cause du journal.
 */
export async function closeGameSessionBeforeRoomDelete(
  room: { id: string; status: string; updatedAt: Date },
  reason: 'left' | 'staff',
  now: number = Date.now()
): Promise<void> {
  try {
    if (isAbandonedActiveRoom(room, now)) {
      await closeGameSessionsOfPurgedRooms(prisma, [{ id: room.id, updatedAt: room.updatedAt }])
      return
    }
    await closeGameSession(prisma, room.id, new Date(now), reason)
  } catch (error) {
    console.error('[game-sessions] fermeture avant suppression de salle échouée', error)
  }
}

/**
 * Supprime une salle si elle n'a plus aucun membre — évite les lobbys
 * fantômes quand un joueur en quitte une pour en créer/rejoindre une autre
 * (create/join retirent sa membership sans jamais passer par DELETE).
 */
export async function deleteRoomIfEmpty(roomId: string): Promise<void> {
  const remaining = await prisma.onlineRoomMember.count({ where: { roomId } })
  if (remaining === 0) {
    const room = await prisma.onlineRoom.findUnique({
      where: { id: roomId },
      select: { id: true, status: true, updatedAt: true },
    })
    if (!room) return
    // Journal des parties : le dernier membre vient de partir ailleurs, la
    // partie éventuelle s'arrête maintenant (durée estimée) — ou à sa dernière
    // écriture si elle était déjà abandonnée.
    await closeGameSessionBeforeRoomDelete(room, 'left')
    await prisma.onlineRoom.delete({ where: { id: roomId } }).catch(() => {})
    invalidateLobbiesCache()
  }
}

/**
 * Retire un membre de la table et, s'il en était l'hôte, passe la main au
 * plus ancien membre restant : une table dont l'hôte n'est plus membre ne peut
 * plus être ni lancée ni fermée par personne. Implémentation UNIQUE de
 * l'expulsion — remplacement pour inactivité (route action), expulsion au
 * lobby (DELETE /rooms/[roomId]/members/[userId]) et changement de table
 * (leaveOtherRooms) passent tous ici. Ne supprime pas une salle devenue vide :
 * c'est à l'appelant d'en décider (deleteRoomIfEmpty).
 */
export async function kickMember(roomId: string, hostUserId: string, kickedUserId: string): Promise<void> {
  await prisma.onlineRoomMember.deleteMany({ where: { roomId, userId: kickedUserId } })
  if (hostUserId === kickedUserId) {
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
  // L'effectif (et l'hôte) d'une table sont affichés au guichet.
  invalidateLobbiesCache()
}

/**
 * Un membre d'une table OUVERTE (statut waiting) non vu depuis ce délai est
 * retiré de la table (purgeAbsentLobbyMembers) : sans cela, l'onglet fermé
 * d'un ami parti se coucher garde son siège, et le lancement bute sur
 * « 4/5 prêts » jusqu'à ce que l'hôte force ou l'expulse à la main.
 * Rapporté à la présence : `lastSeenAt` ne s'écrit qu'au plus toutes les 30 s
 * (PRESENCE_WRITE_INTERVAL_MS) sur un sondage de 25 s en lobby au flux SSE
 * vivant — la trace d'un membre BIEN PRÉSENT peut donc avoir ~55 s. Deux
 * minutes laissent plus du double de marge, et un onglet passé une minute en
 * arrière-plan (sondage ralenti par le navigateur) survit. Reste sous les
 * 5 min de la purge des tables (cleanupStaleWaitingRooms) : les sièges se
 * libèrent avant que la table elle-même soit jugée abandonnée.
 */
export const ROOM_MEMBER_ABSENT_MS = 2 * 60 * 1000

/** Ce que la purge des absents lit d'une salle déjà chargée — rien de plus. */
export type AbsentPurgeRoom = {
  id: string
  status: string
  hostUserId: string
  members: { userId: string; lastSeenAt: Date }[]
}

/** Ce que la purge décide : les sièges à libérer, et à qui passe la main. */
export type AbsentLobbyPurgePlan = {
  /** userId qui ne sont plus à la table. */
  absent: string[]
  /** Nouvel hôte quand l'hôte est absent et qu'un autre est là — sinon null. */
  nextHostUserId: string | null
}

/**
 * Sièges à libérer sur une table ouverte : les membres non vus depuis
 * ROOM_MEMBER_ABSENT_MS, sauf `keepUserId`, celui pour qui la salle est
 * construite — il vient d'agir, il est là quoi que dise sa trace (les routes
 * ready/settings/team n'écrivent pas toutes la présence).
 *
 * L'hôte absent ne bloque plus la table : sans lui, personne ne peut ni
 * lancer (host_only_launch) ni expulser (not_host), et seule la purge des
 * tables (5 min, si TOUS sont absents) finissait par fermer. Il passe donc la
 * main au plus ancien membre à la trace FRAÎCHE — même règle que le départ
 * volontaire (kickMember) et la relance (dropAbsentMembers) — puis perd son
 * siège comme n'importe quel absent. Pas de successeur sur la seule bonne foi
 * de `keepUserId` : deux sondages concurrents doivent désigner le même, sans
 * quoi l'un pourrait retirer l'hôte que l'autre vient de nommer ; celui qui
 * agit avec une trace vieille sera vu au sondage suivant. Sans successeur,
 * l'hôte reste (table qui se vide : c'est cleanupStaleWaitingRooms). Rien
 * hors du statut waiting : en partie, l'absence se règle par le remplacement
 * AFK (replacement.ts). Pure, pour être testée sans base.
 */
export function planAbsentLobbyPurge(
  room: AbsentPurgeRoom,
  keepUserId: string | null,
  now: number = Date.now()
): AbsentLobbyPurgePlan {
  if (room.status !== 'waiting') return { absent: [], nextHostUserId: null }
  const cutoff = now - ROOM_MEMBER_ABSENT_MS
  const seen = (m: AbsentPurgeRoom['members'][number]) => m.lastSeenAt.getTime() >= cutoff
  const host = room.members.find((m) => m.userId === room.hostUserId)
  const hostAbsent = host !== undefined && host.userId !== keepUserId && !seen(host)
  const successor = hostAbsent
    ? (room.members.find((m) => m.userId !== room.hostUserId && seen(m)) ?? null)
    : null
  const absent = room.members
    .filter(
      (m) =>
        m.userId !== keepUserId &&
        !seen(m) &&
        (m.userId !== room.hostUserId || successor !== null)
    )
    .map((m) => m.userId)
  return { absent, nextHostUserId: successor?.userId ?? null }
}

/**
 * Retire de la table les membres absents (planAbsentLobbyPurge), passe la
 * main si l'hôte en fait partie, et prévient les clients. Appelée depuis
 * buildRoomDto (donc à chaque sondage) et à l'entrée d'un joueur (/join,
 * avant de compter les places), mais GRATUITE tant que personne n'est
 * absent : la décision se prend sur les membres déjà chargés pour le DTO,
 * sans lecture supplémentaire, et la base n'est touchée (un deleteMany, un
 * updateMany si la main passe) que lorsqu'un siège doit se libérer — c'est
 * pour cela qu'il n'y a ni throttle ni Map en mémoire. Deux sondages
 * concurrents peuvent viser les mêmes absents : le second n'efface rien
 * (count 0) et ne notifie personne ; le transfert d'hôte est un
 * compare-and-swap, et celui qui le perd n'efface rien ce tour-ci (l'autre
 * finit son geste, le sondage suivant repart d'une base fraîche). L'expulsé
 * verra 403 à son prochain sondage (handleRoomGone → « Tu n'es plus dans
 * cette table ») et pourra revenir par le code. Renvoie les userId qui ne
 * sont plus à la table et l'hôte tel qu'il faut le décrire.
 */
export async function purgeAbsentLobbyMembers(
  room: AbsentPurgeRoom,
  keepUserId: string | null,
  now: number = Date.now()
): Promise<{ absent: string[]; hostUserId: string }> {
  const { absent, nextHostUserId } = planAbsentLobbyPurge(room, keepUserId, now)
  if (absent.length === 0) return { absent, hostUserId: room.hostUserId }

  let hostUserId = room.hostUserId
  if (nextHostUserId) {
    const { count } = await prisma.onlineRoom.updateMany({
      where: { id: room.id, hostUserId: room.hostUserId },
      data: { hostUserId: nextHostUserId },
    })
    if (count === 0) return { absent: [], hostUserId }
    hostUserId = nextHostUserId
  }

  const { count } = await prisma.onlineRoomMember.deleteMany({
    where: { roomId: room.id, userId: { in: absent } },
  })
  if (count > 0 || hostUserId !== room.hostUserId) {
    // L'effectif (et l'hôte) de la table sont affichés au guichet ; les
    // clients encore branchés relisent la table (et l'absent y découvre son
    // 403).
    invalidateLobbiesCache()
    publishRoomChanged(room.id, { type: 'lobby' })
  }
  return { absent, hostUserId }
}

/**
 * Quitte toutes les AUTRES tables de l'utilisateur, avant d'en créer ou d'en
 * rejoindre une. Même contrat que DELETE /rooms/[roomId] : dans une partie en
 * cours, il est d'abord marqué « parti » dans l'état (adapter.markLeft) — la
 * table continue, le tour passe, un bot le remplace au bout du délai de grâce
 * (replacement.ts). Avant, create/join effaçaient l'adhésion sans toucher à
 * l'état : le joueur restait « au tour » dans le moteur sans plus être membre,
 * et la partie des autres se figeait jusqu'au remplacement AFK. Puis son siège
 * est libéré (transfert d'hôte compris), la salle supprimée si elle se vide,
 * et les clients prévenus : `changed` (avec la version) si la partie a bougé,
 * `lobby` sinon.
 */
export async function leaveOtherRooms(userId: string, exceptRoomId?: string): Promise<void> {
  const memberships = await prisma.onlineRoomMember.findMany({
    where: { userId, ...(exceptRoomId ? { roomId: { not: exceptRoomId } } : {}) },
    select: {
      room: {
        select: {
          id: true,
          status: true,
          hostUserId: true,
          gameId: true,
          gameStateJson: true,
          stateVersion: true,
        },
      },
    },
  })

  for (const { room } of memberships) {
    let stateVersion: number | null = null
    const adapter = getGameAdapter(room.gameId)
    if (adapter && room.status === 'playing') {
      const state = adapter.parse(room.gameStateJson)
      const next = state ? adapter.markLeft(state, userId, Date.now()) : null
      if (next) {
        // Compare-and-swap sur la version, comme /action : un coup joué entre
        // notre lecture et cette écriture gagne, et une salle disparue
        // entre-temps ne fait pas échouer le changement de table (updateMany
        // ne lève jamais sur zéro ligne). Le départ non marqué est rattrapé
        // par le remplacement AFK.
        const { count } = await prisma.onlineRoom.updateMany({
          where: { id: room.id, stateVersion: room.stateVersion },
          data: {
            gameStateJson: adapter.serialize(next),
            stateVersion: room.stateVersion + 1,
            // Un départ peut faire TOURNER le tour : même règle que DELETE.
            currentTurnUserId: adapter.isFinished(next) ? null : adapter.currentActorId(next),
          },
        })
        if (count > 0) stateVersion = room.stateVersion + 1
      }
    }
    await kickMember(room.id, room.hostUserId, userId)
    await deleteRoomIfEmpty(room.id)
    publishRoomChanged(
      room.id,
      stateVersion === null ? { type: 'lobby' } : { type: 'changed', stateVersion }
    )
  }
}
