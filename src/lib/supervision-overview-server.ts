import { prisma } from '@/lib/prisma'
import { GAMES } from '@/lib/games'
import { canViewUserFeedback, canManageUsers } from '@/lib/roles'
import { feedbackTypeLabel, isFeedbackType } from '@/lib/feedback'
import { listFlaggedNameModerationUsers } from '@/lib/name-moderation-attempts-server'
import { getExcludedUserIds } from '@/lib/metrics-exclusions'
import { parisDayOffset, parisDayStartUtc, parisDayString, parisDaysBack } from '@/lib/paris-time'
import { cleanupAbandonedRooms } from '@/lib/online-room'
import { GAME_JOURNAL_SINCE } from '@/lib/online/game-sessions'

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

/**
 * Fenêtres des indicateurs de croissance (F45) — bornées, en jours. La
 * rétention J1 / J7, calculée ici sur `lastSeenAt` (un onglet oublié suffisait
 * à « retenir » un compte), est remplacée par les retours J+1 / J+7 par
 * cohorte de active-accounts-server.ts, tirés des visites et du journal.
 */
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

/** Fenêtres des indicateurs de jeu en ligne, en jours de Paris (aujourd'hui inclus). */
const ONLINE_PLAY_WINDOW_DAYS = { d1: 1, d7: 7, d30: 30 }
const ONLINE_LAUNCH_SERIES_DAYS = 14

const HOUR_MS = 60 * 60 * 1000

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
  /**
   * Compte visé, pour le lien vers sa fiche : un identifiant, jamais un
   * pseudo (résolu à la lecture). Null sans cible propre (action ancrée sur
   * son auteur, terme de modération).
   */
  targetUserId: string | null
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

/** Compteurs sur 1, 7 et 30 jours de Paris (aujourd'hui inclus). */
export type ParisDayWindows = { d1: number; d7: number; d30: number }

/**
 * Jeu en ligne tiré du JOURNAL DES PARTIES (OnlineGameSession), la seule
 * source qui compte chaque lancement — solo contre des bots, jeux sans
 * gagnant et revanches compris — pour TOUS les comptes, invités et comptes
 * sans consentement statistique compris (intérêt légitime, déjà déclaré).
 * Uniquement des effectifs : aucun nom, le compte n'est jamais nommé ici.
 */
export type OnlinePlayStats = {
  /** Jour de Paris où le journal a commencé (AAAA-MM-JJ) : rien avant. */
  journalSince: string
  /**
   * Comptes DISTINCTS ayant pris place dans une partie lancée depuis le minuit
   * de Paris d'aujourd'hui (d1), des 7 ou des 30 derniers jours de Paris.
   * Équipe (rôle ≠ 'user') et comptes de test (metrics-exclusions.ts) exclus,
   * comme dans le tableau des comptes actifs affiché sur le même écran ;
   * `guests` = dont comptes invités. Libellé « comptes », jamais « personnes ».
   */
  uniquePlayers: ParisDayWindows & { guests: ParisDayWindows }
  /** Comptes d'équipe écartés de `uniquePlayers` sur 30 jours (« + N équipe »). */
  staffExcluded: number
  /** Comptes de test écartés de `uniquePlayers` sur 30 jours. */
  testExcluded: number
  /**
   * Parties LANCÉES par jour de Paris sur 14 jours, du plus ancien au plus
   * récent. solo = au plus un humain (contre des bots), withHumans = deux
   * humains ou plus ; humains = sièges sans botName. Parties jouées par
   * l'équipe ou des comptes de test SEULS exclues.
   */
  launchesByDay: Array<{ day: string; solo: number; withHumans: number }>
  /**
   * Sièges humains SANS compte (ni compte ni bot) des parties lancées sur
   * 30 jours : compte supprimé depuis, ou humain jamais rattaché à un membre
   * au lancement — indiscernables en base. Comptés À PART : un compte supprimé
   * depuis sort de `uniquePlayers`, qui baisse donc après coup.
   */
  deletedSeats30: number
}

export type GrowthStats = {
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
  /** Joueurs uniques et parties lancées en ligne, depuis le journal (lot 4). */
  onlinePlay: OnlinePlayStats
  /** Fenêtres employées, pour afficher la définition exacte à l'écran. */
  windows: {
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

/**
 * Actions du staff qui VISENT un compte sans être une sanction : ancrées sur
 * la cible (`userId`), l'auteur dans `actorId`, comme un ban. Elles partent
 * donc avec le compte visé — sans objet une fois le compte supprimé.
 * - 'metrics-exclusion' : compte marqué (ou démarqué) « compte de test »,
 *   exclu des statistiques d'usage (metrics-exclusions.ts). Détail neutre
 *   'on' (marqué) ou 'off' (démarqué), traduit à la lecture.
 * Réservées aux admins : l'historique d'une fiche, ouvert dès modérateur, ne
 * les montre pas aux grades inférieurs.
 */
export const STAFF_TARGETED_ACTIONS = ['metrics-exclusion'] as const

/**
 * Journalise une action du staff : sans compte cible (voir
 * STAFF_SELF_ANCHORED_ACTIONS), ou sur un compte cible (STAFF_TARGETED_ACTIONS,
 * `targetUserId` obligatoire).
 *
 * `detail` est recopié tel quel et, pour une action sans cible, SURVIT à tout
 * compte supprimé ensuite (ancré sur l'auteur, jamais purgé) : il ne doit
 * porter ni pseudo, ni code de compte, ni email — seulement de quoi relire
 * l'action (type et rôle d'un compte supprimé en détail neutre `type:rôle`,
 * code de table, réglage). Même règle pour une action ciblée : la cible est
 * la référence du compte, son nom se résout à la lecture. Les lignes
 * 'account-delete' écrites avant cette règle ont été anonymisées par la
 * migration 20260912100000_anonymize_account_delete_log, et le balayage de
 * conservation anonymise toute ligne restée hors de ce format (écrite par un
 * ancien conteneur pendant un déploiement, ou après un retour arrière).
 */
export async function logStaffAction(
  params:
    | { actorId: string; action: (typeof STAFF_SELF_ANCHORED_ACTIONS)[number]; detail: string }
    | {
        actorId: string
        action: (typeof STAFF_TARGETED_ACTIONS)[number]
        targetUserId: string
        detail: string
      }
): Promise<void> {
  await prisma.accountBanEvent.create({
    data: {
      userId: 'targetUserId' in params ? params.targetUserId : params.actorId,
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

/**
 * Série 14 derniers jours de PARIS : visiteurs uniques (DailyVisitor, déjà
 * datés au jour de Paris) + parties distinctes (OnlineMatchResult,
 * dédupliquées par salle au sein d'un même jour de Paris).
 */
async function getDailySeries(days: number): Promise<DailyPoint[]> {
  const dates = parisDaysBack(days)
  const since = dates[0]
  const today = dates[dates.length - 1]

  const [visitorRows, matchRows] = await Promise.all([
    prisma.dailyVisitor.groupBy({
      by: ['date'],
      where: { date: { gte: since, lte: today } },
      _count: { _all: true },
    }),
    // Prisma stocke DateTime en SQLite comme entier (ms epoch, vérifié :
    // typeof(finishedAt) = 'integer'), pas en texte. SQLite ne connaît pas
    // Europe/Paris et le conteneur tourne en UTC : le regroupement par jour de
    // Paris se fait donc en JS. Pour ne pas remonter une ligne par joueur
    // toutes les 15 s, la base ne renvoie que les couples DISTINCTS (salle,
    // heure UTC) — l'avance de Paris sur UTC étant d'heures entières, une
    // heure UTC tombe tout entière dans un seul jour de Paris. Borne basse :
    // le minuit de PARIS du premier jour (le minuit UTC perdait les parties
    // finies entre 0 h et 2 h, heure de Paris).
    prisma.$queryRawUnsafe<Array<{ roomId: string; h: bigint | number }>>(
      `SELECT DISTINCT roomId, finishedAt / ${HOUR_MS} as h
       FROM OnlineMatchResult
       WHERE finishedAt >= ?`,
      parisDayStartUtc(since).getTime()
    ),
  ])

  const visitorsByDate = new Map(visitorRows.map((r) => [r.date, r._count._all]))
  const roomsByDate = new Map<string, Set<string>>()
  for (const row of matchRows) {
    const day = parisDayString(new Date(Number(row.h) * HOUR_MS))
    const rooms = roomsByDate.get(day) ?? new Set<string>()
    rooms.add(row.roomId)
    roomsByDate.set(day, rooms)
  }
  const partiesByDate = new Map([...roomsByDate].map(([day, rooms]) => [day, rooms.size]))

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

/** Partie du journal telle que la lit `getOnlinePlayStats` (voir la requête). */
export type OnlinePlaySessionRow = {
  startedAt: Date
  humanCount: number
  /** Sièges HUMAINS seulement (botName nul) : compte, ou compte supprimé. */
  humanSeats: Array<{ userId: string | null; user: { role: string; isGuest: boolean } | null }>
}

/**
 * Agrégation PURE des indicateurs de jeu en ligne (voir `OnlinePlayStats`).
 * Les fenêtres sont des jours de Paris : d7 part du minuit de Paris d'il y a
 * 6 jours, pas de « maintenant − 7 × 24 h ». Un lancement à 0 h 30 heure de
 * Paris (22 h 30 UTC la veille en été) compte bien pour aujourd'hui, quel que
 * soit le fuseau du conteneur.
 *
 * `excludedUserIds` = comptes de test : traités comme l'équipe (hors
 * effectifs, parties jouées par eux seuls non comptées), comptés à part.
 */
export function summarizeOnlinePlay(
  sessions: OnlinePlaySessionRow[],
  now: Date,
  excludedUserIds: readonly string[] = []
): OnlinePlayStats {
  const windowStartMs = (days: number) => parisDayStartUtc(parisDayOffset(days - 1, now)).getTime()
  const windows = (['d1', 'd7', 'd30'] as const).map((key) => ({
    sinceMs: windowStartMs(ONLINE_PLAY_WINDOW_DAYS[key]),
    players: new Set<string>(),
    guests: new Set<string>(),
  }))
  const oldestMs = windowStartMs(ONLINE_PLAY_WINDOW_DAYS.d30)
  const excluded = new Set(excludedUserIds)
  const staff = new Set<string>()
  const tests = new Set<string>()
  let deletedSeats30 = 0
  /** Siège d'un compte INTERNE : équipe (rôle) ou compte de test (liste). */
  const isInternal = (seat: OnlinePlaySessionRow['humanSeats'][number]) =>
    seat.user !== null && (seat.user.role !== 'user' || (seat.userId !== null && excluded.has(seat.userId)))

  const launches = new Map(
    parisDaysBack(ONLINE_LAUNCH_SERIES_DAYS, now).map((day) => [day, { day, solo: 0, withHumans: 0 }])
  )

  for (const session of sessions) {
    const startedMs = session.startedAt.getTime()
    // La requête borne déjà ; on ne se fie pas à l'appelant pour la fenêtre.
    if (startedMs < oldestMs) continue

    // Équipe et comptes de test exclus de la série aussi : une partie où tous
    // les humains sont internes (un essai de TryBotsGate) n'est pas une partie
    // de joueur. Une table équipe + joueur, elle, reste une partie de joueur.
    // Un siège sans compte (supprimé ou non rattaché) n'est pas présumé interne.
    const internalOnly = session.humanSeats.length > 0 && session.humanSeats.every(isInternal)
    const launch = internalOnly ? undefined : launches.get(parisDayString(session.startedAt))
    if (launch) {
      // Humains = sièges sans botName. `humanCount` ne compte que les sièges
      // RATTACHÉS à un compte au lancement : un humain non rattaché y passait
      // pour un bot. Le plus grand des deux, pour qu'une ligne sans sièges
      // écrits garde son effectif.
      const humans = Math.max(session.humanCount, session.humanSeats.length)
      if (humans >= 2) launch.withHumans += 1
      else launch.solo += 1
    }

    for (const seat of session.humanSeats) {
      if (!seat.userId || !seat.user) {
        deletedSeats30 += 1
        continue
      }
      if (seat.user.role !== 'user') {
        staff.add(seat.userId)
        continue
      }
      if (excluded.has(seat.userId)) {
        tests.add(seat.userId)
        continue
      }
      for (const span of windows) {
        if (startedMs < span.sinceMs) continue
        span.players.add(seat.userId)
        if (seat.user.isGuest) span.guests.add(seat.userId)
      }
    }
  }

  const [d1, d7, d30] = windows
  return {
    journalSince: GAME_JOURNAL_SINCE,
    uniquePlayers: {
      d1: d1.players.size,
      d7: d7.players.size,
      d30: d30.players.size,
      guests: { d1: d1.guests.size, d7: d7.guests.size, d30: d30.guests.size },
    },
    staffExcluded: staff.size,
    testExcluded: tests.size,
    launchesByDay: [...launches.values()],
    deletedSeats30,
  }
}

/**
 * Lecture du journal pour `summarizeOnlinePlay` : UNE requête bornée aux
 * 30 derniers jours de Paris (au plus 31 × 24 h), regroupée en JS — jamais une
 * requête par jour. Les sièges de bots ne sont pas remontés. Appelée
 * uniquement sous le cache de `getGrowthStats`.
 */
async function getOnlinePlayStats(now: Date): Promise<OnlinePlayStats> {
  const since = parisDayStartUtc(parisDayOffset(ONLINE_PLAY_WINDOW_DAYS.d30 - 1, now))
  const [rows, excludedUserIds] = await Promise.all([
    prisma.onlineGameSession.findMany({
      where: { startedAt: { gte: since } },
      select: {
        startedAt: true,
        humanCount: true,
        participants: {
          where: { botName: null },
          // Rôle et type lus À LA LECTURE via la relation : aucun pseudo, et un
          // compte supprimé depuis revient avec userId nul (SetNull).
          select: { userId: true, user: { select: { role: true, isGuest: true } } },
        },
      },
    }),
    // Même liste de comptes de test que le tableau des comptes actifs : les
    // deux blocs de la Vue d'ensemble comptent les mêmes joueurs.
    getExcludedUserIds(),
  ])
  return summarizeOnlinePlay(
    rows.map((row) => ({ startedAt: row.startedAt, humanCount: row.humanCount, humanSeats: row.participants })),
    now,
    excludedUserIds
  )
}

/**
 * Indicateurs de croissance (F45). Tout est dérivé de l'existant — dates de
 * création des comptes, historique des lancements de parties, journal des
 * parties, salles en cours — sans le moindre changement de schéma, et chaque
 * requête est bornée par une fenêtre de dates, un LIMIT, ou ne renvoie que
 * des comptages (aucune ligne chargée).
 *
 * Coûteux et lent à bouger : passer par `getGrowthStats()`, jamais appeler
 * directement depuis une boucle de rafraîchissement.
 */
async function computeGrowthStats(): Promise<GrowthStats> {
  const now = Date.now()
  // Bornes au minuit de PARIS, en arithmétique calendaire (paris-time) : une
  // fenêtre de « N jours » est faite de jours de Paris, comme les joueurs en
  // ligne, et ne glisse plus d'heure en heure. Jamais `now − N × 24 h`.
  const parisDayStartMs = (daysAgo: number) =>
    parisDayStartUtc(parisDayOffset(daysAgo, new Date(now))).getTime()

  // « Sur les N derniers jours » = N jours de Paris, aujourd'hui compris.
  const shareSince = new Date(parisDayStartMs(REGISTERED_SHARE_WINDOW_DAYS - 1))
  const playersSince = new Date(parisDayStartMs(PLAYERS_BY_GAME_WINDOW_DAYS - 1))

  const [registered, guests, gameRows, abandonedRows, onlinePlay] = await Promise.all([
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
    getOnlinePlayStats(new Date(now)),
  ])

  const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null)

  // « Partie abandonnée » ne peut se mesurer que sur le vivant : rien n'est
  // écrit quand une partie meurt sans résultat (voir le rapport). Le chiffre
  // affiché est donc celui des tables de JEU figées À L'INSTANT — celles
  // qu'on peut encore sauver — et le libellé doit le dire.
  const liveRooms = Number(abandonedRows[0]?.live ?? 0)
  const stalledRooms = Number(abandonedRows[0]?.stalled ?? 0)

  return {
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
    onlinePlay,
    windows: {
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
/** Incrémentée à chaque invalidation : un calcul lancé avant ne remplit pas le cache. */
let growthCacheGeneration = 0

/** Indicateurs de croissance, recalculés au plus une fois par GROWTH_CACHE_MS. */
export async function getGrowthStats(): Promise<GrowthStats> {
  if (growthCache && Date.now() - growthCache.at < GROWTH_CACHE_MS) return growthCache.value
  const generation = growthCacheGeneration
  const value = await computeGrowthStats()
  if (generation === growthCacheGeneration) growthCache = { at: Date.now(), value }
  return value
}

/**
 * Oublie le cache de la croissance : appelé quand la liste des comptes de test
 * change, pour que « Joueurs du jeu en ligne » suive la coche aussitôt que le
 * tableau des comptes actifs.
 */
export function invalidateGrowthStats(): void {
  growthCacheGeneration += 1
  growthCache = null
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
    // Compte de test exclu des statistiques : un réglage du site qui vise un
    // compte. Rendu comme un réglage (détail neutre 'on' / 'off', traduit à
    // l'écran) avec le lien vers la fiche de la cible — surtout pas « a
    // banni » par défaut.
    case 'metrics-exclusion':
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
      targetUserId: selfAnchored ? null : e.userId,
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
      targetUserId: g.userId,
      detail: g.cosmeticKey,
      createdAt: g.createdAt.toISOString(),
    })),
    ...featureBans.map((f) => ({
      id: `feature-${f.id}`,
      kind: 'feature-ban' as const,
      actorName: f.actor?.displayName ?? null,
      targetName: f.user.displayName,
      targetUserId: f.userId,
      detail: f.feature,
      createdAt: f.createdAt.toISOString(),
    })),
    ...terms.map((t) => ({
      id: `term-${t.id}`,
      kind: 'moderation-term' as const,
      actorName: t.addedById ? (termActorMap.get(t.addedById) ?? null) : null,
      targetName: null,
      targetUserId: null,
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
