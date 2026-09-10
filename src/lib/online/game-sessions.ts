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
 * se ferme quand la partie s'arrête, quelle qu'en soit la façon :
 *  - la partie se termine → `closeGameSession` depuis `recordMatchResults` ;
 *  - une revanche repart  → la ligne précédente est fermée et une NOUVELLE est
 *    ouverte (c'est une autre partie, même salle) ;
 *  - la table est fermée ou la salle purgée → `closeOrphanGameSessions`, la
 *    réconciliation passée avant chaque lecture de la Supervision.
 *
 * RGPD : voir le commentaire du modèle `OnlineGameSessionPlayer` — aucun
 * pseudo humain n'est recopié ici, le nom est résolu à la lecture.
 */

/** Client Prisma OU client de transaction (recordMatchResults passe les deux). */
type Db = PrismaClient | Prisma.TransactionClient

/**
 * Âge au-delà duquel une partie encore « en cours » est forcément morte :
 * une salle de jeu abandonnée est purgée au bout d'une heure, et aucune soirée
 * ne tient 12 h sur la même partie. Sans ce plafond, une salle qui aurait
 * échappé à toutes les purges laisserait une ligne « en cours » éternelle.
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

    const humanCount = participants.filter((p) => p.userId !== null).length
    const now = new Date()

    // La revanche relance la MÊME salle : la partie précédente est close ici,
    // sinon deux lignes « en cours » cohabiteraient pour une seule table.
    await prisma.onlineGameSession.updateMany({
      where: { roomId, endedAt: null },
      data: { endedAt: now },
    })

    await prisma.onlineGameSession.create({
      data: {
        roomId,
        code: room.code,
        gameId: room.gameId,
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
 * Le client peut venir d'un test qui ne connaît pas ce modèle (les résultats
 * de partie s'y simulent avec un faux client) : on préfère ne rien journaliser
 * plutôt que de casser une fin de partie.
 */
export async function closeGameSession(
  client: Db,
  roomId: string,
  endedAt: Date = new Date()
): Promise<number> {
  const model = (client as PrismaClient).onlineGameSession
  if (!model) return 0
  const { count } = await model.updateMany({
    where: { roomId, endedAt: null },
    data: { endedAt },
  })
  return count
}

/**
 * Réconciliation : ferme les parties restées « en cours » alors que plus rien
 * ne tourne — table fermée par le staff, salle purgée après abandon, ou partie
 * qui a dépassé le plafond ci-dessus. Le journal ne peut pas être notifié de
 * la disparition d'une salle (aucune clé étrangère, c'est voulu), donc on
 * rapproche les deux tables au moment de lire le journal.
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
    select: { id: true, status: true },
  })
  // La salle qui EXISTE encore ne suffit pas : après une partie terminée ou un
  // retour au lobby (revanche refusée, table rouverte), elle reste en base avec
  // un autre statut. Ne compter comme « encore en jeu » que ce qui joue
  // vraiment, sinon la ligne restait ouverte jusqu'au plafond de 12 h.
  const liveRooms = new Set(
    rooms.filter((r) => r.status === 'playing' || r.status === 'briefing').map((r) => r.id)
  )
  const tooOld = Date.now() - MAX_OPEN_SESSION_MS

  const staleIds = open
    .filter((s) => !liveRooms.has(s.roomId) || s.startedAt.getTime() < tooOld)
    .map((s) => s.id)
  if (staleIds.length === 0) return 0

  const { count } = await prisma.onlineGameSession.updateMany({
    where: { id: { in: staleIds } },
    data: { endedAt: new Date() },
  })
  return count
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
  /** Null tant que la partie tourne. */
  durationSeconds: number | null
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
 */
export async function listGameSessions(args: {
  skip: number
  take: number
}): Promise<GameSessionsPage> {
  const [rows, total] = await Promise.all([
    prisma.onlineGameSession.findMany({
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
    prisma.onlineGameSession.count(),
  ])

  const sessions = rows.map((s) => {
    const participants: GameSessionParticipant[] = s.participants.map((p) => {
      if (p.userId === null && p.botName !== null) {
        return { id: p.id, kind: 'bot', name: p.botName, userId: null }
      }
      // `userId` vidé par la suppression du compte (SetNull) : la ligne reste,
      // mais elle ne nomme plus personne.
      if (!p.user) return { id: p.id, kind: 'deleted', name: null, userId: null }
      return { id: p.id, kind: 'account', name: p.user.displayName, userId: p.userId }
    })
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
      playerCount: s.playerCount,
      humanCount: s.humanCount,
      botCount: Math.max(0, s.playerCount - s.humanCount),
      participants,
    }
  })

  return { sessions, total }
}
