import { prisma } from '@/lib/prisma'
import { GAMES } from '@/lib/games'
import { canViewUserFeedback, canManageUsers } from '@/lib/roles'
import { feedbackTypeLabel, isFeedbackType } from '@/lib/feedback'
import { listFlaggedNameModerationUsers } from '@/lib/name-moderation-attempts-server'
import { daysAgoParis, todayParis } from '@/lib/analytics-server'
import { cleanupAbandonedRooms } from '@/lib/online-room'

/**
 * Salles listées en Supervision. Les salles `cast` (afficheur TV d'un jeu
 * LOCAL) en font partie depuis G5 : invisibles, elles vivaient éternellement
 * sans que personne puisse les fermer.
 */
const LIVE_STATUSES = ['waiting', 'briefing', 'playing', 'cast']

/**
 * Une salle de cast n'a ni membre ni partie : son seul signe de vie est
 * `updatedAt`, réécrit à chaque image poussée par le téléphone. Au-delà de
 * 2 h sans image, la TV est éteinte depuis longtemps — la ligne ne sert plus
 * qu'à encombrer. (Le ménage des salles de JEU vit dans online-room.ts ;
 * celui-ci lui est jumelé ici faute de pouvoir y toucher — voir le rapport.)
 */
const STALE_CAST_ROOM_MS = 2 * 60 * 60 * 1000

/**
 * Seuil d'INACTIVITÉ au-delà duquel une table est signalée « figée » (F46) :
 * une partie vivante réécrit son état à chaque coup, un lobby vivant réécrit
 * la présence de ses membres toutes les 2 s. Volontairement bien en deçà des
 * seuils de purge (5 min en attente, 60 min en jeu) pour que l'exploitant
 * voie le blocage AVANT que la salle ne disparaisse toute seule.
 */
const STALLED_MS: Record<string, number> = {
  waiting: 3 * 60 * 1000,
  briefing: 5 * 60 * 1000,
  playing: 10 * 60 * 1000,
  cast: 30 * 60 * 1000,
}

/** Fenêtres des indicateurs de croissance (F45) — bornées, en jours. */
const RETENTION_D1_COHORT_DAYS = { from: 8, to: 2 }
const RETENTION_D7_COHORT_DAYS = { from: 21, to: 8 }
const REGISTERED_SHARE_WINDOW_DAYS = 30
const PLAYERS_BY_GAME_WINDOW_DAYS = 7

/**
 * Durée de vie du cache des indicateurs de croissance. Ces chiffres portent
 * sur des fenêtres de 7 à 30 JOURS : ils ne changent pas d'un tour de boucle
 * à l'autre, alors qu'ils coûtent plusieurs parcours de la table des comptes.
 * Ils sont donc sortis de la vue d'ensemble — rafraîchie toutes les 15 s
 * (F40) — vers leur propre route, appelée à l'OUVERTURE de l'onglet ; le
 * cache par-dessus absorbe les allers-retours entre onglets et les consoles
 * ouvertes en parallèle. Le prix à payer, c'est une donnée qui peut avoir
 * quelques minutes : l'écran affiche donc l'heure exacte du calcul, un
 * chiffre daté valant mieux qu'un chiffre qu'on croit frais.
 */
const GROWTH_CACHE_MS = 5 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

export type DailyPoint = { date: string; visitors: number; parties: number }

export type LiveTableStatus = 'waiting' | 'briefing' | 'playing' | 'cast'

export type LiveTable = {
  id: string
  code: string
  gameId: string | null
  gameTitle: string
  status: string
  visibility: string
  memberCount: number
  memberNames: string[]
  hostName: string | null
  /** Nom du joueur dont c'est le tour, quand le jeu en tient un. */
  currentTurnName: string | null
  createdAt: string
  updatedAt: string
  /** Dernier signe de vie : écriture d'état OU présence d'un membre. */
  lastActivityAt: string
  /** Secondes écoulées depuis ce dernier signe de vie. */
  idleSeconds: number
  /** Vrai quand l'inactivité dépasse le seuil du statut : table bloquée. */
  stalled: boolean
}

export type JournalKind =
  | 'ban'
  | 'unban'
  | 'feature-ban'
  | 'cosmetic-grant'
  | 'moderation-term'
  | 'role-change'
  | 'account-delete'
  | 'room-close'
  | 'site-setting'

export type JournalEntry = {
  id: string
  kind: JournalKind
  actorName: string | null
  targetName: string | null
  detail: string | null
  createdAt: string
}

export type QueueItem = {
  id: string
  kind: 'feedback' | 'name-flag'
  /** Id brut de la cible pour agir dessus (id du feedback, ou id du compte). */
  targetId: string
  title: string
  subtitle: string
  href: 'feedback' | 'accounts'
  createdAt: string
}

export type GrowthStats = {
  retentionD1: { cohort: number; retained: number; rate: number | null }
  retentionD7: { cohort: number; retained: number; rate: number | null }
  /**
   * PART des comptes enregistrés parmi les comptes CRÉÉS sur la fenêtre.
   * Ce n'est PAS un entonnoir de conversion : rien ne relie un compte
   * enregistré à l'éventuel compte invité qu'il utilisait avant, donc la
   * proportion d'invités qui « se sont ensuite inscrits » est hors de portée
   * sans changement de schéma. Le libellé doit dire « part », jamais
   * « conversion ».
   */
  registeredShare: { registered: number; guests: number; share: number | null }
  /**
   * Comptes ayant LANCÉ une partie en ligne de ce jeu sur la fenêtre.
   * Voir `computeGrowthStats` pour la source et les exclusions.
   */
  playersByGame: Array<{ gameId: string; gameTitle: string; players: number }>
  abandonedTables: { stalled: number; live: number; rate: number | null }
  /** Fenêtres employées, pour afficher la définition exacte à l'écran. */
  windows: {
    retentionD1CohortDays: [number, number]
    retentionD7CohortDays: [number, number]
    registeredShareDays: number
    playersByGameDays: number
  }
  /** Instant du calcul (ISO) : la donnée est mise en cache, donc datée. */
  computedAt: string
  /** Durée de vie du cache, en secondes — affichée telle quelle à l'écran. */
  cacheSeconds: number
}

/**
 * Actions du staff journalisées SANS compte cible propre (F42) : elles sont
 * ancrées sur l'AUTEUR (`userId` = `actorId`) faute d'un modèle d'audit
 * générique — `AccountBanEvent.userId` est obligatoire et en cascade. Elles
 * sont donc exclues de l'historique de modération affiché sur une fiche de
 * compte : ce ne sont pas des sanctions subies par ce compte.
 */
export const STAFF_SELF_ANCHORED_ACTIONS = ['account-delete', 'room-close', 'site-setting'] as const

/** Journalise une action du staff sans compte cible (voir ci-dessus). */
export async function logStaffAction(params: {
  actorId: string
  action: (typeof STAFF_SELF_ANCHORED_ACTIONS)[number]
  detail: string
}): Promise<void> {
  await prisma.accountBanEvent.create({
    data: {
      userId: params.actorId,
      actorId: params.actorId,
      action: params.action,
      comment: params.detail.slice(0, 300),
    },
  })
}

function gameTitleFor(gameId: string | null): string {
  if (!gameId) return gameId ?? ''
  return GAMES.find((g) => g.id === gameId)?.title ?? gameId
}

/** Série 14 derniers jours : visiteurs uniques (DailyVisitor) + parties distinctes (OnlineMatchResult, dédupliquées par salle). */
async function getDailySeries(days: number): Promise<DailyPoint[]> {
  const since = daysAgoParis(days - 1)
  const today = todayParis()

  const dates: string[] = []
  for (let i = days - 1; i >= 0; i -= 1) dates.push(daysAgoParis(i))

  const [visitorRows, matchRows] = await Promise.all([
    prisma.dailyVisitor.groupBy({
      by: ['date'],
      where: { date: { gte: since, lte: today } },
      _count: { _all: true },
    }),
    // Prisma stocke DateTime en SQLite comme entier (ms epoch), pas en texte —
    // date() ne sait pas le lire directement, il faut le modifieur 'unixepoch'
    // (qui attend des SECONDES, d'où le /1000). Bucket en jour calendaire UTC
    // (approximation suffisante pour une tendance, pas un décompte exact).
    prisma.$queryRawUnsafe<Array<{ d: string; c: bigint }>>(
      `SELECT date(finishedAt / 1000, 'unixepoch') as d, COUNT(DISTINCT roomId) as c
       FROM OnlineMatchResult
       WHERE finishedAt >= ?
       GROUP BY d`,
      new Date(`${since}T00:00:00.000Z`).getTime()
    ),
  ])

  const visitorsByDate = new Map(visitorRows.map((r) => [r.date, r._count._all]))
  const partiesByDate = new Map(matchRows.map((r) => [r.d, Number(r.c)]))

  return dates.map((date) => ({
    date,
    visitors: visitorsByDate.get(date) ?? 0,
    parties: partiesByDate.get(date) ?? 0,
  }))
}

/** Purge des salles de cast abandonnées (G5). */
export async function cleanupStaleCastRooms(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_CAST_ROOM_MS)
  const stale = await prisma.onlineRoom.findMany({
    where: { status: 'cast', updatedAt: { lt: cutoff } },
    select: { id: true },
  })
  if (stale.length === 0) return
  await prisma.onlineRoom.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } })
}

async function getLiveTables(): Promise<LiveTable[]> {
  // Purge les salles abandonnées (plus aucun tick client depuis 1h) avant de
  // lister : sinon les fantômes qui n'intéressent plus personne restent
  // affichés « en jeu » indéfiniment dans Supervision. Les salles de cast
  // suivent le même sort, avec leur propre seuil.
  await Promise.all([cleanupAbandonedRooms(), cleanupStaleCastRooms()])

  const roomSelect = {
    id: true,
    code: true,
    gameId: true,
    status: true,
    visibility: true,
    currentTurnUserId: true,
    createdAt: true,
    updatedAt: true,
    host: { select: { displayName: true } },
    // Effectif RÉEL : `members.length` était plafonné par le `take` ci-dessous.
    _count: { select: { members: true } },
    // Les 8 membres vus le plus récemment : le premier porte donc la présence
    // la plus fraîche, ce qui suffit à dater la salle.
    members: {
      select: { userId: true, lastSeenAt: true, user: { select: { displayName: true } } },
      orderBy: { lastSeenAt: 'desc' },
      take: 8,
    },
  } as const

  // DEUX requêtes bornées plutôt qu'une : les tables figées sont par
  // construction celles dont `updatedAt` est le plus ANCIEN — un simple
  // « 20 dernières modifiées » les aurait donc toutes coupées, c'est-à-dire
  // précisément ce que l'exploitant doit voir (F46).
  const [freshest, stalest] = await Promise.all([
    prisma.onlineRoom.findMany({
      where: { status: { in: LIVE_STATUSES } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: roomSelect,
    }),
    prisma.onlineRoom.findMany({
      where: { status: { in: LIVE_STATUSES } },
      orderBy: { updatedAt: 'asc' },
      take: 10,
      select: roomSelect,
    }),
  ])

  const byId = new Map([...freshest, ...stalest].map((room) => [room.id, room]))
  const rooms = [...byId.values()]

  const now = Date.now()

  const tables = rooms.map((r) => {
    const freshestPresence = r.members[0]?.lastSeenAt?.getTime() ?? 0
    const lastActivityMs = Math.max(r.updatedAt.getTime(), freshestPresence)
    const idleSeconds = Math.max(0, Math.round((now - lastActivityMs) / 1000))
    const threshold = STALLED_MS[r.status] ?? STALLED_MS.playing
    return {
      id: r.id,
      code: r.code,
      gameId: r.gameId,
      gameTitle: gameTitleFor(r.gameId),
      status: r.status,
      visibility: r.visibility,
      memberCount: r._count.members,
      memberNames: r.members.map((m) => m.user.displayName),
      hostName: r.host?.displayName ?? null,
      currentTurnName:
        r.members.find((m) => m.userId === r.currentTurnUserId)?.user.displayName ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      lastActivityAt: new Date(lastActivityMs).toISOString(),
      idleSeconds,
      stalled: idleSeconds * 1000 >= threshold,
    }
  })

  // Les tables bloquées d'abord : c'est ce que l'exploitant doit repérer.
  return tables.sort((a, b) => {
    if (a.stalled !== b.stalled) return a.stalled ? -1 : 1
    // Bloquées : la plus figée en tête. Vivantes : la plus fraîche en tête.
    return a.stalled ? b.idleSeconds - a.idleSeconds : a.idleSeconds - b.idleSeconds
  })
}

/**
 * Indicateurs de croissance (F45). Tout est dérivé de l'existant — dates de
 * création / dernière visite des comptes, historique des lancements de
 * parties, salles en cours — sans le moindre changement de schéma, et chaque
 * requête est bornée par une fenêtre de dates, un LIMIT, ou ne renvoie que
 * des comptages (aucune ligne chargée).
 *
 * Coûteux et lent à bouger : passer par `getGrowthStats()`, jamais appeler
 * directement depuis une boucle de rafraîchissement.
 */
async function computeGrowthStats(): Promise<GrowthStats> {
  const now = Date.now()

  // `lastSeenAt` ne garde que la DERNIÈRE visite : « revenu » se lit donc
  // « revu au moins N jours après son inscription », pas « revenu le jour N ».
  // La définition affichée à l'écran dit exactement cela.
  const retentionQuery = (cohort: { from: number; to: number }, gapDays: number) =>
    prisma.$queryRawUnsafe<Array<{ cohort: bigint; retained: bigint }>>(
      `SELECT COUNT(*) as cohort,
              SUM(CASE WHEN lastSeenAt IS NOT NULL AND lastSeenAt >= createdAt + ? THEN 1 ELSE 0 END) as retained
       FROM User
       WHERE email IS NOT NULL AND isGuest = 0
         AND createdAt >= ? AND createdAt < ?`,
      gapDays * DAY_MS,
      now - cohort.from * DAY_MS,
      now - cohort.to * DAY_MS
    )

  const shareSince = new Date(now - REGISTERED_SHARE_WINDOW_DAYS * DAY_MS)
  const playersSince = new Date(now - PLAYERS_BY_GAME_WINDOW_DAYS * DAY_MS)

  const [d1Rows, d7Rows, registered, guests, gameRows, abandonedRows] = await Promise.all([
    retentionQuery(RETENTION_D1_COHORT_DAYS, 1),
    retentionQuery(RETENTION_D7_COHORT_DAYS, 7),
    prisma.user.count({
      where: { createdAt: { gte: shareSince }, email: { not: null }, isGuest: false },
    }),
    prisma.user.count({ where: { createdAt: { gte: shareSince }, isGuest: true } }),
    // Source = OnlineGameHistory, écrite pour CHAQUE membre à CHAQUE
    // lancement de partie en ligne (`recordGameHistory`), tous jeux confondus.
    // OnlineMatchResult, l'ancienne source, ne convenait pas : plusieurs jeux
    // ne produisent aucun résultat classé (pas de gagnant), et les parties à
    // un seul humain n'en produisent pas non plus — le chiffre ignorait donc
    // des jeux entiers tout en s'annonçant « joueurs actifs ». Restent
    // exclues, faute de compte à qui les rattacher : les parties LOCALES
    // (même appareil) et le mode TV. Le libellé et la définition à l'écran
    // doivent dire « en ligne » et nommer cette exclusion.
    // COUNT(*) suffit : la table est unique par (userId, gameId), donc une
    // ligne = un joueur, et `lastPlayedAt` porte le DERNIER lancement de ce
    // couple — la fenêtre est donc exacte, sans doublon.
    prisma.$queryRawUnsafe<Array<{ gameId: string; players: bigint }>>(
      `SELECT gameId, COUNT(*) as players
       FROM OnlineGameHistory
       WHERE lastPlayedAt >= ?
       GROUP BY gameId
       ORDER BY players DESC
       LIMIT 12`,
      playersSince.getTime()
    ),
    // Comptage RÉEL des tables figées, en base et sans charger une seule
    // ligne : le dérivé de la liste affichée était plafonné par ses `take`
    // (30 lignes), donc faux dès qu'il y a du monde. Même définition que la
    // colonne `stalled` de la liste — inactivité = plus récent entre
    // l'écriture d'état de la salle et la présence de ses membres — et mêmes
    // seuils par statut, sinon les deux écrans se contrediraient. Les salles
    // `cast` (afficheur TV) sont hors sujet : aucune partie à abandonner.
    prisma.$queryRawUnsafe<Array<{ live: bigint | null; stalled: bigint | null }>>(
      `SELECT COUNT(*) as live,
              SUM(CASE WHEN MAX(r.updatedAt, COALESCE(m.lastSeen, 0)) < CASE r.status
                    WHEN 'waiting' THEN ?
                    WHEN 'briefing' THEN ?
                    ELSE ? END
                  THEN 1 ELSE 0 END) as stalled
       FROM OnlineRoom r
       LEFT JOIN (
         SELECT roomId, MAX(lastSeenAt) as lastSeen FROM OnlineRoomMember GROUP BY roomId
       ) m ON m.roomId = r.id
       WHERE r.status IN ('waiting', 'briefing', 'playing')`,
      now - STALLED_MS.waiting,
      now - STALLED_MS.briefing,
      now - STALLED_MS.playing
    ),
  ])

  const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null)

  const d1Cohort = Number(d1Rows[0]?.cohort ?? 0)
  const d1Retained = Number(d1Rows[0]?.retained ?? 0)
  const d7Cohort = Number(d7Rows[0]?.cohort ?? 0)
  const d7Retained = Number(d7Rows[0]?.retained ?? 0)

  // « Partie abandonnée » ne peut se mesurer que sur le vivant : rien n'est
  // écrit quand une partie meurt sans résultat (voir le rapport). Le chiffre
  // affiché est donc celui des tables de JEU figées À L'INSTANT — celles
  // qu'on peut encore sauver — et le libellé doit le dire.
  const liveRooms = Number(abandonedRows[0]?.live ?? 0)
  const stalledRooms = Number(abandonedRows[0]?.stalled ?? 0)

  return {
    retentionD1: { cohort: d1Cohort, retained: d1Retained, rate: ratio(d1Retained, d1Cohort) },
    retentionD7: { cohort: d7Cohort, retained: d7Retained, rate: ratio(d7Retained, d7Cohort) },
    registeredShare: {
      registered,
      guests,
      share: ratio(registered, registered + guests),
    },
    playersByGame: gameRows.map((row) => ({
      gameId: row.gameId,
      gameTitle: gameTitleFor(row.gameId),
      players: Number(row.players),
    })),
    abandonedTables: {
      stalled: stalledRooms,
      live: liveRooms,
      rate: ratio(stalledRooms, liveRooms),
    },
    windows: {
      retentionD1CohortDays: [RETENTION_D1_COHORT_DAYS.from, RETENTION_D1_COHORT_DAYS.to],
      retentionD7CohortDays: [RETENTION_D7_COHORT_DAYS.from, RETENTION_D7_COHORT_DAYS.to],
      registeredShareDays: REGISTERED_SHARE_WINDOW_DAYS,
      playersByGameDays: PLAYERS_BY_GAME_WINDOW_DAYS,
    },
    computedAt: new Date(now).toISOString(),
    cacheSeconds: Math.round(GROWTH_CACHE_MS / 1000),
  }
}

/**
 * Cache mémoire des indicateurs, partagé par toutes les consoles du même
 * processus. Volontairement en mémoire : la donnée est reconstructible, sa
 * perte au redéploiement ne coûte qu'un recalcul.
 */
let growthCache: { at: number; value: GrowthStats } | null = null

/** Indicateurs de croissance, recalculés au plus une fois par GROWTH_CACHE_MS. */
export async function getGrowthStats(): Promise<GrowthStats> {
  if (growthCache && Date.now() - growthCache.at < GROWTH_CACHE_MS) return growthCache.value
  const value = await computeGrowthStats()
  growthCache = { at: Date.now(), value }
  return value
}

/** Nature d'entrée de journal déduite de l'action stockée sur AccountBanEvent. */
function journalKindForAction(action: string): JournalKind | null {
  switch (action) {
    case 'unban':
      return 'unban'
    case 'role-change':
      return 'role-change'
    case 'account-delete':
      return 'account-delete'
    case 'room-close':
      return 'room-close'
    case 'site-setting':
      return 'site-setting'
    // Les acquittements (feedback, pseudo) ne sont pas des actes de journal :
    // ils encombreraient la liste sans rien apprendre.
    case 'feedback-ack':
    case 'name-flag-ack':
      return null
    default:
      return 'ban'
  }
}

async function getJournal(limit = 20): Promise<JournalEntry[]> {
  const [banEvents, grants, featureBans, terms] = await Promise.all([
    prisma.accountBanEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
      include: {
        user: { select: { displayName: true } },
        actor: { select: { displayName: true } },
      },
    }),
    prisma.cosmeticGrant.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { displayName: true } },
        grantedBy: { select: { displayName: true } },
      },
    }),
    prisma.featureBan.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { displayName: true } },
        actor: { select: { displayName: true } },
      },
    }),
    prisma.moderationTerm.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
  ])

  const termActorIds = [...new Set(terms.map((t) => t.addedById).filter((id): id is string => Boolean(id)))]
  const termActors = termActorIds.length
    ? await prisma.user.findMany({ where: { id: { in: termActorIds } }, select: { id: true, displayName: true } })
    : []
  const termActorMap = new Map(termActors.map((u) => [u.id, u.displayName]))

  const accountEntries: JournalEntry[] = []
  for (const e of banEvents) {
    const kind = journalKindForAction(e.action)
    if (!kind) continue
    const selfAnchored = (STAFF_SELF_ANCHORED_ACTIONS as readonly string[]).includes(e.action)
    accountEntries.push({
      id: `ban-${e.id}`,
      kind,
      actorName: e.actor?.displayName ?? null,
      // Une action ancrée sur son auteur n'a pas de « cible » : le détail
      // porte le sujet réel (compte supprimé, code de table, réglage).
      targetName: selfAnchored ? null : e.user.displayName,
      detail: e.comment,
      createdAt: e.createdAt.toISOString(),
    })
  }

  const entries: JournalEntry[] = [
    ...accountEntries,
    ...grants.map((g) => ({
      id: `grant-${g.id}`,
      kind: 'cosmetic-grant' as const,
      actorName: g.grantedBy?.displayName ?? null,
      targetName: g.user.displayName,
      detail: g.cosmeticKey,
      createdAt: g.createdAt.toISOString(),
    })),
    ...featureBans.map((f) => ({
      id: `feature-${f.id}`,
      kind: 'feature-ban' as const,
      actorName: f.actor?.displayName ?? null,
      targetName: f.user.displayName,
      detail: f.feature,
      createdAt: f.createdAt.toISOString(),
    })),
    ...terms.map((t) => ({
      id: `term-${t.id}`,
      kind: 'moderation-term' as const,
      actorName: t.addedById ? (termActorMap.get(t.addedById) ?? null) : null,
      targetName: null,
      detail: t.term,
      createdAt: t.createdAt.toISOString(),
    })),
  ]

  return entries
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

async function getQueue(actorRole: string): Promise<QueueItem[]> {
  const items: QueueItem[] = []

  if (canViewUserFeedback(actorRole)) {
    const openFeedback = await prisma.userFeedback.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      // Surtout PAS `screenshots` : ce sont des images base64, et cette file
      // est rechargée en boucle (F40).
      select: {
        id: true,
        type: true,
        message: true,
        createdAt: true,
        user: { select: { displayName: true } },
      },
    })
    for (const f of openFeedback) {
      items.push({
        id: `feedback-${f.id}`,
        kind: 'feedback',
        targetId: f.id,
        title: isFeedbackType(f.type) ? feedbackTypeLabel(f.type) : f.type,
        subtitle: `${f.user?.displayName ?? 'Anonyme'} — ${f.message.length > 80 ? `${f.message.slice(0, 80)}…` : f.message}`,
        href: 'feedback',
        createdAt: f.createdAt.toISOString(),
      })
    }
  }

  if (canManageUsers(actorRole)) {
    const flagged = await listFlaggedNameModerationUsers(10)
    for (const f of flagged) {
      items.push({
        id: `flag-${f.user.id}`,
        kind: 'name-flag',
        targetId: f.user.id,
        title: f.user.displayName,
        subtitle: `${f.profanityAttemptCount} tentative(s) de pseudo bloquées`,
        href: 'accounts',
        createdAt: (f.user.nameModerationWarnedAt ?? new Date(0)).toISOString(),
      })
    }
  }

  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15)
}

/**
 * Vue d'ensemble RAFRAÎCHIE EN BOUCLE (15 s) : uniquement ce qui bouge à la
 * minute. Les indicateurs de croissance n'en font plus partie — ils vivent
 * sur `/api/admin/growth` (voir GROWTH_CACHE_MS).
 */
export async function getSupervisionOverview(actorRole: string) {
  const [dailySeries, liveTables, journal, queue] = await Promise.all([
    getDailySeries(14),
    getLiveTables(),
    getJournal(20),
    getQueue(actorRole),
  ])

  return { dailySeries, liveTables, journal, queue }
}
