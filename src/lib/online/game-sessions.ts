import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { GAMES } from '@/lib/games'
import { onlineUserIdFromPlayerId } from '@/lib/online-players'

/**
 * JOURNAL DES PARTIES EN LIGNE — écriture et lecture.
 *
 * L'exploitant veut voir ce qui a été LANCÉ, pas seulement ce qui a été
 * gagné : `OnlineGameHistory` n'est qu'un compteur par couple (joueur, jeu) et
 * `OnlineMatchResult` n'existe que pour les parties terminées AVEC classement
 * — plusieurs jeux n'en produisent aucun, et une partie abandonnée ne laissait
 * rien du tout. La ligne naît donc au lancement (`recordGameSessionStart`) et
 * se ferme quand la partie s'arrête, quelle qu'en soit la façon — avec la
 * MEILLEURE date connue et son motif (`endReason`), qui dit si la durée est sûre :
 *  - la partie se termine → `closeGameSession` depuis `recordMatchResults`
 *    ('finished', maintenant) ;
 *  - une revanche repart  → la ligne précédente est fermée et une NOUVELLE est
 *    ouverte (c'est une autre partie, même salle) ('rematch', maintenant) ;
 *  - le dernier membre s'en va, ou le compte hôte est supprimé ('left',
 *    maintenant) ; le staff ferme la table ('staff', maintenant) — sauf table
 *    déjà abandonnée au-delà du seuil de purge, close comme par la purge
 *    (closeGameSessionBeforeRoomDelete, online-room.ts) ;
 *  - la salle abandonnée est purgée ('abandoned', dernière écriture de la salle) ;
 *  - ce qui a échappé à tout cela → `closeOrphanGameSessions`, la réconciliation
 *    passée avant chaque lecture de la Supervision. Elle ne date JAMAIS une fin
 *    à l'heure de lecture : une partie abandonnée le vendredi et lue le lundi
 *    « durait » sinon trois jours.
 *
 * RGPD : voir le commentaire du modèle `OnlineGameSessionPlayer` — aucun
 * pseudo humain n'est recopié ici, le nom est résolu à la lecture.
 */

/** Client Prisma OU client de transaction (recordMatchResults passe les deux). */
type Db = PrismaClient | Prisma.TransactionClient

/**
 * Jour de Paris où le journal a commencé (migration 20260910140000) : rien
 * avant, et aucune reconstitution possible. À afficher (« tenu depuis le… »)
 * partout où l'on compte des parties à partir de ce journal.
 */
export const GAME_JOURNAL_SINCE = '2026-09-10'

/** Pourquoi une partie s'est arrêtée — colonne `OnlineGameSession.endReason`. */
export type GameSessionEndReason = 'finished' | 'rematch' | 'left' | 'staff' | 'abandoned' | 'unknown'

const END_REASONS: readonly GameSessionEndReason[] = [
  'finished',
  'rematch',
  'left',
  'staff',
  'abandoned',
  'unknown',
]

/** Ce que vaut la durée enregistrée d'une partie. */
export type DurationReliability = 'reliable' | 'estimated' | 'unknown'

/**
 * Fiabilité de la durée selon le motif de fermeture :
 *  - 'reliable'  : la fin a été vue au moment où elle a eu lieu (fin de partie,
 *    relance d'une revanche) ;
 *  - 'estimated' : fin datée au départ du dernier membre, à la fermeture par le
 *    staff ou à la dernière écriture de la salle abandonnée — la table a pu se
 *    vider AVANT, et un joueur parti tôt compte pour toute la durée ;
 *  - 'unknown'   : salle disparue sans fermeture (endedAt = startedAt), ou
 *    ligne antérieure à la colonne (NULL). À exclure des totaux.
 */
export function durationReliabilityOf(reason: GameSessionEndReason | null): DurationReliability {
  switch (reason) {
    case 'finished':
    case 'rematch':
      return 'reliable'
    case 'left':
    case 'staff':
    case 'abandoned':
      return 'estimated'
    default:
      return 'unknown'
  }
}

/**
 * Lit la colonne : NULL reste NULL (ligne antérieure au motif), une valeur
 * hors liste — qu'aucun code n'écrit — est traitée comme 'unknown' plutôt que
 * de passer pour une durée sûre.
 */
export function parseEndReason(value: string | null): GameSessionEndReason | null {
  if (value === null) return null
  return (END_REASONS as readonly string[]).includes(value)
    ? (value as GameSessionEndReason)
    : 'unknown'
}

/**
 * Âge au-delà duquel une partie encore « en cours » est forcément morte :
 * une salle de jeu abandonnée est purgée au bout d'une heure, et aucune soirée
 * ne tient 12 h sur la même partie. Sans ce plafond, une salle qui aurait
 * échappé à toutes les purges laisserait une ligne « en cours » éternelle.
 * C'est aussi la durée maximale qu'écrit la réconciliation (orphanSessionEnd).
 */
const MAX_OPEN_SESSION_MS = 12 * 60 * 60 * 1000

/** Nombre de lignes réconciliées par passage — le ménage reste borné. */
const RECONCILE_BATCH = 200

/** Repli quand le moteur ne nomme pas ses pions (voir `botName` ci-dessous). */
const DEFAULT_BOT_NAME = 'Bot'

/** Joueur tel que les moteurs le sérialisent (contrat commun des adaptateurs). */
type StatePlayer = { id: string; name: string | null; isBot: boolean }

/**
 * Lit la table de jeu dans l'état sérialisé. Tous les moteurs respectent la
 * convention `players: [{ id, isBot?, ... }]` (voir game-adapters.ts), donc un
 * parcours générique suffit — et un jeu qui n'en aurait pas retombe sur les
 * membres de la salle plutôt que de faire échouer le journal.
 */
function parseStatePlayers(gameStateJson: string | null): StatePlayer[] | null {
  if (!gameStateJson) return null
  try {
    const parsed = JSON.parse(gameStateJson) as { players?: unknown }
    if (!Array.isArray(parsed.players)) return null
    const players: StatePlayer[] = []
    for (const raw of parsed.players) {
      if (!raw || typeof raw !== 'object') continue
      const p = raw as { id?: unknown; name?: unknown; isBot?: unknown }
      if (typeof p.id !== 'string') continue
      players.push({
        id: p.id,
        name: typeof p.name === 'string' ? p.name : null,
        isBot: Boolean(p.isBot),
      })
    }
    return players.length > 0 ? players : null
  } catch {
    return null
  }
}

/**
 * Ouvre la ligne de journal d'une partie qui vient d'être lancée.
 *
 * Appelée APRÈS le lancement : c'est lui qui écrit l'état de la partie, et
 * c'est là que se trouvent les bots (ils ne sont pas membres de la salle).
 * Ne lève jamais : un journal muet vaut mieux qu'un lancement raté.
 */
export async function recordGameSessionStart(roomId: string): Promise<void> {
  try {
    const room = await prisma.onlineRoom.findUnique({
      where: { id: roomId },
      select: {
        code: true,
        gameId: true,
        visibility: true,
        gameStateJson: true,
        members: { select: { userId: true }, orderBy: { joinedAt: 'asc' } },
      },
    })
    if (!room?.gameId) return

    const memberIds = room.members.map((m) => m.userId)
    const memberSet = new Set(memberIds)
    const statePlayers = parseStatePlayers(room.gameStateJson)

    /**
     * Un pion du moteur (bot de complément) est identifié par son PROPRE
     * drapeau, jamais par déduction : plusieurs jeux préfixent l'id de leurs
     * joueurs (`online-<userId>`, cf. src/lib/online-players.ts), si bien
     * qu'un humain pouvait échouer au test d'appartenance et retomber dans la
     * branche « bot » — c'est-à-dire voir son PSEUDO recopié dans `botName`,
     * exactement ce que ce journal s'interdit (le nom d'un humain doit rester
     * résolu à la lecture, pour disparaître avec son compte).
     * `botName` non nul distingue à la lecture un bot d'un compte supprimé.
     */
    const compteDe = (id: string): string | null => {
      const direct = memberSet.has(id) ? id : null
      if (direct) return direct
      const sansPrefixe = onlineUserIdFromPlayerId(id)
      return sansPrefixe && memberSet.has(sansPrefixe) ? sansPrefixe : null
    }
    const participants: { seat: number; userId: string | null; botName: string | null }[] =
      statePlayers
        ? statePlayers.map((p, seat) => {
            if (p.isBot) return { seat, userId: null, botName: p.name ?? DEFAULT_BOT_NAME }
            const userId = compteDe(p.id)
            // Humain non rattaché à un membre (départ pendant le lancement,
            // convention d'id inconnue) : on garde le siège SANS le nommer.
            return { seat, userId, botName: null }
          })
        : memberIds.map((userId, seat) => ({ seat, userId, botName: null }))

    // Humain = tout siège qui n'est pas un pion du moteur, rattaché ou non : un
    // humain non rattaché (userId nul, botName nul) ne gonfle plus le nombre
    // de bots (botCount = playerCount − humanCount à la lecture).
    const humanCount = participants.filter((p) => p.botName === null).length
    const now = new Date()

    // La revanche relance la MÊME salle : la partie précédente est close ici,
    // sinon deux lignes « en cours » cohabiteraient pour une seule table. Sa
    // fin est vue à l'instant où elle a lieu : durée sûre.
    await closeGameSession(prisma, roomId, now, 'rematch')

    await prisma.onlineGameSession.create({
      data: {
        roomId,
        code: room.code,
        gameId: room.gameId,
        // Figée ici : la salle peut changer de visibilité après coup (ou
        // disparaître), or c'est bien ce qu'elle était AU LANCEMENT qui décide
        // de ce que le guichet a le droit de raconter de cette partie.
        visibility: room.visibility,
        startedAt: now,
        playerCount: participants.length,
        humanCount,
        participants: {
          create: participants.map((p) => ({
            seat: p.seat,
            userId: p.userId,
            botName: p.botName,
          })),
        },
      },
    })
  } catch (error) {
    console.error('recordGameSessionStart failed:', error)
  }
}

/**
 * Ferme la partie en cours d'une salle. Retourne le nombre de lignes fermées.
 *
 * `endedAt` et `reason` vont ensemble : c'est l'appelant qui sait QUAND la
 * partie s'est arrêtée, donc ce que vaut la durée (voir durationReliabilityOf).
 *
 * Le client peut venir d'un test qui ne connaît pas ce modèle (les résultats
 * de partie s'y simulent avec un faux client) : on préfère ne rien journaliser
 * plutôt que de casser une fin de partie.
 */
export async function closeGameSession(
  client: Db,
  roomId: string,
  endedAt: Date = new Date(),
  reason: GameSessionEndReason = 'finished'
): Promise<number> {
  const model = (client as PrismaClient).onlineGameSession
  if (!model) return 0
  const { count } = await model.updateMany({
    where: { roomId, endedAt: null },
    data: { endedAt, endReason: reason },
  })
  return count
}

/**
 * Fin d'une partie abandonnée : la dernière écriture de la salle, bornée à
 * [startedAt, startedAt + 12 h]. La borne basse absorbe les quelques
 * millisecondes entre l'écriture du lancement et l'ouverture de la ligne (une
 * partie où personne n'a joué un coup) ; la borne haute arrête une salle que
 * des onglets oubliés font encore « jouer ».
 */
function lastRoomWriteWithin(startedAt: Date, roomUpdatedAt: Date): Date {
  const start = startedAt.getTime()
  return new Date(Math.min(Math.max(roomUpdatedAt.getTime(), start), start + MAX_OPEN_SESSION_MS))
}

/**
 * Purges des salles abandonnées (online-room.ts) : ferme, AVANT le deleteMany,
 * les parties encore ouvertes de ces salles, datées à la DERNIÈRE ÉCRITURE de
 * la salle (`updatedAt`, réécrit à chaque coup, `updateMany` compris — voir
 * room-updated-at.test.ts) plutôt qu'à l'heure de la purge, qui n'arrive qu'après 5 min
 * (lobby) ou 60 min (partie) d'inactivité.
 *
 * Une lecture pour toutes les salles, puis une écriture par partie ouverte
 * (en pratique : aucune ou une) — la date dépend du début de CHAQUE ligne,
 * d'où l'écriture ligne par ligne. Ne lève JAMAIS : ce ménage passe sur des
 * chemins d'affichage (buildLobbyList), il ne doit ni les faire échouer ni
 * empêcher la purge. En cas d'échec, la réconciliation prend le relais
 * (salle disparue → 'unknown').
 */
export async function closeGameSessionsOfPurgedRooms(
  client: Db,
  rooms: { id: string; updatedAt: Date }[]
): Promise<number> {
  const model = (client as PrismaClient).onlineGameSession
  if (!model || rooms.length === 0) return 0
  try {
    const updatedAtByRoom = new Map(rooms.map((r) => [r.id, r.updatedAt]))
    const open = await model.findMany({
      where: { roomId: { in: [...updatedAtByRoom.keys()] }, endedAt: null },
      select: { id: true, roomId: true, startedAt: true },
    })
    let closed = 0
    for (const session of open) {
      const roomUpdatedAt = updatedAtByRoom.get(session.roomId)
      if (!roomUpdatedAt) continue
      const { count } = await model.updateMany({
        where: { id: session.id, endedAt: null },
        data: {
          endedAt: lastRoomWriteWithin(session.startedAt, roomUpdatedAt),
          endReason: 'abandoned',
        },
      })
      closed += count
    }
    return closed
  } catch (error) {
    console.error('[game-sessions] fermeture avant purge échouée', error)
    return 0
  }
}

/**
 * Suppression de compte (deleteUserAccount) : ses salles partent en CASCADE
 * avec lui (OnlineRoom.host), sans passer par aucun des points de fermeture
 * ci-dessus — la ligne tombait en 'unknown'. On lit donc leurs identifiants
 * AVANT, et on rend la fermeture sous forme de requête NON lancée, à placer
 * dans la transaction de suppression devant le `user.delete` : l'hôte parti,
 * la table s'arrête maintenant ('left'). Tableau vide s'il n'héberge rien.
 */
export async function prepareHostedGameSessionsClose(
  userId: string,
  endedAt: Date = new Date()
): Promise<Prisma.PrismaPromise<Prisma.BatchPayload>[]> {
  const rooms = await prisma.onlineRoom.findMany({
    where: { hostUserId: userId },
    select: { id: true },
  })
  if (rooms.length === 0) return []
  const reason: GameSessionEndReason = 'left'
  return [
    prisma.onlineGameSession.updateMany({
      where: { roomId: { in: rooms.map((r) => r.id) }, endedAt: null },
      data: { endedAt, endReason: reason },
    }),
  ]
}

/**
 * Date et motif de fermeture d'une partie restée ouverte, ou null si elle
 * tourne encore. Fonction pure (`now` injectable), testée sans base :
 *  - salle DISPARUE sans que rien ne ferme la ligne : on ne sait rien de sa
 *    fin, on n'invente rien → endedAt = startedAt, 'unknown' (durée exclue) ;
 *  - salle présente qui ne joue plus (retour au lobby), ou partie au-delà du
 *    plafond : dernière écriture de la salle, bornée à [startedAt, startedAt
 *    + 12 h] → 'abandoned' (même règle que les purges).
 */
export function orphanSessionEnd(
  session: { startedAt: Date },
  room: { status: string; updatedAt: Date } | null,
  now: number = Date.now()
): { endedAt: Date; endReason: GameSessionEndReason } | null {
  if (!room) return { endedAt: new Date(session.startedAt.getTime()), endReason: 'unknown' }

  // La salle qui EXISTE encore ne suffit pas : après une partie terminée ou un
  // retour au lobby (revanche refusée, table rouverte), elle reste en base avec
  // un autre statut. Ne compter comme « encore en jeu » que ce qui joue
  // vraiment, sinon la ligne restait ouverte jusqu'au plafond de 12 h.
  const stillPlaying = room.status === 'playing' || room.status === 'briefing'
  if (stillPlaying && session.startedAt.getTime() + MAX_OPEN_SESSION_MS >= now) return null

  return { endedAt: lastRoomWriteWithin(session.startedAt, room.updatedAt), endReason: 'abandoned' }
}

/**
 * Réconciliation : ferme les parties restées « en cours » alors que plus rien
 * ne tourne — ce qui a échappé aux fermetures listées en tête de fichier
 * (lignes d'avant le motif, fermeture en échec, retour au lobby sans fin de
 * partie), ou partie qui a dépassé le plafond ci-dessus. Le journal ne peut
 * pas être notifié de la disparition d'une salle (aucune clé étrangère, c'est
 * voulu), donc on rapproche les deux tables au moment de lire le journal —
 * mais la date écrite ne dépend JAMAIS de ce moment (voir orphanSessionEnd).
 */
export async function closeOrphanGameSessions(): Promise<number> {
  const open = await prisma.onlineGameSession.findMany({
    where: { endedAt: null },
    select: { id: true, roomId: true, startedAt: true },
    orderBy: { startedAt: 'asc' },
    take: RECONCILE_BATCH,
  })
  if (open.length === 0) return 0

  const rooms = await prisma.onlineRoom.findMany({
    where: { id: { in: [...new Set(open.map((s) => s.roomId))] } },
    select: { id: true, status: true, updatedAt: true },
  })
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const now = Date.now()

  // Une date par ligne, donc une écriture par ligne fermée (quelques-unes au
  // plus). `endedAt: null` dans le filtre : une fin de partie survenue entre
  // la lecture et l'écriture garde sa date sûre.
  let closed = 0
  for (const session of open) {
    const end = orphanSessionEnd(session, roomById.get(session.roomId) ?? null, now)
    if (!end) continue
    const { count } = await prisma.onlineGameSession.updateMany({
      where: { id: session.id, endedAt: null },
      data: end,
    })
    closed += count
  }
  return closed
}

export type GameSessionParticipant = {
  id: string
  /** 'bot' = pion du moteur ; 'deleted' = compte supprimé depuis (RGPD). */
  kind: 'account' | 'bot' | 'deleted'
  /** Nom résolu À LA LECTURE — null pour un compte supprimé. */
  name: string | null
  userId: string | null
}

export type GameSessionRow = {
  id: string
  roomId: string
  code: string
  gameId: string
  gameTitle: string
  startedAt: string
  /** Null = partie encore en cours. */
  endedAt: string | null
  /**
   * Null tant que la partie tourne. Durée de la TABLE, jamais celle d'un
   * joueur (participants figés au lancement). Vaut 0 pour 'unknown'.
   */
  durationSeconds: number | null
  /** Null = partie en cours, ou ligne antérieure au motif (10-12/09/2026). */
  endReason: GameSessionEndReason | null
  /** 'unknown' tant que la partie tourne (sans objet) : lire `endedAt` d'abord. */
  durationReliability: DurationReliability
  playerCount: number
  humanCount: number
  botCount: number
  participants: GameSessionParticipant[]
}

export type GameSessionsPage = { sessions: GameSessionRow[]; total: number }

function gameTitleFor(gameId: string): string {
  return GAMES.find((g) => g.id === gameId)?.title ?? gameId
}

/**
 * Page du journal, la plus récente d'abord. Les participants voyagent avec
 * leur partie : une page bornée en porte quelques dizaines, ce qui coûte moins
 * qu'une requête par ligne dépliée.
 *
 * `userId` : seulement les parties où ce compte a un SIÈGE (index
 * OnlineGameSessionPlayer.userId). Un compte supprimé n'a plus de siège
 * nominatif (SetNull) : le filtre ne le retrouve pas, c'est voulu.
 */
export async function listGameSessions(args: {
  skip: number
  take: number
  userId?: string
}): Promise<GameSessionsPage> {
  const where: Prisma.OnlineGameSessionWhereInput | undefined = args.userId
    ? { participants: { some: { userId: args.userId } } }
    : undefined
  const [rows, total] = await Promise.all([
    prisma.onlineGameSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: args.skip,
      take: args.take,
      include: {
        participants: {
          orderBy: { seat: 'asc' },
          select: {
            id: true,
            userId: true,
            botName: true,
            user: { select: { displayName: true } },
          },
        },
      },
    }),
    prisma.onlineGameSession.count({ where }),
  ])

  const sessions = rows.map((s) => {
    const participants: GameSessionParticipant[] = s.participants.map((p) => {
      if (p.userId === null && p.botName !== null) {
        return { id: p.id, kind: 'bot', name: p.botName, userId: null }
      }
      // `userId` vidé par la suppression du compte (SetNull), ou humain jamais
      // rattaché à un membre au lancement : la ligne reste, mais elle ne nomme
      // personne (« compte supprimé ou non rattaché »).
      if (!p.user) return { id: p.id, kind: 'deleted', name: null, userId: null }
      return { id: p.id, kind: 'account', name: p.user.displayName, userId: p.userId }
    })
    const endReason = parseEndReason(s.endReason)
    return {
      id: s.id,
      roomId: s.roomId,
      code: s.code,
      gameId: s.gameId,
      gameTitle: gameTitleFor(s.gameId),
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      durationSeconds: s.endedAt
        ? Math.max(0, Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000))
        : null,
      endReason,
      durationReliability: durationReliabilityOf(endReason),
      playerCount: s.playerCount,
      humanCount: s.humanCount,
      botCount: Math.max(0, s.playerCount - s.humanCount),
      participants,
    }
  })

  return { sessions, total }
}

// ─── Guichet public : les dernières parties lancées ──────────────────────────

/**
 * Taille de l'indicateur « dernières parties lancées » du guichet (/jeux).
 * Le journal, lui, remonte bien plus loin — c'est la Supervision qui le lit.
 */
export const RECENT_LAUNCHES_MAX = 10

/** Ligne brute du journal, réduite aux scalaires dont le guichet a besoin. */
export type RecentLaunchRow = {
  id: string
  gameId: string
  visibility: string
  playerCount: number
  startedAt: Date
}

/**
 * Une partie lancée, telle que le guichet a le droit de la raconter.
 *
 * Même règle que `LiveGameItem` (src/lib/online-room.ts) : une table qui
 * n'était pas PUBLIQUE au lancement ne livre ni son jeu, ni son effectif —
 * elle n'est qu'une trace de vie horodatée. Aucun pseudo ne sort d'ici, quelle
 * que soit la visibilité : le journal nomme ses joueurs pour l'exploitant, pas
 * pour les visiteurs.
 *
 * `id` est celui de la LIGNE DE JOURNAL : il n'ouvre aucune route (le code de
 * table et l'identifiant de salle, eux, restent au chaud), il ne sert qu'à
 * donner une clé stable à la liste.
 */
export type RecentLaunchItem = {
  id: string
  /** null = table non publique. */
  gameId: string | null
  /** null pour la même raison. */
  playerCount: number | null
  startedAgoMinutes: number
}

/**
 * Met en forme et anonymise les dernières parties lancées.
 * Fonction pure (`now` injectable) pour rester testable sans base.
 */
export function summarizeRecentLaunches(
  rows: RecentLaunchRow[],
  now: number = Date.now()
): RecentLaunchItem[] {
  return rows
    .map((row) => {
      const isPublic = row.visibility === 'public'
      return {
        id: row.id,
        gameId: isPublic ? row.gameId : null,
        playerCount: isPublic ? row.playerCount : null,
        startedAgoMinutes: Math.max(0, Math.floor((now - row.startedAt.getTime()) / 60000)),
      }
    })
    .sort((a, b) => a.startedAgoMinutes - b.startedAgoMinutes)
}

/**
 * Les dernières parties lancées, la plus fraîche en tête. Une seule requête
 * bornée, sur l'index `startedAt`, et uniquement des scalaires : les
 * participants ne sont PAS chargés — ils n'ont rien à faire au guichet.
 */
export async function listRecentLaunches(
  limit: number = RECENT_LAUNCHES_MAX
): Promise<RecentLaunchItem[]> {
  const rows = await prisma.onlineGameSession.findMany({
    orderBy: { startedAt: 'desc' },
    take: Math.max(1, Math.min(limit, RECENT_LAUNCHES_MAX)),
    select: { id: true, gameId: true, visibility: true, playerCount: true, startedAt: true },
  })
  return summarizeRecentLaunches(rows)
}
