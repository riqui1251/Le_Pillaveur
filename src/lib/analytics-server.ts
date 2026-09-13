import { prisma } from '@/lib/prisma'
import { ANALYTICS_CONSENT_GRANTED } from '@/lib/auth-cookies'
import type { DeviceKind } from '@/lib/device-from-user-agent'
import {
  accountKindSelect,
  countAccountsByKind,
  kindOfAccount,
  NON_LEGACY_ACCOUNT_WHERE,
  sessionExpiryDay,
} from '@/lib/account-kind-server'
import {
  buildGroupedVisitors,
  findIpSeenInNetwork,
  findSubjectKeysByIp,
  getIpsBySubjectKeys,
  getLinkedAccounts,
  isPresenceConnectedHere,
  recordIpSeen,
  subjectKeyFor,
  visitorPresenceSelect,
} from '@/lib/ip-history-server'
import { ipNetworkKey } from '@/lib/ip-network'
import { parisDayOffset, parisDayStartUtc, parisDayString } from '@/lib/paris-time'
import { isOnline, onlineSince } from '@/lib/presence'

/** Jour de Paris courant (AAAA-MM-JJ) — clé des DailyVisitor et des compteurs datés. */
export function todayParis(): string {
  return parisDayString()
}

/**
 * Jour de Paris d'il y a `days` jours. Délègue à l'arithmétique CALENDAIRE de
 * paris-time : l'ancien `setDate` dans le fuseau du processus (UTC en
 * production) doublait ou sautait un jour autour de minuit les jours de
 * changement d'heure.
 */
export function daysAgoParis(days: number): string {
  return parisDayOffset(days)
}

/**
 * Présence du NAVIGATEUR (SitePresence + DailyVisitor), pour une vue comme pour
 * un battement : consentement aux statistiques seulement, décidé en amont par
 * planPing. Ne touche JAMAIS le compte (voir recordAccountPresence) ni aucun
 * temps : l'ancien incrément de User.totalPresenceSeconds (60 s par requête,
 * quelle qu'elle soit) est retiré, la colonne n'est plus alimentée.
 *
 * lastIp est écrit par les deux signaux, dans le même upsert que lastSeen et
 * userSeenAt : « connecté ici » (isPresenceConnectedHere) garantit ainsi que
 * lastIp vient d'un signal connecté. Une vue sans IP laissait l'adresse d'une
 * navigation anonyme sous un navigateur ensuite « connecté », que la recherche
 * par IP rattachait au compte. L'historique IpSeenLog, lui, suit le battement
 * seul (route.ts).
 *
 * consentVersion est réécrit à chaque signal : la ligne est désormais celle
 * d'un accord de la version courante (couverture de la fiche, filet du
 * balayage sur les lignes de l'ancien '1').
 */
export async function recordVisitorPing(
  visitorId: string,
  options?: {
    country?: string | null
    userId?: string | null
    ip?: string | null
    device?: DeviceKind | null
  }
): Promise<void> {
  const now = new Date()
  const date = todayParis()
  const country = options?.country ?? null
  const userId = options?.userId ?? null
  const ip = options?.ip ?? null
  const device = options?.device && options.device !== 'unknown' ? options.device : null

  await prisma.$transaction([
    prisma.sitePresence.upsert({
      where: { visitorId },
      create: {
        visitorId,
        firstSeen: now,
        lastSeen: now,
        country,
        lastIp: ip,
        lastDevice: device,
        userId,
        userSeenAt: userId ? now : null,
        consentVersion: ANALYTICS_CONSENT_GRANTED,
      },
      update: {
        lastSeen: now,
        consentVersion: ANALYTICS_CONSENT_GRANTED,
        ...(country ? { country } : {}),
        ...(ip ? { lastIp: ip } : {}),
        ...(device ? { lastDevice: device } : {}),
        // userId n'est JAMAIS remis à null : sans session, il reste le dernier
        // compte vu sur ce navigateur. Seul userSeenAt dit si CE signal était
        // connecté (voir isPresenceConnectedHere, ip-history-server.ts) : une
        // vue qui avance lastSeen l'écrit donc aussi, comme un battement (et
        // lastIp avec, voir plus haut).
        ...(userId ? { userId, userSeenAt: now } : {}),
      },
    }),
    prisma.dailyVisitor.upsert({
      where: { visitorId_date: { visitorId, date } },
      create: { visitorId, date },
      update: {},
    }),
  ])
}

/**
 * Efface le suivi d'un NAVIGATEUR (lp_vid) : présence (IP, pays, appareil,
 * pseudos locaux, dernier compte vu), historique IP `visitor:<vid>` et, si
 * demandé, jours de visite. Une transaction : tout ou rien. Lève en cas
 * d'échec, à l'appelant de décider si c'est bloquant.
 * - refus ou retrait du consentement (accept-age) : jours de visite compris ;
 * - navigateur resté à l'ancien accord '1' (ping) : jours de visite gardés,
 *   comme la migration 20260912130100_legacy_consent_cleanup.
 */
export async function eraseVisitorTracking(
  visitorId: string,
  options: { dailyVisitors: boolean }
): Promise<void> {
  await prisma.$transaction([
    prisma.sitePresence.deleteMany({ where: { visitorId } }),
    prisma.ipSeenLog.deleteMany({ where: { subjectKey: subjectKeyFor(null, visitorId) } }),
    ...(options.dailyVisitors ? [prisma.dailyVisitor.deleteMany({ where: { visitorId } })] : []),
  ])
}

/**
 * Pseudos locaux d'un navigateur qui a accepté les statistiques (détection de
 * robots). Patch d'une présence EXISTANTE : updateMany ne crée aucune ligne et
 * n'avance pas lastSeen — une synchro de joueurs n'est pas une présence. Une
 * liste vide est écrite telle quelle (joueurs locaux tous supprimés).
 *
 * N'écrit que si la liste stockée DIFFÈRE (le OR sur null est nécessaire : un
 * NOT seul exclut les lignes NULL) : un renvoi à l'identique, depuis un autre
 * onglet ou après un rechargement, ne coûte aucune écriture.
 *
 * Renvoie vrai si la présence porte désormais cette liste (écrite, ou déjà
 * là) ; faux s'il n'existe aucune présence pour ce navigateur — synchro
 * perdue, que le client renverra après son prochain battement.
 */
export async function syncVisitorLocalPlayers(
  visitorId: string,
  localPlayerNames: string[]
): Promise<boolean> {
  const json = JSON.stringify(localPlayerNames)
  const { count } = await prisma.sitePresence.updateMany({
    where: { visitorId, OR: [{ localPlayerNames: null }, { NOT: { localPlayerNames: json } }] },
    data: {
      localPlayerCount: localPlayerNames.length,
      localPlayerNames: json,
    },
  })
  if (count > 0) return true
  // Rien d'écrit : liste déjà à jour, ou aucune présence à patcher.
  return (await prisma.sitePresence.count({ where: { visitorId } })) > 0
}

/**
 * Dernière activité du COMPTE, à chaque battement à session valide, avec ou
 * sans consentement aux statistiques de visite. Base : intérêt légitime
 * (sécurité et modération des comptes, statut « en ligne » visible des amis,
 * suppression des invités inactifs), déclaré dans la politique de
 * confidentialité. AUCUNE durée : totalPresenceSeconds n'est plus incrémenté.
 * Jamais appelée pour une vue ni pour une synchro de joueurs (planPing).
 * Aucune écriture SitePresence/DailyVisitor, aucun pseudo local stocké.
 */
export async function recordAccountPresence(
  userId: string,
  options?: {
    country?: string | null
    ip?: string | null
    device?: DeviceKind | null
  }
): Promise<void> {
  const country = options?.country ?? null
  const ip = options?.ip ?? null
  const device = options?.device && options.device !== 'unknown' ? options.device : null

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastSeenAt: new Date(),
      ...(country ? { lastCountry: country } : {}),
      ...(ip ? { lastIp: ip } : {}),
      ...(device ? { lastDevice: device } : {}),
    },
  })

  // subjectKey = `user:<id>` dès que userId est fourni : le visitorId est ignoré.
  await recordIpSeen(userId, '', ip, country)
}

export async function getVisitorStats() {
  const now = new Date()
  const since = onlineSince(now.getTime())
  const today = todayParis()
  const weekStart = daysAgoParis(6)
  const monthStart = daysAgoParis(29)

  const [onlineNow, todayCount, weekCount, monthCount, accountCounts] = await Promise.all([
    prisma.sitePresence.count({ where: { lastSeen: { gte: since } } }),
    prisma.dailyVisitor.count({ where: { date: today } }),
    prisma.dailyVisitor.groupBy({
      by: ['visitorId'],
      where: { date: { gte: weekStart } },
    }).then((rows) => rows.length),
    prisma.dailyVisitor.groupBy({
      by: ['visitorId'],
      where: { date: { gte: monthStart } },
    }).then((rows) => rows.length),
    // Décompte unique par type (account-kind-server) : mot de passe, Google
    // ET invités. L'ancien filtre `passwordHash ≠ ''` oubliait les deux derniers.
    countAccountsByKind(now),
  ])

  const onlinePresences = await prisma.sitePresence.findMany({
    where: { lastSeen: { gte: since } },
    select: { country: true },
  })

  const onlineByCountryMap = new Map<string, number>()
  for (const p of onlinePresences) {
    const key = p.country ?? '??'
    onlineByCountryMap.set(key, (onlineByCountryMap.get(key) ?? 0) + 1)
  }

  const onlineByCountry = [...onlineByCountryMap.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)

  // « Comptes connectés récemment » : User.lastSeenAt, écrit à chaque battement
  // à session valide AVEC OU SANS consentement (intérêt légitime), tous types de
  // comptes, invités compris. La liste partait des SitePresence récentes :
  // elle oubliait les comptes qui ont refusé les statistiques, et y rangeait
  // le dernier compte vu sur un navigateur actif mais déconnecté (cas diablo).
  // Legacy exclu, comme de la liste Comptes et des totaux.
  const recentUsers = await prisma.user.findMany({
    where: { AND: [NON_LEGACY_ACCOUNT_WHERE, { lastSeenAt: { gte: since } }] },
    orderBy: { lastSeenAt: 'desc' },
    take: 100,
    select: {
      ...accountKindSelect(now),
      id: true,
      displayName: true,
      accountCode: true,
      lastCountry: true,
      lastIp: true,
      lastDevice: true,
      lastSeenAt: true,
      role: true,
    },
  })

  const connectedUserIps = await getIpsBySubjectKeys(
    recentUsers.map((u) => subjectKeyFor(u.id, ''))
  )

  const connectedAccounts = recentUsers.map((u) => {
    const ips = connectedUserIps.get(subjectKeyFor(u.id, '')) ?? []
    const primaryIp = ips[0]?.ip ?? u.lastIp
    return {
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      accountCode: u.accountCode,
      accountKind: kindOfAccount(u),
      country: ips[0]?.country ?? u.lastCountry,
      ip: primaryIp,
      ips,
      lastDevice: u.lastDevice,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      role: u.role,
      online: isOnline(u.lastSeenAt, now.getTime()),
    }
  })

  // « Aujourd'hui » = depuis le minuit de PARIS, comme le compteur du jour
  // (DailyVisitor) : 24 h glissantes y mêlaient la soirée de la veille.
  const todayVisitorsByCountry = await prisma.sitePresence.groupBy({
    by: ['country'],
    where: { lastSeen: { gte: parisDayStartUtc(today) } },
    _count: { _all: true },
  })

  const visitorsTodayByCountry = todayVisitorsByCountry
    .map((row) => ({
      country: row.country,
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count)

  const recentPresences = await prisma.sitePresence.findMany({
    orderBy: { lastSeen: 'desc' },
    take: 200,
    select: visitorPresenceSelect,
  })

  const presenceUsers = await getLinkedAccounts(recentPresences, now)
  const visitorIpList = await buildGroupedVisitors(recentPresences, presenceUsers, now.getTime())

  return {
    visitors: {
      onlineNow,
      today: todayCount,
      week: weekCount,
      month: monthCount,
      onlineByCountry,
      visitorsTodayByCountry,
    },
    connectedAccounts,
    visitorIpList,
    accounts: {
      total: accountCounts.total,
      byKind: {
        password: accountCounts.password,
        google: accountCounts.google,
        guest: accountCounts.guest,
        guestOrphan: accountCounts.guestOrphan,
      },
    },
    generatedAt: now.toISOString(),
  }
}

/**
 * `exact` : l'adresse telle quelle (défaut, ouvert dès modérateur).
 * `network` : toutes les adresses du même réseau (ipNetworkKey : /64 en IPv6,
 * adresse entière en IPv4), réservé aux admins. Même réseau = même foyer ou
 * même lieu (bar, colocation), JAMAIS la même personne.
 */
export type IpLookupMode = 'exact' | 'network'

/**
 * Adresses connues d'un réseau, toutes sources de la recherche confondues
 * (historique IpSeenLog, dernière IP des navigateurs et des comptes), et sujets
 * de l'historique qui y sont passés. Parcours en JS : quelques centaines de
 * lignes, et le réseau ne se calcule pas en SQL.
 */
async function findAddressesInNetwork(
  networkKey: string
): Promise<{ ips: string[]; subjectKeys: string[] }> {
  const [seen, presenceIps, userIps] = await Promise.all([
    findIpSeenInNetwork(networkKey),
    prisma.sitePresence.findMany({
      where: { lastIp: { not: null } },
      distinct: ['lastIp'],
      select: { lastIp: true },
    }),
    prisma.user.findMany({
      where: { lastIp: { not: null } },
      distinct: ['lastIp'],
      select: { lastIp: true },
    }),
  ])
  const ips = new Set(seen.ips)
  for (const { lastIp } of [...presenceIps, ...userIps]) {
    if (lastIp && ipNetworkKey(lastIp) === networkKey) ips.add(lastIp)
  }
  return { ips: [...ips], subjectKeys: seen.subjectKeys }
}

/**
 * `visitorDetails` (admins seulement) : détail des navigateurs trouvés. Sans
 * lui, seuls leur identifiant et leur activité sortent — le bandeau n'affiche
 * que leur nombre, et un modérateur n'a pas accès aux cartes visiteurs.
 */
export async function lookupByIp(
  ip: string,
  mode: IpLookupMode = 'exact',
  { visitorDetails = false }: { visitorDetails?: boolean } = {}
) {
  const normalized = ip.trim()
  const now = new Date()
  const networkKey = mode === 'network' ? ipNetworkKey(normalized) : null

  const { ips: matchedIps, subjectKeys } =
    networkKey !== null
      ? await findAddressesInNetwork(networkKey)
      : { ips: [normalized], subjectKeys: await findSubjectKeysByIp(normalized) }

  const subjectUserIds = [
    ...new Set(
      subjectKeys
        .map((key) => (key.startsWith('user:') ? key.slice(5) : null))
        .filter(Boolean)
    ),
  ] as string[]

  const [users, presences] = await Promise.all([
    // Aucun filtre sur le moyen de connexion : comptes Google et invités
    // étaient introuvables par IP, alors que ce sont les plus faciles à
    // multiplier. Le type est servi à la place, pour les distinguer. Seuls
    // les comptes legacy restent exclus, comme de la liste et des totaux :
    // le bandeau « N comptes » ne doit pas annoncer un compte introuvable.
    prisma.user.findMany({
      where: {
        AND: [
          NON_LEGACY_ACCOUNT_WHERE,
          { OR: [{ lastIp: { in: matchedIps } }, { id: { in: subjectUserIds } }] },
        ],
      },
      select: {
        ...accountKindSelect(now),
        id: true,
        createdAt: true,
        displayName: true,
        email: true,
        accountCode: true,
        role: true,
        lastIp: true,
        lastCountry: true,
        lastSeenAt: true,
        banType: true,
        bannedUntil: true,
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
    }),
    prisma.sitePresence.findMany({
      where: { lastIp: { in: matchedIps } },
      orderBy: { lastSeen: 'desc' },
      take: 50,
      select: {
        visitorId: true,
        userId: true,
        userSeenAt: true,
        country: true,
        lastIp: true,
        lastSeen: true,
        firstSeen: true,
      },
    }),
  ])

  const userIpsMap = await getIpsBySubjectKeys(users.map((u) => subjectKeyFor(u.id, '')))

  // Comptes liés : seulement ceux des navigateurs CONNECTÉS au dernier ping,
  // et seulement pour le détail. userId seul n'est que le DERNIER compte vu :
  // la lastIp d'un navigateur déconnecté vient d'une navigation sans session,
  // jamais rattachée à une identité.
  const presenceUserIds = visitorDetails
    ? ([...new Set(presences.filter(isPresenceConnectedHere).map((p) => p.userId))] as string[])
    : []

  const linkedUsers =
    presenceUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: presenceUserIds } },
          select: {
            ...accountKindSelect(now),
            id: true,
            displayName: true,
            accountCode: true,
            role: true,
          },
        })
      : []

  const linkedById = new Map(linkedUsers.map((u) => [u.id, u]))

  return {
    ip: normalized,
    mode,
    // Mode réseau : clé du réseau et adresses retrouvées (y compris celle demandée si elle est connue).
    network: networkKey !== null ? { key: networkKey, ips: matchedIps } : null,
    accounts: users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      email: u.email,
      accountCode: u.accountCode,
      kind: kindOfAccount(u),
      // Au jour près (voir sessionExpiryDay) : de quoi ne pas dire « cookie
      // perdu » d'un invité dont seul le ping est bloqué.
      sessionExpiresAt: sessionExpiryDay(u),
      createdAt: u.createdAt.toISOString(),
      role: u.role,
      lastCountry: u.lastCountry,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      online: isOnline(u.lastSeenAt, now.getTime()),
      banned: Boolean(u.banType && (u.banType === 'permanent' || (u.bannedUntil && u.bannedUntil > new Date()))),
      ips: userIpsMap.get(subjectKeyFor(u.id, '')) ?? [],
    })),
    visitors: presences.map((p) => {
      const online = isOnline(p.lastSeen, now.getTime())
      if (!visitorDetails) return { visitorId: p.visitorId, online }
      // Identité servie seulement si le navigateur était connecté à ce compte
      // au dernier ping (isPresenceConnectedHere) : jamais le dernier compte vu.
      const identity =
        p.userId && isPresenceConnectedHere(p) ? linkedById.get(p.userId) : undefined
      return {
        visitorId: p.visitorId,
        userId: identity?.id ?? null,
        country: p.country,
        // Adresse qui a répondu à la recherche (utile en mode réseau).
        lastIp: p.lastIp,
        lastSeenAt: p.lastSeen.toISOString(),
        firstSeenAt: p.firstSeen.toISOString(),
        // Navigateur actif, pas le compte.
        online,
        connectedHere: identity !== undefined,
        displayName: identity?.displayName ?? null,
        accountCode: identity?.accountCode ?? null,
        accountKind: identity ? kindOfAccount(identity) : null,
        role: identity?.role ?? null,
      }
    }),
  }
}
