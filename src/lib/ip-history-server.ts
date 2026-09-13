import { Prisma } from '@prisma/client'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { AccountKind } from '@/lib/account-kind'
import { accountKindSelect, kindOfAccount } from '@/lib/account-kind-server'
import { ipNetworkKey } from '@/lib/ip-network'
import { isOnline, onlineSince } from '@/lib/presence'
import {
  analyzePlayerNamesForBot,
  extractNamesFromUserLocalPlayersJson,
  parseStoredLocalPlayerNamesJson,
  type BotSignals,
} from '@/lib/visitor-local-players'

export type IpEntry = {
  ip: string
  country: string | null
  lastSeenAt: string
  firstSeenAt: string
}

/** Dernier compte vu sur un navigateur qui n'y est plus connecté (carte browser). */
export type LastAccountSeen = {
  userId: string
  displayName: string
  accountCode: string | null
  role: string
  accountKind: AccountKind
  /** User.lastSeenAt : activité du COMPTE, tous appareils confondus. */
  lastSeenAt: string | null
}

/**
 * Carte de la liste Visiteurs. Deux sortes, jamais mêlées :
 * - `account` (subjectKey user:<id>) : les navigateurs CONNECTÉS à ce compte au
 *   dernier ping. Pseudo, email, code et rôle sont ceux du compte ;
 * - `browser` (subjectKey visitor:<vid>) : un navigateur NON connecté au
 *   dernier ping. Pseudo, email, code, rôle et userId valent null — le compte
 *   qui s'y était connecté, s'il y en a eu un, est dans `lastAccount`.
 * Une carte ne dit plus « diablo · En ligne » pour un navigateur actif dont le
 * compte n'a plus de session depuis deux jours.
 */
export type GroupedVisitor = {
  subjectKey: string
  cardType: 'account' | 'browser'
  /** Navigateur le plus récent de la carte. */
  visitorId: string
  /** Compte de la carte (carte account) ; null pour une carte browser. */
  userId: string | null
  displayName: string | null
  email: string | null
  accountCode: string | null
  role: string | null
  /** Pays de l'entrée la plus récente parmi `ips` et `browserIps`. */
  country: string | null
  /**
   * Pays du dernier ping du navigateur le plus récent (SitePresence.country).
   * `country` peut venir d'un AUTRE appareil du compte (historique user:<id>) :
   * l'en-tête « navigateur » de la carte lit celui-ci.
   */
  browserCountry: string | null
  /** IP de l'entrée la plus récente parmi `ips` et `browserIps`. */
  primaryIp: string | null
  lastDevice: string | null
  /** Navigateurs regroupés dans la carte : plusieurs pour un compte connecté sur plusieurs navigateurs. */
  browserCount: number
  /** IP du sujet de la carte : user:<id> (carte account) ou visitor:<vid> (carte browser). */
  ips: IpEntry[]
  /**
   * Carte account : IP de ses navigateurs vus HORS connexion (visitor:<vid>),
   * affichées à part et JAMAIS fusionnées dans `ips` — sur un PC partagé, ce
   * peut être la navigation d'un tiers. Toujours [] pour une carte browser.
   */
  browserIps: IpEntry[]
  localPlayerNames: string[]
  localPlayerCount: number
  botSignals: BotSignals
  /** SitePresence.lastSeen : activité du NAVIGATEUR, pas du compte. */
  lastSeenAt: string
  /** Navigateur actif (SitePresence.lastSeen dans la fenêtre). */
  online: boolean
  /** Le dernier ping de ce navigateur portait une session valide. */
  connectedHere: boolean
  /** Type du compte de la carte, ou du dernier compte vu (carte browser) ; null sans compte. */
  accountKind: AccountKind | null
  /** User.lastSeenAt de ce compte. */
  accountLastSeenAt: string | null
  /** Le COMPTE est actif quelque part, éventuellement sur un autre appareil. */
  accountOnline: boolean
  lastAccount: LastAccountSeen | null
}

type IpSeenRow = {
  id: string
  subjectKey: string
  ip: string
  country: string | null
  // $queryRaw rend ces DATETIME (texte ISO en base) sous forme de Date.
  firstSeen: string | Date
  lastSeen: string | Date
}

function newRowId(): string {
  return randomBytes(16).toString('hex')
}

function isoOf(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value
}

function rowToEntry(row: IpSeenRow): IpEntry {
  return {
    ip: row.ip,
    country: row.country,
    lastSeenAt: isoOf(row.lastSeen),
    firstSeenAt: isoOf(row.firstSeen),
  }
}

export function subjectKeyFor(userId: string | null | undefined, visitorId: string): string {
  return userId ? `user:${userId}` : `visitor:${visitorId}`
}

export async function recordIpSeen(
  userId: string | null | undefined,
  visitorId: string,
  ip: string | null | undefined,
  country: string | null | undefined
): Promise<void> {
  if (!ip) return

  const now = new Date().toISOString()
  const subjectKey = subjectKeyFor(userId, visitorId)
  const id = newRowId()

  await prisma.$executeRaw`
    INSERT INTO "IpSeenLog" ("id", "subjectKey", "ip", "country", "firstSeen", "lastSeen")
    VALUES (${id}, ${subjectKey}, ${ip}, ${country ?? null}, ${now}, ${now})
    ON CONFLICT("subjectKey", "ip") DO UPDATE SET
      "lastSeen" = excluded."lastSeen",
      "country" = COALESCE(excluded."country", "IpSeenLog"."country")
  `
}

export async function getIpsBySubjectKeys(
  subjectKeys: string[]
): Promise<Map<string, IpEntry[]>> {
  const map = new Map<string, IpEntry[]>()
  if (subjectKeys.length === 0) return map

  const rows = await prisma.$queryRaw<IpSeenRow[]>`
    SELECT "id", "subjectKey", "ip", "country", "firstSeen", "lastSeen"
    FROM "IpSeenLog"
    WHERE "subjectKey" IN (${Prisma.join(subjectKeys)})
    ORDER BY "lastSeen" DESC
  `

  for (const row of rows) {
    const list = map.get(row.subjectKey) ?? []
    list.push(rowToEntry(row))
    map.set(row.subjectKey, list)
  }

  return map
}

export async function findSubjectKeysByIp(ip: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ subjectKey: string }>>`
    SELECT "subjectKey"
    FROM "IpSeenLog"
    WHERE "ip" = ${ip}
    GROUP BY "subjectKey"
    ORDER BY MAX("lastSeen") DESC
    LIMIT 100
  `
  return rows.map((row) => row.subjectKey)
}

/**
 * Historique d'IP d'un même RÉSEAU (voir ipNetworkKey : /64 en IPv6, adresse
 * entière en IPv4). Le réseau ne se lit pas en SQL — un LIKE sur la forme
 * compressée (« :: ») n'est pas fiable —, d'où un parcours en JS de toute la
 * table : quelques centaines de lignes. Sujets du plus récemment vu au plus
 * ancien, bornés comme findSubjectKeysByIp.
 */
export async function findIpSeenInNetwork(
  networkKey: string
): Promise<{ ips: string[]; subjectKeys: string[] }> {
  const rows = await prisma.$queryRaw<Array<{ subjectKey: string; ip: string }>>`
    SELECT "subjectKey", "ip"
    FROM "IpSeenLog"
    ORDER BY "lastSeen" DESC
  `
  const ips = new Set<string>()
  const subjectKeys = new Set<string>()
  for (const row of rows) {
    if (ipNetworkKey(row.ip) !== networkKey) continue
    ips.add(row.ip)
    if (subjectKeys.size < 100) subjectKeys.add(row.subjectKey)
  }
  return { ips: [...ips], subjectKeys: [...subjectKeys] }
}

export type VisitorPresence = {
  visitorId: string
  /** Dernier compte vu sur ce navigateur (voir schema.prisma), pas forcément connecté. */
  userId: string | null
  /** Dernier ping AVEC session valide. */
  userSeenAt: Date | null
  country: string | null
  lastIp: string | null
  lastDevice?: string | null
  lastSeen: Date
  localPlayerCount?: number | null
  localPlayerNames?: string | null
}

/** Champs SitePresence lus pour la liste Visiteurs. */
export const visitorPresenceSelect = {
  visitorId: true,
  userId: true,
  userSeenAt: true,
  country: true,
  lastIp: true,
  lastDevice: true,
  lastSeen: true,
  localPlayerCount: true,
  localPlayerNames: true,
} as const satisfies Prisma.SitePresenceSelect

/**
 * Champs d'un compte lié. Le type se déduit de isGuest, email, passwordHash et
 * des sessions valides (kindOfAccount) : le hash n'est jamais renvoyé.
 */
export function linkedAccountSelect(now: Date) {
  return {
    ...accountKindSelect(now),
    id: true,
    displayName: true,
    accountCode: true,
    role: true,
    lastSeenAt: true,
    localPlayersJson: true,
  } as const satisfies Prisma.UserSelect
}

export type LinkedAccount = {
  id: string
  displayName: string
  email: string | null
  accountCode: string | null
  role: string
  isGuest: boolean
  passwordHash: string
  /** Sessions déjà filtrées par validSessionsSelect (linkedAccountSelect). */
  sessions: Array<{ expiresAt: Date }>
  lastSeenAt: Date | null
  localPlayersJson?: string | null
}

/** Comptes référencés par des SitePresence, lus avec linkedAccountSelect. */
export async function getLinkedAccounts(
  presences: Array<{ userId: string | null }>,
  now: Date
): Promise<LinkedAccount[]> {
  const userIds = [...new Set(presences.map((p) => p.userId).filter(Boolean))] as string[]
  if (userIds.length === 0) return []
  return prisma.user.findMany({
    where: { id: { in: userIds } },
    select: linkedAccountSelect(now),
  })
}

/**
 * Le dernier ping de ce navigateur portait-il une session valide ? userSeenAt
 * et lastSeen sont écrits par le même upsert, avec la même date : égaux après
 * un ping connecté, userSeenAt reste en arrière dès qu'un ping arrive sans
 * session. Aucune marge : un ping perdu ne touche aucune des deux colonnes,
 * une marge ne ferait que prolonger « connecté » après une déconnexion (PC
 * partagé : la navigation d'un tiers passerait sous le compte). On ne compare
 * JAMAIS User.lastSeenAt au navigateur : le compte peut être actif sur un
 * autre appareil (foyer, PC partagé), ce qui ferait passer ce navigateur pour
 * connecté. Tout signal qui avance lastSeen doit aussi écrire userSeenAt quand
 * la session est valide, et lastIp dans le même upsert : sinon « connecté ici »
 * rattacherait au compte l'adresse d'une navigation sans session.
 */
export function isPresenceConnectedHere(
  presence: Pick<VisitorPresence, 'userId' | 'userSeenAt' | 'lastSeen'>
): boolean {
  if (!presence.userId || !presence.userSeenAt) return false
  return presence.userSeenAt.getTime() >= presence.lastSeen.getTime()
}

/**
 * Sujet de la carte d'un navigateur : user:<id> s'il est connecté à un compte
 * EXISTANT au dernier ping, sinon visitor:<vid>.
 */
function cardSubjectOf(
  presence: VisitorPresence,
  userById: Map<string, LinkedAccount>
): { subjectKey: string; account: LinkedAccount | null } {
  const account = presence.userId ? userById.get(presence.userId) : undefined
  if (account && isPresenceConnectedHere(presence)) {
    return { subjectKey: subjectKeyFor(account.id, presence.visitorId), account }
  }
  return { subjectKey: subjectKeyFor(null, presence.visitorId), account: null }
}

/**
 * Historiques d'IP à charger pour regrouper ces navigateurs : visitor:<vid> de
 * chacun (IP de la carte browser, ou IP hors connexion d'une carte account),
 * plus user:<id> des comptes connectés.
 */
export function groupingSubjectKeys(
  presences: VisitorPresence[],
  linkedUsers: LinkedAccount[]
): string[] {
  const userById = new Map(linkedUsers.map((u) => [u.id, u]))
  const keys = new Set<string>()
  for (const p of presences) {
    keys.add(subjectKeyFor(null, p.visitorId))
    keys.add(cardSubjectOf(p, userById).subjectKey)
  }
  return [...keys]
}

function timeOf(iso: string): number {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/**
 * IP hors connexion de plusieurs navigateurs d'un même compte : une adresse vue
 * par deux navigateurs n'apparaît qu'une fois (première vue la plus ancienne,
 * dernière vue et pays les plus récents). Plus récente d'abord.
 */
function mergeBrowserIps(lists: IpEntry[][]): IpEntry[] {
  const byIp = new Map<string, IpEntry>()
  for (const entry of lists.flat()) {
    const existing = byIp.get(entry.ip)
    if (!existing) {
      byIp.set(entry.ip, { ...entry })
      continue
    }
    const newer = timeOf(entry.lastSeenAt) > timeOf(existing.lastSeenAt) ? entry : existing
    byIp.set(entry.ip, {
      ip: entry.ip,
      country: newer.country ?? existing.country ?? entry.country,
      lastSeenAt: newer.lastSeenAt,
      firstSeenAt:
        timeOf(entry.firstSeenAt) < timeOf(existing.firstSeenAt)
          ? entry.firstSeenAt
          : existing.firstSeenAt,
    })
  }
  return [...byIp.values()].sort((a, b) => timeOf(b.lastSeenAt) - timeOf(a.lastSeenAt))
}

function mostRecentEntry(lists: IpEntry[][]): IpEntry | null {
  let latest: IpEntry | null = null
  for (const entry of lists.flat()) {
    if (!latest || timeOf(entry.lastSeenAt) > timeOf(latest.lastSeenAt)) latest = entry
  }
  return latest
}

function resolveLocalPlayerNames(
  presence: VisitorPresence,
  account: LinkedAccount | null
): string[] {
  const fromVisitor = parseStoredLocalPlayerNamesJson(presence.localPlayerNames)
  if (fromVisitor.length > 0) return fromVisitor

  if (account?.localPlayersJson) {
    const fromAccount = extractNamesFromUserLocalPlayersJson(account.localPlayersJson)
    if (fromAccount.length > 0) return fromAccount
  }

  return []
}

/**
 * Regroupement PUR (aucune lecture en base, IP injectées) des navigateurs en
 * cartes. Une carte account regroupe les navigateurs connectés au compte ;
 * tout navigateur non connecté a sa propre carte browser, même si un autre de
 * ses navigateurs est connecté au même compte. Les IP d'un navigateur hors
 * connexion ne sont jamais rattachées à l'identité du compte : elles restent
 * dans `ips` de la carte browser, ou à part dans `browserIps`.
 */
export function groupVisitors(
  presences: VisitorPresence[],
  linkedUsers: LinkedAccount[],
  ipsBySubject: Map<string, IpEntry[]>,
  now: number = Date.now()
): GroupedVisitor[] {
  const userById = new Map(linkedUsers.map((u) => [u.id, u]))
  const cards = new Map<
    string,
    { account: LinkedAccount | null; latest: VisitorPresence; browsers: VisitorPresence[] }
  >()

  for (const p of presences) {
    const { subjectKey, account } = cardSubjectOf(p, userById)
    const card = cards.get(subjectKey)
    if (!card) {
      cards.set(subjectKey, { account, latest: p, browsers: [p] })
      continue
    }
    card.browsers.push(p)
    if (p.lastSeen > card.latest.lastSeen) card.latest = p
  }

  return [...cards.entries()]
    .map(([subjectKey, { account, latest: p, browsers }]): GroupedVisitor => {
      const ips = ipsBySubject.get(subjectKey) ?? []
      const browserIps = account
        ? mergeBrowserIps(
            browsers.map((b) => ipsBySubject.get(subjectKeyFor(null, b.visitorId)) ?? [])
          )
        : []
      const latestEntry = mostRecentEntry([ips, browserIps])
      // Carte browser : pas de repli sur les joueurs locaux du dernier compte,
      // ce serait lui prêter la navigation d'un visiteur non connecté.
      const localPlayerNames = resolveLocalPlayerNames(p, account)

      const lastUser = account ? null : p.userId ? userById.get(p.userId) : undefined
      const kindSource = account ?? lastUser ?? null
      const accountLastSeenAt = kindSource?.lastSeenAt?.toISOString() ?? null

      return {
        subjectKey,
        cardType: account ? 'account' : 'browser',
        visitorId: p.visitorId,
        userId: account?.id ?? null,
        displayName: account?.displayName ?? null,
        email: account?.email ?? null,
        accountCode: account?.accountCode ?? null,
        role: account?.role ?? null,
        country: latestEntry?.country ?? p.country,
        browserCountry: p.country,
        primaryIp: latestEntry?.ip ?? p.lastIp,
        lastDevice: p.lastDevice ?? null,
        browserCount: browsers.length,
        ips,
        browserIps,
        localPlayerNames,
        localPlayerCount: localPlayerNames.length,
        botSignals: analyzePlayerNamesForBot(localPlayerNames),
        lastSeenAt: p.lastSeen.toISOString(),
        online: isOnline(p.lastSeen, now),
        connectedHere: account !== null,
        accountKind: kindSource ? kindOfAccount(kindSource) : null,
        accountLastSeenAt,
        accountOnline: kindSource ? isOnline(kindSource.lastSeenAt, now) : false,
        lastAccount: lastUser
          ? {
              userId: lastUser.id,
              displayName: lastUser.displayName,
              accountCode: lastUser.accountCode,
              role: lastUser.role,
              accountKind: kindOfAccount(lastUser),
              lastSeenAt: accountLastSeenAt,
            }
          : null,
      }
    })
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
}

/** Lecture des historiques d'IP nécessaires, puis regroupement (groupVisitors). */
export async function buildGroupedVisitors(
  presences: VisitorPresence[],
  linkedUsers: LinkedAccount[],
  now: number = Date.now()
): Promise<GroupedVisitor[]> {
  const ipsBySubject = await getIpsBySubjectKeys(groupingSubjectKeys(presences, linkedUsers))
  return groupVisitors(presences, linkedUsers, ipsBySubject, now)
}

export async function getVisitorsByCountry(
  country: string | null,
  scope: 'online' | 'today'
): Promise<GroupedVisitor[]> {
  const now = new Date()
  const since =
    scope === 'online' ? onlineSince(now.getTime()) : new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const countryFilter =
    country === null || country === '??'
      ? { OR: [{ country: null }, { country: '??' }] }
      : { country }

  const presences = await prisma.sitePresence.findMany({
    where: {
      lastSeen: { gte: since },
      ...countryFilter,
    },
    orderBy: { lastSeen: 'desc' },
    take: 150,
    select: visitorPresenceSelect,
  })

  const linkedUsers = await getLinkedAccounts(presences, now)
  return buildGroupedVisitors(presences, linkedUsers, now.getTime())
}
