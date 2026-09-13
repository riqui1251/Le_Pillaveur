"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import {
  Ban,
  CalendarDays,
  Clock,
  Crown,
  Globe,
  History,
  Info,
  Network,
  Search,
  ShieldCheck,
  UserX,
  Users,
  Gamepad2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Monitor,
  Smartphone,
  Laptop,
  Tablet,
  Radio,
  Mic,
  MicOff,
  MessageSquare,
  LayoutDashboard,
  Gavel,
  ScrollText,
  MessageSquareWarning,
  CheckCheck,
  Inbox,
  AlertTriangle,
  Sparkles,
  KeyRound,
  UserRound,
  Unplug,
  type LucideIcon,
} from 'lucide-react'
import { deviceLabel } from '@/lib/device-from-user-agent'
import {
  guestLastActivityAt,
  isGuestProbablyLost,
  isGuestPurgeOverdue,
  parseAccountDeleteLogDetail,
  type AccountKind,
} from '@/lib/account-kind'
import { useAuth } from '@/hooks/useAuth'
import {
  assignableRoles,
  canAccessSupervision,
  canAssignRoles,
  canPermanentBanTarget,
  canTemporaryBanTarget,
  canBanFeatureTarget,
  canManageSiteSettings,
  canManageUserFeedback,
  canManageUsers,
  canModifyTarget,
  canDeleteTarget,
  canViewAccountActivity,
  canViewSupervisionAnalytics,
  canViewSupervisionBans,
  canViewUserFeedback,
  ROLE_DESCRIPTIONS,
  roleLabel,
} from '@/lib/roles'
import { countryFlag, countryLabel } from '@/lib/country-display'
import { formatPresenceDuration, type DurationUnits } from '@/lib/format-presence'
import { PARIS_TIME_ZONE, parisDayString } from '@/lib/paris-time'
import { isOnline, ONLINE_WINDOW_MS } from '@/lib/presence'
import { groupIpsByNetwork, type IpNetworkGroup } from '@/lib/ip-network'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ModerationTermsPanel } from '@/components/supervision/ModerationTermsPanel'
import { NameModerationAttemptsPanel } from '@/components/supervision/NameModerationAttemptsPanel'
import { CosmeticGrantsDialog } from '@/components/supervision/CosmeticGrantsDialog'
import { GameSessionsPanel } from '@/components/supervision/GameSessionsPanel'
import {
  SupervisionShell,
  SupervisionHeader,
  SupervisionNav,
  SectionCard,
  KpiPlaque,
  TrendChart,
  LiveTableCard,
  JournalList,
  QueueList,
  GrowthMetric,
  Pager,
  SkeletonRows,
  EmptyState,
  ErrorState,
  type SupervisionNavGroup,
} from '@/components/supervision/SupervisionLayout'
import { GameIconById } from '@/components/hub/GameIconById'
import { cn } from '@/lib/utils'

/**
 * Taille des pages de la Supervision. La liste des comptes et celle des
 * retours sont paginées EN BASE (F40/F75) : le navigateur ne reçoit plus que
 * la page affichée.
 */
const ACCOUNTS_PAGE_SIZE = 25
const FEEDBACK_PAGE_SIZE = 25

// Toutes les dates de la Supervision s'affichent à l'heure de Paris
// (PARIS_TIME_ZONE, src/lib/paris-time.ts, partagé avec les panneaux autonomes).

const DAY_MS = 24 * 60 * 60 * 1000

/** Fenêtre « en ligne » en minutes, pour les libellés (src/lib/presence.ts). */
const ONLINE_WINDOW_MINUTES = Math.round(ONLINE_WINDOW_MS / 60_000)

/** Unités de durée traduites (« 1 j 7 h » en français, « 1 d 7 h » en anglais…). */
function useDurationUnits(): DurationUnits {
  const t = useTranslations('supervision.units')
  return { s: t('s'), min: t('min'), h: t('h'), d: t('d') }
}

/** Un taux non calculable (cohorte vide) s'affiche « — », jamais « 0 % ». */
function rateLabel(rate: number | null): string {
  return rate == null ? '—' : `${Math.round(rate * 100)} %`
}

/** Durée d'inactivité à partir de laquelle on parle de table figée (F46). */
function idleLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`
}

type CountryRow = { country: string | null; count: number }

type IpEntry = {
  ip: string
  country: string | null
  lastSeenAt: string
  firstSeenAt?: string
}

/**
 * Compte vu récemment (User.lastSeenAt, tous types). « En ligne » se recalcule
 * ici avec isOnline : une seule fenêtre pour toute la page.
 */
type ConnectedAccount = {
  id: string
  displayName: string
  email: string | null
  accountCode: string | null
  accountKind: AccountKind
  country: string | null
  ip: string | null
  ips?: IpEntry[]
  lastDevice?: string | null
  lastSeenAt: string | null
  role: string
}

type BotSignals = {
  suspicious: boolean
  reasons: string[]
}

/**
 * Dernier compte connecté sur un navigateur qui ne l'est plus : le lien
 * SitePresence.userId est gardé comme trace, jamais présenté comme une
 * connexion en cours.
 */
type VisitorLastAccount = {
  userId: string
  displayName: string
  accountCode: string | null
  role: string
  accountKind: AccountKind
  /** User.lastSeenAt : activité du COMPTE, tous appareils confondus. */
  lastSeenAt: string | null
}

/**
 * Carte visiteur (lot 3). L'en-tête est TOUJOURS le navigateur
 * (SitePresence.lastSeen) ; le compte vient en deuxième ligne.
 * - `account` : compte connecté sur ce navigateur au dernier ping ;
 * - `browser` : navigateur seul — pseudo, email, code et rôle à null —,
 *   avec au plus le dernier compte vu (`lastAccount`).
 */
type VisitorIpRow = {
  subjectKey: string
  visitorId: string
  userId: string | null
  cardType: 'account' | 'browser'
  connectedHere: boolean
  /** IP et pays « actuels » : l'entrée la plus récente des deux historiques. */
  country: string | null
  primaryIp: string | null
  /** Pays du dernier ping de CE navigateur (en-tête), jamais d'un autre appareil du compte. */
  browserCountry: string | null
  lastDevice: string | null
  /** Navigateurs regroupés (carte account connectée sur plusieurs navigateurs). */
  browserCount: number
  /** Carte account : IP du compte (user:<id>) ; carte browser : IP du navigateur. */
  ips: IpEntry[]
  /** IP de ce navigateur vues hors connexion (visitor:<vid>), jamais mêlées à celles du compte. */
  browserIps: IpEntry[]
  displayName: string | null
  email: string | null
  accountCode: string | null
  role: string | null
  accountKind: AccountKind | null
  accountLastSeenAt: string | null
  accountOnline: boolean
  lastAccount: VisitorLastAccount | null
  localPlayerNames: string[]
  localPlayerCount: number
  botSignals: BotSignals
  /** Dernier ping du NAVIGATEUR. */
  lastSeenAt: string
}

type StatsResponse = {
  visitors: {
    onlineNow: number
    today: number
    week: number
    month: number
    onlineByCountry: CountryRow[]
    visitorsTodayByCountry: CountryRow[]
  }
  connectedAccounts: ConnectedAccount[]
  visitorIpList: VisitorIpRow[]
  accounts: {
    /** Tous les comptes non legacy, invités compris (même prédicat que la liste). */
    total: number
    byKind?: AccountKindCounts
    byRole: {
      user: number
      moderator: number
      admin: number
      superadmin: number
      fondateur: number
    }
  }
  generatedAt: string
  games?: {
    games: Array<{ gameId: string; title: string; emoji: string; partiesPlayed: number }>
    totalParties: number
  }
}

type DailyPoint = { date: string; visitors: number; parties: number }

type LiveTable = {
  id: string
  code: string
  gameId: string | null
  gameTitle: string
  /** `cast` = salle de diffusion TV d'un jeu LOCAL (G5). */
  status: 'waiting' | 'briefing' | 'playing' | 'cast'
  visibility: string
  memberCount: number
  memberNames: string[]
  hostName: string | null
  currentTurnName: string | null
  createdAt: string
  updatedAt: string
  lastActivityAt: string
  idleSeconds: number
  stalled: boolean
}

type GrowthStats = {
  retentionD1: { cohort: number; retained: number; rate: number | null }
  retentionD7: { cohort: number; retained: number; rate: number | null }
  /** PART des comptes enregistrés parmi les comptes créés — pas un entonnoir. */
  registeredShare: { registered: number; guests: number; share: number | null }
  playersByGame: Array<{ gameId: string; gameTitle: string; players: number }>
  abandonedTables: { stalled: number; live: number; rate: number | null }
  windows: {
    retentionD1CohortDays: [number, number]
    retentionD7CohortDays: [number, number]
    registeredShareDays: number
    playersByGameDays: number
  }
  /** Ces chiffres sont mis en cache côté serveur : on affiche leur date. */
  computedAt: string
  cacheSeconds: number
}

type JournalEntry = {
  id: string
  kind:
    | 'ban'
    | 'unban'
    | 'feature-ban'
    | 'cosmetic-grant'
    | 'moderation-term'
    | 'role-change'
    | 'account-delete'
    | 'room-close'
    | 'site-setting'
  actorName: string | null
  targetName: string | null
  detail: string | null
  createdAt: string
}

type QueueItem = {
  id: string
  kind: 'feedback' | 'name-flag'
  targetId: string
  title: string
  subtitle: string
  href: 'feedback' | 'accounts'
  createdAt: string
}

type SupervisionOverview = {
  dailySeries: DailyPoint[]
  liveTables: LiveTable[]
  journal: JournalEntry[]
  queue: QueueItem[]
}

/** Décompte par type de compte, servi par le serveur (account-kind). */
type AccountKindCounts = {
  password: number
  google: number
  guest: number
  guestOrphan: number
}

/**
 * Champs de compte communs à la liste et à la fiche (lot 2). Le type est
 * calculé côté serveur : la page ne le déduit jamais de l'email ou du mot de
 * passe (un invité passait pour un compte Google).
 */
type AccountKindFields = {
  kind: AccountKind
  isGuest: boolean
  /** Au moins une Session dont expiresAt est dans le futur. */
  hasValidSession: boolean
  /**
   * JOUR de Paris (AAAA-MM-JJ) de l'échéance de la session valide ; null sans
   * session valide. Jamais l'heure : elle redonnerait celle d'une visite.
   */
  sessionExpiresAt: string | null
  /** Invités seulement : jour de Paris (AAAA-MM-JJ) prévu de la purge automatique. */
  guestPurgeAt: string | null
}

type AdminUser = AccountKindFields & {
  id: string
  /** Null pour un invité. */
  email: string | null
  displayName: string
  accountCode: string | null
  role: string
  createdAt: string
  lastCountry: string | null
  lastIp: string | null
  lastDevice: string | null
  ips?: IpEntry[]
  lastSeenAt: string | null
  lastLoginAt: string | null
  totalPresenceSeconds: number
  ban: {
    banned: boolean
    banType: string | null
    bannedUntil: string | null
    banComment: string | null
  }
  featureBans?: FeatureBanEntry[]
}

type FeatureBanEntry = {
  feature: 'voice' | 'chat'
  permanent: boolean
  until: string | null
  comment: string | null
  createdAt: string
}

type ActiveBan = {
  id: string
  email: string | null
  displayName: string
  accountCode: string | null
  role: string
  /** Absent d'une réponse antérieure au lot 2. */
  isGuest?: boolean
  banType: string
  bannedUntil: string | null
  banComment: string | null
  bannedAt: string | null
  bannedByName: string | null
}

/**
 * Entrée de LISTE : ni message complet ni captures (F40) — la liste ne porte
 * que le NOMBRE de captures. Le détail (message entier + images base64)
 * n'arrive qu'à l'ouverture du retour, via /api/admin/feedback/[id].
 */
type FeedbackItem = {
  id: string
  type: string
  typeLabel: string
  messagePreview: string
  screenshotCount: number
  pageUrl: string | null
  userId: string | null
  authorName: string
  contactEmail: string | null
  status: string
  statusLabel: string
  createdAt: string
  updatedAt: string
  /** Renseignés uniquement sur le détail chargé à l'ouverture. */
  message?: string
  screenshots?: string[]
  userAgent?: string | null
}

type UserDetail = {
  user: AccountKindFields & {
    id: string
    /** Null pour un invité : la fiche lui est ouverte (lot 2). */
    email: string | null
    displayName: string
    accountCode: string | null
    role: string
    playMode: string
    lastCountry: string | null
    lastIp: string | null
    lastDevice: string | null
    lastSeenAt: string | null
    lastLoginAt: string | null
    totalPresenceSeconds: number
    createdAt: string
    localPlayerCount: number
    gamesPlayed?: Array<{
      gameId: string
      title: string
      emoji: string
      partiesPlayed: number
    }>
    localPlayerNames: string[]
    statsCount: number
    achievementsCount: number
    /** Sessions VALIDES uniquement (les jetons expirés ne comptent plus). */
    sessionsCount: number
    ban: {
      banned: boolean
      banType: string | null
      bannedUntil: string | null
      banComment: string | null
    }
  }
  banHistory: Array<{
    id: string
    action: string
    comment: string | null
    bannedUntil: string | null
    createdAt: string
    actorName: string
  }>
}

function AccountCodeBadge({ code }: { code: string | null | undefined }) {
  const t = useTranslations('supervision')
  if (!code) return null
  return (
    <Badge
      variant="outline"
      className="font-mono text-[11px] tracking-wide text-amber-200/90"
      title={t('device.accountCodeTitle')}
    >
      {code}
    </Badge>
  )
}

/**
 * Valeurs de la phrase « 28 comptes : 15 mot de passe · 7 Google · 6 invités
 * (dont 2 orphelins) ». Les quatre types du serveur sont DISJOINTS : « invités »
 * additionne donc les invités avec session et les orphelins.
 */
function kindSummaryValues(total: number, counts: AccountKindCounts) {
  return {
    total,
    password: counts.password,
    google: counts.google,
    guests: counts.guest + counts.guestOrphan,
    orphans: counts.guestOrphan,
  }
}

const ACCOUNT_KIND_BADGES: Record<AccountKind, { labelKey: string; icon: LucideIcon; className: string }> = {
  password: {
    labelKey: 'accountKind.password',
    icon: KeyRound,
    className: 'border-white/15 bg-white/[0.06] text-white/75',
  },
  google: {
    labelKey: 'accountKind.google',
    icon: Globe,
    className: 'border-sky-500/30 bg-sky-500/15 text-sky-200',
  },
  guest: {
    labelKey: 'accountKind.guest',
    icon: UserRound,
    className: 'border-violet-500/30 bg-violet-500/15 text-violet-200',
  },
  guest_orphan: {
    labelKey: 'accountKind.guestOrphan',
    icon: Unplug,
    className: 'border-orange-500/35 bg-orange-500/15 text-orange-200',
  },
  legacy: {
    labelKey: 'accountKind.legacy',
    icon: UserX,
    className: 'border-white/10 bg-white/[0.03] text-white/50',
  },
}

/**
 * Badge du TYPE de compte (lot 2), partagé par la liste, la fiche et
 * l'analyse d'IP. Le type vient du serveur (account-kind). Un invité inactif
 * depuis plus de GUEST_STALE_DAYS garde parfois une session valide en base
 * alors que son cookie a disparu : on l'écrit à côté du badge, sans quoi il
 * passerait pour un joueur qui peut revenir. Rendu en fragment : le parent
 * est toujours une rangée `flex-wrap`.
 */
function AccountKindBadge({
  kind,
  lastSeenAt,
  createdAt,
  sessionExpiresAt,
  compact,
}: {
  kind: AccountKind
  lastSeenAt: string | null
  /** Sans date de référence, pas de mention « cookie perdu ». */
  createdAt: string | null
  /**
   * Jour d'échéance de la session : un renouvellement récent prouve l'usage
   * même quand le ping, seul à écrire lastSeenAt, est bloqué.
   */
  sessionExpiresAt?: string | null
  compact?: boolean
}) {
  const t = useTranslations('supervision')
  const badge = ACCOUNT_KIND_BADGES[kind]
  // Réponse d'un serveur antérieur au lot 2 : pas de type, pas de badge.
  if (!badge) return null
  const Icon = badge.icon
  const reference = lastSeenAt ?? createdAt
  const activity = reference ? { lastSeenAt, createdAt: reference, sessionExpiresAt } : null
  const lastActivity = activity && isGuestProbablyLost({ kind, ...activity }) ? guestLastActivityAt(activity) : null
  const staleDays = lastActivity !== null ? Math.floor((Date.now() - lastActivity) / DAY_MS) : null
  return (
    <>
      <Badge className={cn(badge.className, compact && 'px-1.5 py-0 text-[10px]')}>
        <Icon className={compact ? 'mr-0.5 h-2.5 w-2.5' : 'mr-1 h-3 w-3'} />
        {t(badge.labelKey)}
      </Badge>
      {staleDays != null && (
        <span className="min-w-0 text-[11px] leading-tight text-amber-200/80">
          {t('accountKind.staleGuest', { days: staleDays })}
        </span>
      )}
    </>
  )
}

/** Phrase du journal — un texte par nature d'action, acteur/cible en gras côté rendu. */
function journalText(t: ReturnType<typeof useTranslations<'supervision'>>, e: JournalEntry): string {
  const actor = e.actorName ?? '—'
  const target = e.targetName ?? '—'
  switch (e.kind) {
    case 'ban':
      return e.detail
        ? t('room.journalBanReason', { actor, target, detail: e.detail })
        : t('room.journalBan', { actor, target })
    case 'unban':
      return t('room.journalUnban', { actor, target })
    case 'feature-ban':
      return t('room.journalFeatureBan', {
        actor,
        target,
        feature: e.detail === 'voice' ? t('featureBans.voice') : t('featureBans.chat'),
      })
    case 'cosmetic-grant':
      return t('room.journalGrant', { actor, target })
    case 'moderation-term':
      return e.actorName
        ? t('room.journalTermByActor', { actor, detail: e.detail ?? '' })
        : t('room.journalTerm', { detail: e.detail ?? '' })
    case 'role-change':
      return t('room.journalRoleChange', { actor, target, detail: e.detail ?? '' })
    case 'account-delete': {
      // Détail neutre `type:rôle`, traduit ici. Les lignes anonymisées
      // (« compte supprimé ») n'ont ni type ni rôle : le détail, écrit en
      // français, n'est jamais affiché tel quel.
      const deleted = parseAccountDeleteLogDetail(e.detail)
      return deleted
        ? t('room.journalAccountDeleteTyped', {
            actor,
            kind: t(ACCOUNT_KIND_BADGES[deleted.kind].labelKey),
            role: t(`roles.${deleted.role}`),
          })
        : t('room.journalAccountDelete', { actor })
    }
    case 'room-close':
      return t('room.journalRoomClose', { actor, detail: e.detail ?? '' })
    case 'site-setting':
      return t('room.journalSiteSetting', { actor, detail: e.detail ?? '' })
  }
}

function DeviceBadge({ device, compact }: { device?: string | null; compact?: boolean }) {
  const t = useTranslations('supervision')
  const label = deviceLabel(device)
  if (!label) return null

  const Icon =
    device === 'mobile'
      ? Smartphone
      : device === 'tablet'
        ? Tablet
        : device === 'mac'
          ? Laptop
          : Monitor

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 text-white/60 ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      }`}
      title={t('device.deviceTitle', { label })}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {label}
    </span>
  )
}

/** IP prête à regrouper : une entrée de repli (dernière IP seule) n'a pas de première vue. */
type DatedIpEntry = IpEntry & { firstSeenAt: string }

/**
 * Historique regroupé par réseau (/64 en IPv6, adresse entière en IPv4) : les
 * adresses temporaires d'une même box ne passent plus pour autant de lieux.
 * UN historique à la fois (compte OU navigateur), jamais les deux mêlés.
 */
function networkGroupsOf(ips: IpEntry[]): IpNetworkGroup<DatedIpEntry>[] {
  return groupIpsByNetwork(ips.map((entry) => ({ ...entry, firstSeenAt: entry.firstSeenAt ?? entry.lastSeenAt })))
}

/** Date ISO lisible ? Une IP de repli peut porter une date vide. */
function isValidDate(iso: string | null | undefined): iso is string {
  return iso != null && !Number.isNaN(Date.parse(iso))
}

/**
 * Détail d'un historique d'IP, réseau par réseau : pays, première et dernière
 * vue, puis les adresses. `onNetworkClick` (admins) cherche les comptes et
 * navigateurs du même réseau — même foyer ou lieu, pas forcément la même
 * personne. IPv6 en break-all : une adresse complète ne tient pas sur 360 px.
 */
function IpNetworkList({
  groups,
  onIpClick,
  onNetworkClick,
}: {
  groups: IpNetworkGroup<DatedIpEntry>[]
  onIpClick?: (ip: string) => void
  onNetworkClick?: (ip: string, network: string) => void
}) {
  const t = useTranslations('supervision')
  const locale = useLocale()
  const format = useFormatter()
  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: PARIS_TIME_ZONE })

  return (
    <ul className="space-y-1.5">
      {groups.map((group) => {
        // IPv4 (ou adresse seule de son réseau) : la clé EST l'adresse, on ne
        // l'écrit pas deux fois.
        const single = group.entries.length === 1 && group.entries[0].ip === group.key
        const seen =
          isValidDate(group.firstSeenAt) && isValidDate(group.lastSeenAt)
            ? parisDayString(new Date(group.firstSeenAt)) === parisDayString(new Date(group.lastSeenAt))
              ? t('ipNetwork.seenOn', { date: day(group.lastSeenAt) })
              : t('ipNetwork.seenRange', { first: day(group.firstSeenAt), last: day(group.lastSeenAt) })
            : null
        const countries =
          group.countries.length > 0
            ? group.countries.map((c) => `${countryFlag(c)} ${countryLabel(c, locale, t('unknownCountry'))}`).join(', ')
            : t('unknownCountry')
        return (
          <li key={group.key} className="min-w-0 rounded-md border border-white/10 bg-black/30 px-2 py-1.5">
            {/* Cibles tactiles : chaque adresse lance une analyse et change
                d'onglet, « Même réseau » une autre recherche — padding
                vertical et écart pour ne pas se tromper de bouton au doigt. */}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              {single ? (
                <button
                  type="button"
                  onClick={() => onIpClick?.(group.entries[0].ip)}
                  className="min-w-0 break-all py-1 text-left font-mono text-[11px] text-amber-200/90 hover:underline"
                >
                  {group.key}
                </button>
              ) : (
                <>
                  <span className="min-w-0 break-all font-mono text-[11px] text-white/75">{group.key}</span>
                  <span className="text-[10px] text-white/40">
                    {t('ipNetwork.addresses', { count: group.entries.length })}
                  </span>
                </>
              )}
              {onNetworkClick && (
                <button
                  type="button"
                  onClick={() => onNetworkClick(group.entries[0].ip, group.key)}
                  title={t('ipNetwork.sameNetworkTitle')}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <Network className="h-3 w-3" />
                  {t('ipNetwork.sameNetwork')}
                </button>
              )}
            </div>
            <p className="mt-0.5 min-w-0 break-words text-[10px] text-white/40">
              {countries}
              {seen && ` · ${seen}`}
            </p>
            {!single && (
              <ul className="mt-1 space-y-1">
                {group.entries.map((entry) => (
                  <li key={entry.ip} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                    <button
                      type="button"
                      onClick={() => onIpClick?.(entry.ip)}
                      className="min-w-0 break-all py-1 text-left font-mono text-[11px] text-amber-200/80 hover:underline"
                    >
                      {entry.ip}
                    </button>
                    {isValidDate(entry.lastSeenAt) && (
                      <span className="text-[10px] text-white/35">
                        {format.dateTime(new Date(entry.lastSeenAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: PARIS_TIME_ZONE,
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * IP la plus récente, puis « N adresses · M réseaux » (ex-« +N IP », qui
 * comptait des adresses brutes : six IPv6 d'une même box faisaient croire à
 * six lieux) et le détail regroupé par réseau.
 */
function IpAddressDisplay({
  ips,
  device,
  onIpClick,
  onNetworkClick,
  compact,
}: {
  ips: IpEntry[]
  device?: string | null
  onIpClick?: (ip: string) => void
  /** Admins seulement : recherche « même réseau ». */
  onNetworkClick?: (ip: string, network: string) => void
  compact?: boolean
}) {
  const t = useTranslations('supervision')
  if (ips.length === 0) {
    return <span className="text-white/40">—</span>
  }

  const groups = networkGroupsOf(ips)
  const primary = groups[0].entries[0]

  return (
    <div className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      <button
        type="button"
        onClick={() => onIpClick?.(primary.ip)}
        className="min-w-0 break-all text-left font-mono text-amber-200/90 hover:underline"
      >
        {primary.ip}
      </button>
      <DeviceBadge device={device} compact={compact} />
      {ips.length > 1 && (
        <details className="min-w-0 max-w-full">
          <summary className="w-fit cursor-pointer list-none rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-amber-200/70 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
            {t('ipNetwork.summary', { addresses: ips.length, networks: groups.length })}
          </summary>
          <div className="mt-1 space-y-1.5 rounded-md border border-white/10 bg-black/40 p-2">
            <IpNetworkList groups={groups} onIpClick={onIpClick} onNetworkClick={onNetworkClick} />
            <p className="text-[10px] leading-snug text-white/35">{t('ipNetwork.help')}</p>
          </div>
        </details>
      )}
    </div>
  )
}

function FeedbackListSection({
  items,
  emptyMessage,
  onSelect,
}: {
  items: FeedbackItem[]
  emptyMessage: string
  onSelect: (item: FeedbackItem) => void
}) {
  const t = useTranslations('supervision')
  const format = useFormatter()
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-white/50">{emptyMessage}</p>
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className="w-full rounded-xl border border-white/10 bg-black/20 p-4 text-left transition-colors hover:bg-white/[0.04]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={
                  item.type === 'bug'
                    ? 'border-red-500/30 bg-red-500/15 text-red-200'
                    : item.type === 'improvement'
                      ? 'border-amber-500/30 bg-amber-500/15 text-amber-200'
                      : 'border-chip-blue/50 bg-chip-blue/20 text-sky-200'
                }
              >
                {item.typeLabel}
              </Badge>
              <Badge variant="secondary">{item.statusLabel}</Badge>
            </div>
            <span className="text-xs text-white/40">
              {format.dateTime(new Date(item.createdAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-white">{item.authorName}</p>
          <p className="mt-1 text-sm text-white/60">{item.messagePreview}</p>
          {item.screenshotCount > 0 && (
            <p className="mt-1 text-xs text-white/35">
              {item.screenshotCount}
              {item.screenshotCount > 1 ? t('feedback.screenshots') : t('feedback.screenshot')}
            </p>
          )}
        </button>
      ))}
    </div>
  )
}

function FeedbackSearchBar({
  value,
  onChange,
  placeholder,
  resultCount,
  totalCount,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  resultCount: number
  totalCount: number
}) {
  const t = useTranslations('supervision')
  const resultsLabel = t('accounts.results', {
    count: resultCount,
    plural: resultCount > 1 ? 's' : '',
    total: totalCount,
  })

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <Input
          className="bg-black/30 pl-9"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {value.trim() && (
        <p className="text-xs text-white/45">{resultsLabel}</p>
      )}
    </div>
  )
}

function RoleBadge({ role, compact }: { role: string; compact?: boolean }) {
  const t = useTranslations('supervision')
  const badgeClass = compact ? 'text-[10px] px-1.5 py-0' : undefined
  const iconClass = compact ? 'mr-0.5 h-2.5 w-2.5' : 'mr-1 h-3 w-3'
  if (role === 'fondateur') {
    return (
      <Badge className={cn('border-yellow-400/50 bg-gradient-to-r from-amber-500/25 to-yellow-400/20 text-yellow-100', badgeClass)}>
        <Crown className={iconClass} />
        {t('roles.fondateur')}
      </Badge>
    )
  }
  if (role === 'superadmin') {
    return (
      <Badge className={cn('border-rose-500/40 bg-rose-500/15 text-rose-100', badgeClass)}>
        <Crown className={iconClass} />
        {t('roles.superadmin')}
      </Badge>
    )
  }
  if (role === 'admin') {
    return (
      <Badge className={cn('border-amber-500/30 bg-amber-500/15 text-amber-200', badgeClass)}>
        <Crown className={iconClass} />
        {t('roles.admin')}
      </Badge>
    )
  }
  if (role === 'moderator') {
    return (
      <Badge className={cn('border-chip-blue/50 bg-chip-blue/20 text-sky-200', badgeClass)}>
        <ShieldCheck className={iconClass} />
        {t('roles.moderator')}
      </Badge>
    )
  }
  return <Badge variant="secondary" className={badgeClass}>{t('roles.user')}</Badge>
}

function UserActivityLines({
  lastLoginAt,
  totalPresenceSeconds,
  compact,
}: {
  lastLoginAt: string | null
  totalPresenceSeconds: number
  compact?: boolean
}) {
  const t = useTranslations('supervision')
  const format = useFormatter()
  const durationUnits = useDurationUnits()
  return (
    <div className={compact ? 'space-y-0.5 text-[11px] text-white/35' : 'space-y-1 text-sm text-white/60'}>
      {/* lastLoginAt n'est écrit qu'à une saisie d'identifiants, une connexion
          Google ou une création d'invité — jamais quand une session est réutilisée :
          c'est une AUTHENTIFICATION, pas une visite. */}
      <p>
        {t('activity.lastAuth')}{' '}
        {lastLoginAt
          ? format.dateTime(new Date(lastLoginAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })
          : t('activity.neverLoggedIn')}
      </p>
      {/* 60 s par requête, onglets cachés compris : un cumul d'onglets ouverts,
          pas un temps de jeu. Le libellé le dit, y compris en version compacte. */}
      <p>
        {t('activity.legacyPresence', { duration: formatPresenceDuration(totalPresenceSeconds, durationUnits) })}
        <span className={compact ? undefined : 'text-xs text-white/35'}>{t('activity.legacyPresenceNote')}</span>
      </p>
    </div>
  )
}

function useActionLabel() {
  const t = useTranslations('supervision')
  return (action: string): string => {
  switch (action) {
    case 'ban_permanent':
      return t('actions.banPermanent')
    case 'ban_temporary':
      return t('actions.banTemporary')
    case 'unban':
      return t('actions.unban')
    case 'feedback-ack':
      return t('actions.feedbackAck')
    case 'name-flag-ack':
      return t('actions.nameFlagAck')
    case 'role-change':
      return t('actions.roleChange')
    default:
      return action
  }
  }
}

function CountryList({
  title,
  description,
  rows,
  onCountryClick,
}: {
  title: string
  description: string
  rows: CountryRow[]
  onCountryClick?: (country: string | null, scope: 'online' | 'today') => void
}) {
  const t = useTranslations('supervision')
  const locale = useLocale()
  const scope = title.toLowerCase().includes('aujourd') || title.toLowerCase().includes('today') || title.toLowerCase().includes('oggi') || title.toLowerCase().includes('hoy') ? 'today' : 'online'

  return (
    <SectionCard
      icon={Globe}
      title={title}
      description={
        <>
          {description}
          {onCountryClick && t('geo.tapCountry')}
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t('geo.noData')} />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.country ?? 'unknown'}>
              <button
                type="button"
                onClick={() => onCountryClick?.(row.country, scope)}
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-white/[0.16] hover:bg-white/[0.05]"
              >
                <span className="flex items-center gap-2 text-sm text-white">
                  <span>{countryFlag(row.country)}</span>
                  {countryLabel(row.country, locale, t('unknownCountry'))}
                  {row.country && row.country !== '??' && (
                    <span className="text-xs text-white/35">({row.country})</span>
                  )}
                </span>
                <Badge variant="secondary">{row.count}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function LocalPlayersSection({ row }: { row: VisitorIpRow }) {
  const t = useTranslations('supervision')
  if (row.localPlayerCount === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-white/45">{t('geo.localPlayersLabel')}</p>
        <p className="mt-1 text-sm text-white/40">
          {/* Compte connecté : sa liste se synchronise avec le compte, « pas
              encore synchronisé » n'a pas de sens — il n'en a simplement pas. */}
          {row.cardType === 'account' ? t('visitorCard.noLocalList') : t('geo.noLocalPlayers')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-white/45">
          {t('geo.localPlayersLabel')} ({row.localPlayerCount})
        </p>
        {row.botSignals.suspicious && (
          <Badge className="border-orange-500/35 bg-orange-500/15 text-orange-200">
            {t('geo.suspicious')}
          </Badge>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {row.localPlayerNames.map((name) => (
          <Badge key={name} variant="secondary" className="text-xs">
            {name}
          </Badge>
        ))}
      </div>
      {row.botSignals.suspicious && (
        <ul className="mt-2 space-y-0.5 text-xs text-orange-200/80">
          {row.botSignals.reasons.map((reason) => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * IP de la carte (repliée) : l'historique propre à la carte — le compte pour
 * une carte account, le navigateur pour une carte browser. La dernière IP de
 * la présence ne sert de repli qu'à une carte browser : c'est l'IP du
 * navigateur, jamais celle du compte.
 */
function visitorCardIps(row: VisitorIpRow): IpEntry[] {
  if (row.ips.length > 0) return row.ips
  if (row.cardType === 'browser' && row.primaryIp) {
    return [{ ip: row.primaryIp, country: row.country, lastSeenAt: row.lastSeenAt }]
  }
  return []
}

/**
 * En-tête d'une carte visiteur : le NAVIGATEUR (SitePresence.lastSeen), jamais
 * le compte — « Navigateur actif » ou « vu le … », appareil, pays.
 */
function VisitorBrowserLine({ row }: { row: VisitorIpRow }) {
  const t = useTranslations('supervision')
  const locale = useLocale()
  const format = useFormatter()
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {isOnline(row.lastSeenAt) ? (
        <Badge className="border-green-500/30 bg-green-500/10 text-[10px] text-green-300">
          {t('visitorCard.browserActive')}
        </Badge>
      ) : (
        <span className="min-w-0 text-xs text-white/55">
          {t('visitorCard.browserSeen', {
            date: format.dateTime(new Date(row.lastSeenAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: PARIS_TIME_ZONE,
            }),
          })}
        </span>
      )}
      <DeviceBadge device={row.lastDevice} compact />
      {/* Pays du navigateur : `country` d'une carte account peut venir d'un
          autre appareil du compte. */}
      <span className="flex min-w-0 items-center gap-1 text-xs text-white/50">
        {countryFlag(row.browserCountry)}
        {countryLabel(row.browserCountry, locale, t('unknownCountry'))}
      </span>
    </div>
  )
}

/**
 * Ligne COMPTE d'une carte visiteur. « Connecté sur ce navigateur » seulement
 * si la session était valide au dernier ping de CE navigateur ; sinon le
 * dernier compte vu, avec l'activité du compte (User.lastSeenAt) — plus de
 * « En ligne » accolé au pseudo d'un compte déconnecté. Le badge de type
 * remplace le rôle : plus de « Joueur » pour un invité, le rôle ne s'affiche
 * que pour l'équipe.
 */
function VisitorAccountLine({ row }: { row: VisitorIpRow }) {
  const t = useTranslations('supervision')
  const format = useFormatter()
  const activityUntil = (iso: string) =>
    t('visitorCard.accountActivityUntil', {
      date: format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE }),
    })

  if (row.cardType === 'account' && row.displayName) {
    const browserActive = isOnline(row.lastSeenAt)
    // Navigateur inactif mais compte vu dans la fenêtre : il joue ailleurs.
    const elsewhere = !browserActive && isOnline(row.accountLastSeenAt)
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {/* Navigateur inactif : la session du dernier passage a pu expirer
            depuis (le type, lui, est calculé maintenant) — libellé au passé. */}
        <span className="text-xs text-white/45">
          {browserActive ? t('visitorCard.connectedHere') : t('visitorCard.connectedLastVisit')}
        </span>
        <span className="min-w-0 break-words text-sm font-medium text-white">{row.displayName}</span>
        <AccountCodeBadge code={row.accountCode} />
        {row.accountKind && (
          <AccountKindBadge kind={row.accountKind} lastSeenAt={row.accountLastSeenAt} createdAt={null} compact />
        )}
        {row.role && row.role !== 'user' && <RoleBadge role={row.role} compact />}
        {elsewhere && (
          <span className="min-w-0 text-xs text-green-300/80">· {t('visitorCard.accountOnlineElsewhere')}</span>
        )}
      </div>
    )
  }

  const last = row.lastAccount
  if (!last) return null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-xs text-white/45">{t('visitorCard.lastAccount')}</span>
      <span className="min-w-0 break-words text-sm font-medium text-white/80">{last.displayName}</span>
      <AccountCodeBadge code={last.accountCode} />
      {/* Sans date de création servie, la dernière activité sert de référence
          (même règle que l'analyse d'IP). */}
      <AccountKindBadge kind={last.accountKind} lastSeenAt={last.lastSeenAt} createdAt={last.lastSeenAt} compact />
      {last.role !== 'user' && <RoleBadge role={last.role} compact />}
      {isOnline(last.lastSeenAt) ? (
        <span className="min-w-0 text-xs text-green-300/80">· {t('visitorCard.accountOnlineElsewhere')}</span>
      ) : (
        <span className="min-w-0 text-xs text-white/45">
          · {last.lastSeenAt ? activityUntil(last.lastSeenAt) : t('visitorCard.accountNoActivity')}
        </span>
      )}
    </div>
  )
}

/** Un historique d'IP de la carte (compte OU navigateur), regroupé par réseau. */
function VisitorIpGroup({
  title,
  hint,
  ips,
  onIpClick,
  onNetworkClick,
}: {
  title: string
  hint: string
  ips: IpEntry[]
  onIpClick?: (ip: string) => void
  onNetworkClick?: (ip: string, network: string) => void
}) {
  const t = useTranslations('supervision')
  const groups = networkGroupsOf(ips)
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <p className="text-xs font-medium text-white/60">{title}</p>
        {ips.length > 0 && (
          <span className="text-[11px] text-white/40">
            {t('ipNetwork.summary', { addresses: ips.length, networks: groups.length })}
          </span>
        )}
      </div>
      <p className="text-[11px] leading-snug text-white/35">{hint}</p>
      {ips.length > 0 ? (
        <div className="mt-1">
          <IpNetworkList groups={groups} onIpClick={onIpClick} onNetworkClick={onNetworkClick} />
        </div>
      ) : (
        <p className="mt-1 text-white/40">{t('geo.noIp')}</p>
      )}
    </div>
  )
}

function VisitorDetailPanel({
  row,
  onIpClick,
  onNetworkClick,
  onOpenAccount,
}: {
  row: VisitorIpRow
  onIpClick?: (ip: string) => void
  onNetworkClick?: (ip: string, network: string) => void
  onOpenAccount?: (userId: string) => void
}) {
  const t = useTranslations('supervision')
  // Deux historiques, JAMAIS fusionnés : rattacher au compte les IP d'une
  // navigation sans session attribuerait à son titulaire l'activité d'un
  // tiers (PC partagé, tablette de bar).
  const accountIps = row.cardType === 'account' ? row.ips : []
  // Section « hors connexion » : l'historique visitor:<vid> seul. Le repli sur
  // la dernière IP du navigateur n'y vaut que sans compte lié : sinon elle peut
  // venir d'un ping CONNECTÉ (lignes antérieures à userSeenAt, ping sans IP).
  const browserIps =
    row.cardType === 'account' ? row.browserIps : row.lastAccount ? row.ips : visitorCardIps(row)
  const accountId = row.cardType === 'account' ? row.userId : (row.lastAccount?.userId ?? null)
  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-sm">
      {row.cardType === 'account' && (
        <VisitorIpGroup
          title={t('visitorCard.accountIps')}
          hint={t('visitorCard.accountIpsHint')}
          ips={accountIps}
          onIpClick={onIpClick}
          onNetworkClick={onNetworkClick}
        />
      )}
      {(row.cardType === 'browser' || browserIps.length > 0) && (
        <VisitorIpGroup
          // Carte account sur plusieurs navigateurs : leurs IP hors connexion
          // sont réunies, l'en-tête ne décrit que le plus récent.
          title={
            row.browserCount > 1
              ? t('visitorCard.browsersIps', { count: row.browserCount })
              : t('visitorCard.browserIps')
          }
          hint={t('visitorCard.browserIpsHint')}
          ips={browserIps}
          onIpClick={onIpClick}
          onNetworkClick={onNetworkClick}
        />
      )}
      <p className="text-[11px] leading-snug text-white/35">{t('ipNetwork.help')}</p>
      {accountId ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {row.cardType === 'account' && row.email && (
            <p className="min-w-0 break-all text-xs text-white/45">{row.email}</p>
          )}
          {onOpenAccount && (
            <Button size="sm" variant="outline" onClick={() => onOpenAccount(accountId)}>
              <History className="mr-1 h-3.5 w-3.5" />
              {t('visitorCard.openFile')}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-white/45">{t('geo.noLinkedAccount')}</p>
      )}
      <LocalPlayersSection row={row} />
      <p className="break-all font-mono text-[10px] text-white/30">{t('geo.visitorId', { id: row.visitorId })}</p>
    </div>
  )
}

/**
 * Cartes visiteurs dépliables, partagées par la liste Visiteurs et le dialogue
 * par pays : repliée, le navigateur, le compte et l'IP de la carte ; dépliée,
 * les deux historiques d'IP (compte / hors connexion) et « Ouvrir la fiche ».
 * Une seule carte dépliée à la fois.
 */
function VisitorCardList({
  rows,
  onIpClick,
  onNetworkClick,
  onOpenAccount,
}: {
  rows: VisitorIpRow[]
  onIpClick?: (ip: string) => void
  onNetworkClick?: (ip: string, network: string) => void
  onOpenAccount?: (userId: string) => void
}) {
  const t = useTranslations('supervision')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const toggleExpand = (key: string) => {
    setExpandedKey((current) => (current === key ? null : key))
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const expanded = expandedKey === row.subjectKey

        return (
          <div
            key={row.subjectKey}
            className={`min-w-0 rounded-xl border bg-black/20 transition-colors ${
              expanded ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10'
            }`}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleExpand(row.subjectKey)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleExpand(row.subjectKey)
                }
              }}
              className="w-full cursor-pointer p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <VisitorBrowserLine row={row} />
                  <VisitorAccountLine row={row} />
                  <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                    {/* Clics et touches gardés ici : ouvrir le détail des
                        réseaux ne replie plus la carte. */}
                    <div
                      className="w-fit min-w-0 max-w-full"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <IpAddressDisplay
                        ips={visitorCardIps(row)}
                        onIpClick={onIpClick}
                        onNetworkClick={onNetworkClick}
                        compact
                      />
                    </div>
                    {row.localPlayerCount > 0 && (
                      <Badge variant="outline" className="w-fit text-[10px] text-white/55">
                        {row.localPlayerCount}{row.localPlayerCount > 1 ? t('geo.localPlayers') : t('geo.localPlayer')}
                      </Badge>
                    )}
                    {row.botSignals.suspicious && (
                      <Badge className="w-fit border-orange-500/35 bg-orange-500/10 text-[10px] text-orange-200">
                        {t('geo.suspicious')}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="shrink-0 text-[10px] text-amber-300/60 sm:text-right">
                  {expanded ? t('geo.hide') : t('geo.details')}
                </p>
              </div>
            </div>
            {expanded && (
              <div className="px-3 pb-3">
                <VisitorDetailPanel
                  row={row}
                  onIpClick={onIpClick}
                  onNetworkClick={onNetworkClick}
                  onOpenAccount={onOpenAccount}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function IpVisitorList({
  rows,
  onIpClick,
  onNetworkClick,
  onOpenAccount,
}: {
  rows: VisitorIpRow[]
  onIpClick?: (ip: string) => void
  onNetworkClick?: (ip: string, network: string) => void
  onOpenAccount?: (userId: string) => void
}) {
  const t = useTranslations('supervision')
  const locale = useLocale()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      if (row.primaryIp?.toLowerCase().includes(q)) return true
      if (row.ips.some((entry) => entry.ip.toLowerCase().includes(q))) return true
      if (row.browserIps.some((entry) => entry.ip.toLowerCase().includes(q))) return true
      if (row.visitorId.toLowerCase().includes(q)) return true
      if (row.displayName?.toLowerCase().includes(q)) return true
      if (row.email?.toLowerCase().includes(q)) return true
      if (row.accountCode?.toLowerCase().includes(q)) return true
      if (row.lastAccount?.displayName.toLowerCase().includes(q)) return true
      if (row.lastAccount?.accountCode?.toLowerCase().includes(q)) return true
      if (row.localPlayerNames.some((name) => name.toLowerCase().includes(q))) return true
      if (countryLabel(row.country, locale, t('unknownCountry')).toLowerCase().includes(q)) return true
      if (row.country?.toLowerCase().includes(q)) return true
      return false
    })
  }, [rows, query, locale, t])

  return (
    <SectionCard
      className="md:col-span-2"
      icon={Network}
      title={t('geo.visitorsTitle')}
      description={t('visitorCard.listDesc')}
      bodyClassName="space-y-3"
    >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <Input
            className="bg-black/30 pl-9"
            placeholder={t('geo.filterPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={rows.length === 0 ? t('geo.noVisitors') : t('geo.noSearchResults')}
          />
        ) : (
          <VisitorCardList
            rows={filtered}
            onIpClick={onIpClick}
            onNetworkClick={onNetworkClick}
            onOpenAccount={onOpenAccount}
          />
        )}
    </SectionCard>
  )
}

export default function SupervisionPage() {
  const t = useTranslations('supervision')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors')
  const locale = useLocale()
  const format = useFormatter()
  const durationUnits = useDurationUnits()
  const actionLabel = useActionLabel()
  const { user, loading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [overview, setOverview] = useState<SupervisionOverview | null>(null)
  // Indicateurs de croissance : hors de la boucle de 15 s (F40), chargés une
  // seule fois à l'ouverture de l'onglet et servis avec leur date de calcul.
  const [growth, setGrowth] = useState<GrowthStats | null>(null)
  const [queueBusyId, setQueueBusyId] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  // Liste des comptes paginée EN BASE (F75) : `users` ne contient plus que la
  // page affichée, `usersTotal` le nombre total de comptes correspondants.
  const [usersTotal, setUsersTotal] = useState(0)
  // Décompte NON filtré par type (lot 2) : le compteur de l'onglet ne varie
  // plus avec la recherche en cours.
  const [accountCounts, setAccountCounts] = useState<(AccountKindCounts & { total: number }) | null>(null)
  const [usersPage, setUsersPage] = useState(1)
  const [usersLoading, setUsersLoading] = useState(false)
  const [bans, setBans] = useState<ActiveBan[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Premier chargement des données (≠ auth) → squelette plutôt que page vide.
  const [dataLoaded, setDataLoaded] = useState(false)
  const [editingNames, setEditingNames] = useState<Record<string, string>>({})
  const [accountSearch, setAccountSearch] = useState('')
  // Accordéon de la liste des comptes : seuls les comptes DÉPLIÉS montrent
  // le détail (email, IP, actions) — la liste reste compacte.
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState('overview')
  const [accountFilterRole, setAccountFilterRole] = useState('all')
  const [accountFilterStatus, setAccountFilterStatus] = useState('all')
  const [accountFilterKind, setAccountFilterKind] = useState('all')
  const [accountFilterActivity, setAccountFilterActivity] = useState('all')
  // Tri par dernière activité par défaut : un compte actif ne se retrouve
  // plus derrière des inscrits récents qui ne sont jamais revenus.
  const [accountSort, setAccountSort] = useState<'activity' | 'created'>('activity')
  const [rolesHelpOpen, setRolesHelpOpen] = useState(false)
  const [ipLookup, setIpLookup] = useState<{
    ip: string
    /**
     * `network` : même /64 (IPv6) ou même IPv4, lancé par « Même réseau »
     * (admins). `network` porte alors la clé du réseau et ses adresses connues.
     */
    mode?: 'exact' | 'network'
    network?: { key: string; ips: string[] } | null
    accounts: Array<{
      id: string
      displayName: string
      email: string | null
      accountCode: string | null
      role: string
      kind?: AccountKind
      lastSeenAt: string | null
      createdAt?: string
      /** Jour d'échéance de la session valide (AAAA-MM-JJ). */
      sessionExpiresAt?: string | null
      online: boolean
      banned: boolean
    }>
    /** Seul leur nombre est affiché : le détail n'est servi qu'aux admins. */
    visitors: Array<{ visitorId: string; online: boolean }>
  } | null>(null)
  const [ipLookupLoading, setIpLookupLoading] = useState(false)
  // IP dont l'analyse est attendue : une saisie dans la recherche la rend
  // caduque, et une réponse tardive ne doit pas réafficher son bandeau.
  const ipLookupForRef = useRef<string | null>(null)

  const [countryDialog, setCountryDialog] = useState<{
    country: string | null
    scope: 'online' | 'today'
    title: string
  } | null>(null)
  const [countryVisitors, setCountryVisitors] = useState<VisitorIpRow[]>([])
  const [countryVisitorsLoading, setCountryVisitorsLoading] = useState(false)

  const [unbanDialog, setUnbanDialog] = useState<{
    userId: string
    displayName: string
    /** Invité : sans ban, la purge des orphelins l'emporte (7 jours). */
    isGuest: boolean
  } | null>(null)
  const [unbanComment, setUnbanComment] = useState('')

  const [banDialog, setBanDialog] = useState<{
    userId: string
    displayName: string
    type: 'permanent' | 'temporary'
    /** Invité : un ban temporaire lui coupe définitivement l'accès. */
    isGuest: boolean
  } | null>(null)
  const [banComment, setBanComment] = useState('')
  const [banDays, setBanDays] = useState('7')

  const [historyUserId, setHistoryUserId] = useState<string | null>(null)
  const [historyDetail, setHistoryDetail] = useState<UserDetail | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const [deleteDialog, setDeleteDialog] = useState<{
    userId: string
    displayName: string
  } | null>(null)

  // Fermeture forcée d'une table en ligne (admin+).
  const [closeTableDialog, setCloseTableDialog] = useState<{
    roomId: string
    code: string
    gameTitle: string
    memberCount: number
  } | null>(null)
  const [closingRoomId, setClosingRoomId] = useState<string | null>(null)

  // Réglage global du vocal (super admin) + sanctions ciblées vocal/chat.
  const [voiceEnabled, setVoiceEnabled] = useState<boolean | null>(null)
  const [featureBanDialog, setFeatureBanDialog] = useState<{
    userId: string
    displayName: string
    feature: 'voice' | 'chat'
  } | null>(null)
  const [featureBanComment, setFeatureBanComment] = useState('')
  const [featureBanDays, setFeatureBanDays] = useState('7')
  const [featureBanPermanent, setFeatureBanPermanent] = useState(false)

  // Déblocage manuel de cosmétiques (fondateur uniquement).
  const [cosmeticsDialog, setCosmeticsDialog] = useState<{
    userId: string
    displayName: string
  } | null>(null)

  // Retours joueurs : page courante uniquement, captures exclues (F40).
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([])
  const [feedbackTotal, setFeedbackTotal] = useState(0)
  const [feedbackPage, setFeedbackPage] = useState(1)
  const [feedbackLoading, setFeedbackLoading] = useState(false)
  const [activeFeedbackTotal, setActiveFeedbackTotal] = useState(0)
  const [resolvedFeedbackTotal, setResolvedFeedbackTotal] = useState(0)
  const [feedbackSearch, setFeedbackSearch] = useState('')
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null)
  const [feedbackDetailLoading, setFeedbackDetailLoading] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  const canEditAccounts = user ? canManageUsers(user.role) : false
  const showAccountActivity = user ? canViewAccountActivity(user.role) : false
  const assignableRoleOptions = user ? assignableRoles(user.role) : []
  const showAnalytics = user ? canViewSupervisionAnalytics(user.role) : false
  const showBansTab = user ? canViewSupervisionBans(user.role) : false
  const showFeedbackTab = user ? canViewUserFeedback(user.role) : false
  // Lire un retour est ouvert aux modérateurs, le CLORE reste admin+ (F44).
  const canTriageFeedback = user ? canManageUserFeedback(user.role) : false
  const defaultTab = showAnalytics ? 'overview' : 'accounts'

  const subtitle = showAnalytics
    ? t('subtitles.full')
    : showBansTab
      ? t('subtitles.bans')
      : t('subtitles.accounts')

  // L'onglet ouvert détermine ce que le serveur renvoie : « en cours » (tout
  // ce qui n'est pas résolu) ou « résolus ». Plus de tri côté navigateur.
  const feedbackScope = activeTab === 'feedback-resolved' ? 'resolved' : 'active'

  // Navigation groupée par famille (Analyse / Communauté / Modération).
  const navGroups = useMemo<SupervisionNavGroup[]>(() => {
    const groups: SupervisionNavGroup[] = []
    if (showAnalytics) {
      groups.push({
        label: t('navGroups.analysis'),
        items: [
          { value: 'overview', label: t('tabs.overview'), icon: LayoutDashboard },
          { value: 'geo', label: t('tabs.geo'), icon: Globe },
        ],
      })
    }
    const community: SupervisionNavGroup = {
      label: t('navGroups.community'),
      // Total NON filtré, invités compris : l'ancien `usersTotal || stats…`
      // mêlait deux définitions et suivait la recherche en cours.
      items: [{ value: 'accounts', label: t('tabs.accountsShort'), icon: Users, count: accountCounts?.total || '' }],
    }
    if (showBansTab) {
      community.items.push({
        value: 'bans',
        label: t('tabs.bansShort'),
        icon: Gavel,
        count: bans.length || '',
        tone: bans.length > 0 ? 'danger' : 'neutral',
      })
    }
    groups.push(community)

    const moderation: SupervisionNavGroup = { label: t('navGroups.moderation'), items: [] }
    if (canEditAccounts) {
      moderation.items.push({ value: 'moderation', label: t('tabs.moderationShort'), icon: ScrollText })
    }
    if (showFeedbackTab) {
      moderation.items.push({
        value: 'feedback',
        label: t('tabs.feedbackShort'),
        icon: MessageSquareWarning,
        count: activeFeedbackTotal || '',
        tone: activeFeedbackTotal > 0 ? 'warning' : 'neutral',
      })
      moderation.items.push({
        value: 'feedback-resolved',
        label: t('tabs.feedbackResolvedShort'),
        icon: CheckCheck,
        count: resolvedFeedbackTotal || '',
      })
    }
    if (moderation.items.length > 0) groups.push(moderation)
    return groups
  }, [
    showAnalytics,
    showBansTab,
    canEditAccounts,
    showFeedbackTab,
    accountCounts?.total,
    bans.length,
    activeFeedbackTotal,
    resolvedFeedbackTotal,
    t,
  ])

  const tRef = useRef(t)
  const tErrorsRef = useRef(tErrors)
  tRef.current = t
  tErrorsRef.current = tErrors

  const userId = user?.id
  const userRole = user?.role

  /**
   * Un chargeur PAR domaine plutôt qu'un « tout recharger » (F40). Seul
   * `loadLive` (stats + vue d'ensemble) est appelé en boucle : c'est le seul
   * contenu qui bouge tout seul. Les comptes se rechargent quand on change de
   * page ou de filtre, les retours quand on change d'onglet ou de recherche,
   * et tout le monde à la demande via le bouton Actualiser.
   */
  const loadUsers = useCallback(
    async (silent = false) => {
      if (!userId || !userRole) return
      if (!silent) setUsersLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(usersPage),
          pageSize: String(ACCOUNTS_PAGE_SIZE),
        })
        const q = accountSearch.trim()
        if (q) params.set('q', q)
        if (accountFilterRole !== 'all') params.set('role', accountFilterRole)
        if (accountFilterStatus !== 'all') params.set('status', accountFilterStatus)
        if (accountFilterKind !== 'all') params.set('kind', accountFilterKind)
        if (accountFilterActivity !== 'all') params.set('activity', accountFilterActivity)
        if (accountSort !== 'activity') params.set('sort', accountSort)

        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          credentials: 'include',
        })
        if (res.status === 403) {
          router.replace('/compte')
          return
        }
        if (!res.ok) throw new Error(tRef.current('apiErrors.loadAccounts'))

        const data = await res.json()
        const pageUsers = (data.users ?? []) as AdminUser[]
        setUsers(pageUsers)
        setUsersTotal(data.total ?? pageUsers.length)
        setAccountCounts(data.counts ?? null)
        setEditingNames((prev) => ({
          ...prev,
          ...Object.fromEntries(pageUsers.map((u) => [u.id, u.displayName])),
        }))
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : tErrorsRef.current('generic'))
      } finally {
        setUsersLoading(false)
        setDataLoaded(true)
      }
    },
    [
      router,
      userId,
      userRole,
      usersPage,
      accountSearch,
      accountFilterRole,
      accountFilterStatus,
      accountFilterKind,
      accountFilterActivity,
      accountSort,
    ]
  )

  const loadSettings = useCallback(async () => {
    // Réglages globaux du site (ex. vocal) — lecture pour tout compte connecté.
    const res = await fetch('/api/admin/site-settings', { credentials: 'include' })
    if (res.ok) {
      const settings = await res.json()
      setVoiceEnabled(Boolean(settings.voiceEnabled))
    }
  }, [])

  const loadBans = useCallback(async () => {
    if (!userRole || !canViewSupervisionBans(userRole)) {
      setBans([])
      return
    }
    const res = await fetch('/api/admin/bans', { credentials: 'include' })
    setBans(res.ok ? ((await res.json()).bans ?? []) : [])
  }, [userRole])

  const loadLive = useCallback(
    async (silent = false) => {
      if (!userRole || !canViewSupervisionAnalytics(userRole)) {
        setStats(null)
        setOverview(null)
        return
      }
      try {
        const [statsRes, overviewRes] = await Promise.all([
          fetch('/api/admin/stats', { credentials: 'include' }),
          fetch('/api/admin/supervision-overview', { credentials: 'include' }),
        ])
        if (statsRes.ok) setStats(await statsRes.json())
        if (overviewRes.ok) setOverview(await overviewRes.json())
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : tErrorsRef.current('generic'))
      }
    },
    [userRole]
  )

  /**
   * Indicateurs de croissance : requête à part, tirée à l'ouverture de
   * l'onglet et JAMAIS dans la boucle — elle coûte plusieurs parcours de la
   * table des comptes pour des chiffres qui portent sur 7 à 30 jours.
   */
  const loadGrowth = useCallback(async () => {
    if (!userRole || !canViewSupervisionAnalytics(userRole)) {
      setGrowth(null)
      return
    }
    try {
      const res = await fetch('/api/admin/growth', { credentials: 'include' })
      if (res.ok) setGrowth(await res.json())
    } catch {
      /* silencieux : les indicateurs ne doivent pas casser la console */
    }
  }, [userRole])

  const loadFeedback = useCallback(
    async (silent = false) => {
      if (!userRole || !canViewUserFeedback(userRole)) {
        setFeedbackItems([])
        setFeedbackTotal(0)
        return
      }
      if (!silent) setFeedbackLoading(true)
      try {
        const params = new URLSearchParams({
          status: feedbackScope,
          page: String(feedbackPage),
          pageSize: String(FEEDBACK_PAGE_SIZE),
        })
        const q = feedbackSearch.trim()
        if (q) params.set('q', q)

        const res = await fetch(`/api/admin/feedback?${params.toString()}`, {
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()
        setFeedbackItems(data.feedback ?? [])
        setFeedbackTotal(data.total ?? 0)
        setActiveFeedbackTotal(data.activeCount ?? 0)
        setResolvedFeedbackTotal(data.resolvedCount ?? 0)
      } finally {
        setFeedbackLoading(false)
      }
    },
    [userRole, feedbackScope, feedbackPage, feedbackSearch]
  )

  const loadAll = useCallback(
    async (silent = false) => {
      if (!userId || !userRole) return
      if (!silent) {
        setBusy(true)
        setError(null)
      }
      try {
        await Promise.all([
          loadUsers(silent),
          loadSettings(),
          loadBans(),
          loadLive(silent),
          loadFeedback(silent),
        ])
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : tErrorsRef.current('generic'))
      } finally {
        if (!silent) setBusy(false)
        setDataLoaded(true)
      }
    },
    [userId, userRole, loadUsers, loadSettings, loadBans, loadLive, loadFeedback]
  )

  const loadUserHistory = useCallback(async (userIdToLoad: string) => {
    setHistoryLoading(true)
    setHistoryDetail(null)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/admin/users/${userIdToLoad}`, { credentials: 'include' })
      if (!res.ok) throw new Error(tRef.current('apiErrors.historyUnavailable'))
      const data = await res.json()
      setHistoryDetail(data)
    } catch (e) {
      // L'erreur s'affiche DANS le dialogue : envoyée en haut de page, elle
      // restait cachée derrière lui, bloqué sur « Chargement… ».
      setHistoryError(e instanceof Error ? e.message : tErrorsRef.current('generic'))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const initialTabSet = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!user || !canAccessSupervision(user.role)) {
      router.replace('/compte')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (loading || !user || !canAccessSupervision(user.role)) return
    if (!initialTabSet.current) {
      setActiveTab(defaultTab)
      initialTabSet.current = true
    }
  }, [user, loading, defaultTab])

  // Comptes : rechargés quand la page ou un filtre change, avec un court
  // délai pour ne pas interroger la base à chaque frappe.
  useEffect(() => {
    if (loading || !userId || !userRole || !canAccessSupervision(userRole)) return
    const id = window.setTimeout(() => void loadUsers(), 300)
    return () => window.clearTimeout(id)
  }, [loading, userId, userRole, loadUsers])

  // Retours joueurs : idem, au rythme de l'onglet et de la recherche.
  useEffect(() => {
    if (loading || !userId || !userRole || !canAccessSupervision(userRole)) return
    const id = window.setTimeout(() => void loadFeedback(), 300)
    return () => window.clearTimeout(id)
  }, [loading, userId, userRole, loadFeedback])

  // Un filtre qui change remet la pagination à la première page.
  useEffect(() => {
    setUsersPage(1)
  }, [accountSearch, accountFilterRole, accountFilterStatus, accountFilterKind, accountFilterActivity, accountSort])

  useEffect(() => {
    setFeedbackPage(1)
  }, [feedbackSearch, feedbackScope])

  // Chargés une fois : ni les bans ni les réglages ne bougent tout seuls.
  useEffect(() => {
    if (loading || !userId || !userRole || !canAccessSupervision(userRole)) return
    void loadSettings()
    void loadBans()
  }, [loading, userId, userRole, loadSettings, loadBans])

  /**
   * SEULE boucle de rafraîchissement (F40) : les tables en direct, la file à
   * traiter et les compteurs de visiteurs. Elle s'arrête quand l'onglet passe
   * en arrière-plan — inutile d'interroger le serveur pour une page que
   * personne ne regarde.
   */
  useEffect(() => {
    if (loading || !userId || !userRole || !canAccessSupervision(userRole)) return
    void loadLive()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadLive(true)
    }, 15_000)
    return () => window.clearInterval(id)
  }, [loading, userId, userRole, loadLive])

  // Croissance : au premier affichage de l'onglet qui la montre, puis plus
  // rien — le serveur garde la valeur quelques minutes et l'écran affiche
  // l'heure du calcul.
  useEffect(() => {
    if (loading || !userId || !userRole || activeTab !== 'overview') return
    if (growth) return
    void loadGrowth()
  }, [loading, userId, userRole, activeTab, growth, loadGrowth])

  const handleIpClick = useCallback(async (ip: string) => {
    ipLookupForRef.current = ip
    setAccountSearch(ip)
    setActiveTab('accounts')
    setIpLookupLoading(true)
    setIpLookup(null)
    try {
      const res = await fetch(`/api/admin/ip-lookup?ip=${encodeURIComponent(ip)}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        if (ipLookupForRef.current === ip) setIpLookup(data)
      }
    } catch {
      /* ignore */
    } finally {
      if (ipLookupForRef.current === ip) setIpLookupLoading(false)
    }
  }, [])

  /**
   * « Même réseau » (admins) : comptes et navigateurs vus sur le /64 (IPv6) ou
   * la même IPv4. Même foyer ou lieu, pas forcément la même personne : le
   * bandeau le rappelle. La recherche de comptes est vidée plutôt que remplie
   * avec le préfixe — un LIKE sur la forme textuelle d'une IPv6 (« :: », zéros
   * omis) n'est pas fiable, le bandeau fait foi.
   */
  const handleNetworkLookup = useCallback(async (ip: string, network: string) => {
    const token = `network:${network}`
    ipLookupForRef.current = token
    setAccountSearch('')
    setActiveTab('accounts')
    setIpLookupLoading(true)
    setIpLookup(null)
    try {
      const res = await fetch(`/api/admin/ip-lookup?ip=${encodeURIComponent(ip)}&mode=network`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`ip-lookup ${res.status}`)
      const data = await res.json()
      if (ipLookupForRef.current === token) setIpLookup(data)
    } catch {
      // La recherche vient d'être vidée : sans message, l'échec laissait la
      // liste complète des comptes passer pour le résultat.
      if (ipLookupForRef.current === token) setError(tErrorsRef.current('generic'))
    } finally {
      if (ipLookupForRef.current === token) setIpLookupLoading(false)
    }
  }, [])

  /**
   * Toute modification de la recherche efface l'analyse d'IP : le bandeau
   * « IP … — N comptes » restait affiché au-dessus d'une recherche de pseudo.
   */
  const changeAccountSearch = useCallback((value: string) => {
    ipLookupForRef.current = null
    setAccountSearch(value)
    setIpLookup(null)
    setIpLookupLoading(false)
  }, [])

  const handleCountryClick = useCallback(
    async (country: string | null, scope: 'online' | 'today') => {
      const title = `${countryLabel(country, locale, t('unknownCountry'))} — ${scope === 'online' ? t('geo.scopeOnline') : t('geo.scopeToday')}`
      setCountryDialog({ country, scope, title })
      setCountryVisitorsLoading(true)
      setCountryVisitors([])
      try {
        const param = country ?? 'unknown'
        const res = await fetch(
          `/api/admin/visitors-by-country?country=${encodeURIComponent(param)}&scope=${scope}`,
          { credentials: 'include' }
        )
        if (res.ok) {
          const data = await res.json()
          setCountryVisitors(data.visitors ?? [])
        }
      } catch {
        /* ignore */
      } finally {
        setCountryVisitorsLoading(false)
      }
    },
    [locale, t]
  )

  useEffect(() => {
    if (historyUserId) loadUserHistory(historyUserId)
  }, [historyUserId, loadUserHistory])

  const updateUser = async (
    userId: string,
    patch: { displayName?: string; role?: string }
  ) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Le sélecteur de rôle est masqué pour un invité ; le serveur refuse
        // quand même (409) si une liste ancienne l'affichait encore.
        throw new Error(
          data.code === 'guest_cannot_be_staff'
            ? t('apiErrors.guestCannotBeStaff')
            : (data.error ?? t('apiErrors.modifyDenied'))
        )
      }
      // Fusion plutôt que remplacement : la réponse ne porte ni l'historique
      // d'IP, ni les sanctions ciblées, ni forcément l'état des sessions.
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...data.user } : u)))
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  const submitBan = async () => {
    if (!banDialog || !user) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: banDialog.userId,
          type: banDialog.type,
          comment: banComment,
          durationDays: banDialog.type === 'temporary' ? Number(banDays) || 7 : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('apiErrors.banDenied'))
      setBanDialog(null)
      setBanComment('')
      setBanDays('7')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  const deleteAccount = async () => {
    if (!deleteDialog) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${deleteDialog.userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('apiErrors.deleteDenied'))
      setDeleteDialog(null)
      if (historyUserId === deleteDialog.userId) {
        setHistoryUserId(null)
        setHistoryDetail(null)
      }
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  const closeTable = async () => {
    if (!closeTableDialog) return
    setClosingRoomId(closeTableDialog.roomId)
    setError(null)
    try {
      const res = await fetch(`/api/admin/rooms/${closeTableDialog.roomId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('apiErrors.closeTableDenied'))
      setCloseTableDialog(null)
      // Seules les tables en direct changent : inutile de tout recharger.
      await loadLive()
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setClosingRoomId(null)
    }
  }

  const submitUnban = async () => {
    if (!unbanDialog) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: unbanDialog.userId, comment: unbanComment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('apiErrors.unbanDenied'))
      setUnbanDialog(null)
      setUnbanComment('')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  const toggleGlobalVoice = async (enabled: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/site-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ voiceEnabled: enabled }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tErrors('generic'))
      setVoiceEnabled(data.voiceEnabled)
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  const submitFeatureBan = async () => {
    if (!featureBanDialog) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users/feature-ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: featureBanDialog.userId,
          feature: featureBanDialog.feature,
          action: 'ban',
          durationDays: featureBanPermanent ? undefined : Number(featureBanDays) || 7,
          comment: featureBanComment,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tErrors('generic'))
      setFeatureBanDialog(null)
      setFeatureBanComment('')
      setFeatureBanDays('7')
      setFeatureBanPermanent(false)
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  const liftFeatureBan = async (userId: string, feature: 'voice' | 'chat') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users/feature-ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, feature, action: 'unban' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tErrors('generic'))
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Ouvre un retour : la liste ne porte que l'aperçu, le message complet et
   * les captures base64 sont chargés MAINTENANT, pour ce seul retour (F40).
   */
  const openFeedback = async (item: FeedbackItem) => {
    setSelectedFeedback(item)
    setFeedbackDetailLoading(true)
    try {
      const res = await fetch(`/api/admin/feedback/${item.id}`, { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      setSelectedFeedback((prev) => (prev?.id === item.id ? data.feedback : prev))
    } catch {
      /* le résumé de la liste reste affiché */
    } finally {
      setFeedbackDetailLoading(false)
    }
  }

  const updateFeedbackStatus = async (id: string, status: 'read' | 'resolved') => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('apiErrors.modifyDenied'))
      setFeedbackItems((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status,
                statusLabel: status === 'read' ? t('feedback.statusRead') : t('feedback.statusResolved'),
              }
            : f
        )
      )
      setSelectedFeedback((prev) =>
        prev?.id === id
          ? { ...prev, status, statusLabel: status === 'read' ? t('feedback.statusRead') : t('feedback.statusResolved') }
          : prev
      )
      if (status === 'resolved') {
        setSelectedFeedback(null)
      }
      // Les compteurs d'onglets et la page courante viennent du serveur.
      await loadFeedback(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  if (loading || !user || !canAccessSupervision(user.role)) {
    return (
      <SupervisionShell>
        <div className="h-9 w-56 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-11 w-full animate-pulse rounded-2xl bg-white/[0.04]" />
        <SkeletonRows rows={5} />
      </SupervisionShell>
    )
  }

  // La Salle — tendance dérivée de la même série 14 j (pas d'appel dédié) :
  // delta jour = dernier point vs veille ; delta semaine = 7 derniers points
  // vs les 7 précédents.
  const trendPoints = overview?.dailySeries ?? []
  const lastPoint = trendPoints[trendPoints.length - 1]
  const prevPoint = trendPoints[trendPoints.length - 2]
  const last7 = trendPoints.slice(-7)
  const prev7 = trendPoints.slice(-14, -7)
  const sumBy = (arr: DailyPoint[], key: 'visitors' | 'parties') => arr.reduce((s, p) => s + p[key], 0)
  const prevWeekVisitors = sumBy(prev7, 'visitors')
  const weekVisitorsDelta =
    prev7.length > 0 && prevWeekVisitors > 0
      ? Math.round(((sumBy(last7, 'visitors') - prevWeekVisitors) / prevWeekVisitors) * 100)
      : null
  const todayVisitorsDelta = lastPoint && prevPoint ? lastPoint.visitors - prevPoint.visitors : null

  const handleQueueAction = (id: string) => {
    const item = overview?.queue.find((q) => q.id === id)
    if (!item) return
    if (item.href === 'accounts') changeAccountSearch(item.title)
    setActiveTab(item.href)
  }

  // Fiche du dialogue Historique : un invité inactif depuis plus de
  // GUEST_STALE_DAYS n'a peut-être plus son cookie, même si sa session est
  // encore valide en base — jamais « Connexion active » dans ce cas.
  const historyUser = historyDetail?.user ?? null
  const historyGuestLost = historyUser
    ? isGuestProbablyLost({
        kind: historyUser.kind,
        lastSeenAt: historyUser.lastSeenAt,
        createdAt: historyUser.createdAt,
        sessionExpiresAt: historyUser.sessionExpiresAt,
      })
    : false
  // Date de purge déjà passée : le balayage (au fil du trafic, par lots) n'est
  // pas encore passé. On ne l'annonce pas au futur.
  const historyPurgeOverdue = historyUser?.guestPurgeAt ? isGuestPurgeOverdue(historyUser.guestPurgeAt) : false

  const handleQueueAcknowledge = async (id: string) => {
    const item = overview?.queue.find((q) => q.id === id)
    if (!item || queueBusyId) return
    setQueueBusyId(id)
    try {
      if (item.kind === 'feedback') {
        await fetch(`/api/admin/feedback/${item.targetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: 'resolved' }),
        })
      } else {
        await fetch(`/api/admin/users/${item.targetId}/ack-name-flag`, {
          method: 'POST',
          credentials: 'include',
        })
      }
      setOverview((prev) => (prev ? { ...prev, queue: prev.queue.filter((q) => q.id !== id) } : prev))
      void loadLive(true)
      if (item.kind === 'feedback') void loadFeedback(true)
    } finally {
      setQueueBusyId(null)
    }
  }

  return (
    <SupervisionShell>
      <SupervisionHeader
        kicker={t('kicker')}
        title={t('title')}
        roleBadge={<RoleBadge role={user.role} compact />}
        // « En ligne » = COMPTES actifs (User.lastSeenAt), la définition de
        // presence.ts : les navigateurs consentants ne sont qu'une tuile à
        // part. Sans statistiques (modérateurs), pas de chiffre du tout plutôt
        // qu'un « 0 en ligne » permanent.
        onlineLabel={
          stats
            ? t('header.onlineCount', {
                count: stats.connectedAccounts.filter((acc) => isOnline(acc.lastSeenAt)).length,
              })
            : undefined
        }
        onRefresh={() => void loadAll()}
        refreshLabel={t('header.refresh')}
        refreshing={busy}
      />

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-white/50">{subtitle}</p>
        <button
          type="button"
          onClick={() => setRolesHelpOpen((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-white/60 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          aria-expanded={rolesHelpOpen}
        >
          <Info className="h-3.5 w-3.5" />
          {t('rolesHelpTitle')}
          {rolesHelpOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {rolesHelpOpen && (
        <div className="space-y-1.5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-sm leading-relaxed text-white/70">
          <p><strong className="text-yellow-200">{t('roles.fondateur')}</strong> — {ROLE_DESCRIPTIONS.fondateur}</p>
          <p><strong className="text-rose-200">{t('roles.superadmin')}</strong> — {ROLE_DESCRIPTIONS.superadmin}</p>
          <p><strong className="text-amber-200">{t('roles.admin')}</strong> — {ROLE_DESCRIPTIONS.admin}</p>
          <p><strong className="text-teal-200">{t('roles.moderator')}</strong> — {ROLE_DESCRIPTIONS.moderator}</p>
          <p><strong className="text-white/80">{t('roles.user')}</strong> — {ROLE_DESCRIPTIONS.user}</p>
          <p className="text-xs text-white/40">{t('rolesHierarchy')}</p>
        </div>
      )}

      {error && (
        <ErrorState
          icon={AlertTriangle}
          message={error}
          retryLabel={t('states.retry')}
          onRetry={() => void loadAll()}
        />
      )}

      <SupervisionNav
        groups={navGroups}
        active={activeTab}
        onSelect={setActiveTab}
        groupAria={t('tabs.section')}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 space-y-4">
        {showAnalytics && (
        <>
        <TabsContent value="overview" className="space-y-4">
          {!dataLoaded ? (
            <SkeletonRows rows={4} />
          ) : (
          <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <KpiPlaque
              label={t('room.todayLabel')}
              value={stats?.visitors.today ?? 0}
              hint={t('stats.todayHint')}
              delta={
                todayVisitorsDelta != null
                  ? {
                      direction: todayVisitorsDelta >= 0 ? 'up' : 'down',
                      label: `${todayVisitorsDelta >= 0 ? '+' : ''}${todayVisitorsDelta} ${t('room.vsYesterday')}`,
                    }
                  : undefined
              }
            />
            <KpiPlaque
              label={t('room.weekLabel')}
              value={stats?.visitors.week ?? 0}
              hint={t('stats.weekHint')}
              delta={
                weekVisitorsDelta != null
                  ? {
                      direction: weekVisitorsDelta >= 0 ? 'up' : 'down',
                      label: `${weekVisitorsDelta >= 0 ? '+' : ''}${weekVisitorsDelta}% ${t('room.vsPrevWeek')}`,
                    }
                  : undefined
              }
            />
            <KpiPlaque
              // Navigateurs (statistiques acceptées), pas des comptes : jamais
              // intitulé « en ligne », réservé à la présence des comptes.
              label={t('stats.activeBrowsers')}
              value={stats?.visitors.onlineNow ?? 0}
              hint={t('stats.activeBrowsersHint', { minutes: ONLINE_WINDOW_MINUTES })}
            />
            <KpiPlaque
              label={t('room.queueTitle')}
              value={overview?.queue.length ?? 0}
              tone={overview && overview.queue.length > 0 ? 'alert' : 'default'}
            />
          </div>

          <SectionCard icon={CalendarDays} title={t('room.trendTitle')}>
            <TrendChart points={trendPoints} primaryLabel={t('room.trendVisitors')} secondaryLabel={t('room.trendParties')} />
          </SectionCard>

          {growth && (
            <SectionCard
              icon={Sparkles}
              title={t('growth.title')}
              description={t('growth.desc')}
              bodyClassName="space-y-4"
            >
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <GrowthMetric
                  label={t('growth.retentionD1Label')}
                  value={rateLabel(growth.retentionD1.rate)}
                  detail={t('growth.cohortDetail', {
                    retained: growth.retentionD1.retained,
                    cohort: growth.retentionD1.cohort,
                  })}
                  definition={t('growth.retentionD1Def', {
                    from: growth.windows.retentionD1CohortDays[0],
                    to: growth.windows.retentionD1CohortDays[1],
                  })}
                />
                <GrowthMetric
                  label={t('growth.retentionD7Label')}
                  value={rateLabel(growth.retentionD7.rate)}
                  detail={t('growth.cohortDetail', {
                    retained: growth.retentionD7.retained,
                    cohort: growth.retentionD7.cohort,
                  })}
                  definition={t('growth.retentionD7Def', {
                    from: growth.windows.retentionD7CohortDays[0],
                    to: growth.windows.retentionD7CohortDays[1],
                  })}
                />
                <GrowthMetric
                  label={t('growth.registeredShareLabel')}
                  value={rateLabel(growth.registeredShare.share)}
                  detail={t('growth.registeredShareDetail', {
                    registered: growth.registeredShare.registered,
                    guests: growth.registeredShare.guests,
                  })}
                  definition={t('growth.registeredShareDef', {
                    days: growth.windows.registeredShareDays,
                  })}
                />
                <GrowthMetric
                  label={t('growth.abandonedLabel')}
                  value={String(growth.abandonedTables.stalled)}
                  detail={t('growth.abandonedDetail', {
                    stalled: growth.abandonedTables.stalled,
                    live: growth.abandonedTables.live,
                  })}
                  definition={t('growth.abandonedDef')}
                  tone={growth.abandonedTables.stalled > 0 ? 'alert' : 'default'}
                />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  {t('growth.playersByGameTitle')}
                </p>
                {growth.playersByGame.length === 0 ? (
                  <p className="mt-1.5 text-sm text-white/40">{t('growth.noData')}</p>
                ) : (
                  <ul className="mt-1.5 space-y-1.5">
                    {growth.playersByGame.map((row) => (
                      <li
                        key={row.gameId}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-sm text-white">
                          <GameIconById id={row.gameId} className="h-4 w-4 shrink-0 text-gold" />
                          <span className="truncate">{row.gameTitle}</span>
                        </span>
                        <Badge variant="secondary" className="tabular-nums">{row.players}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
                  {t('growth.playersByGameDef', {
                    days: growth.windows.playersByGameDays,
                  })}
                </p>
              </div>

              {/* Ces chiffres sortent d'un cache serveur : on dit à quelle
                  heure ils ont été calculés plutôt que de les laisser passer
                  pour du temps réel. */}
              <p className="border-t border-white/[0.07] pt-2 text-[11px] text-white/35">
                {t('growth.freshness', {
                  time: format.dateTime(new Date(growth.computedAt), { timeStyle: 'short', timeZone: PARIS_TIME_ZONE }),
                  minutes: Math.max(1, Math.round(growth.cacheSeconds / 60)),
                })}
              </p>
            </SectionCard>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard icon={Gamepad2} title={t('room.liveTablesTitle')} description={t('room.liveTablesDesc')}>
              {(overview?.liveTables ?? []).length === 0 ? (
                <EmptyState icon={Gamepad2} title={t('room.liveTablesEmpty')} hint={t('room.liveTablesEmptyHint')} />
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {overview?.liveTables.map((tbl) => (
                    <LiveTableCard
                      key={tbl.id}
                      icon={tbl.gameId ? <GameIconById id={tbl.gameId} className="h-4 w-4 shrink-0 text-gold" /> : undefined}
                      gameTitle={tbl.gameTitle}
                      code={tbl.code}
                      status={tbl.status}
                      statusLabel={t(
                        tbl.status === 'waiting'
                          ? 'room.statusWaiting'
                          : tbl.status === 'briefing'
                            ? 'room.statusBriefing'
                            : tbl.status === 'cast'
                              ? 'room.statusCast'
                              : 'room.statusPlaying'
                      )}
                      memberCount={tbl.memberCount}
                      memberNames={tbl.memberNames}
                      elapsed={formatPresenceDuration((Date.now() - new Date(tbl.createdAt).getTime()) / 1000, durationUnits)}
                      stalled={tbl.stalled}
                      stalledLabel={t('room.stalledFor', { duration: idleLabel(tbl.idleSeconds) })}
                      turnLabel={
                        tbl.status === 'cast'
                          ? tbl.hostName
                            ? t('room.castHost', { name: tbl.hostName })
                            : undefined
                          : tbl.currentTurnName
                            ? t('room.turnLabel', { name: tbl.currentTurnName })
                            : undefined
                      }
                      closeLabel={canEditAccounts ? t('room.closeTable') : undefined}
                      onClose={
                        canEditAccounts
                          ? () =>
                              setCloseTableDialog({
                                roomId: tbl.id,
                                code: tbl.code,
                                gameTitle: tbl.gameTitle,
                                memberCount: tbl.memberCount,
                              })
                          : undefined
                      }
                      closing={closingRoomId === tbl.id}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={MessageSquareWarning} title={t('room.queueTitle')} description={t('room.queueDesc')}>
              {(overview?.queue ?? []).length === 0 ? (
                <EmptyState icon={CheckCheck} title={t('room.queueEmpty')} hint={t('room.queueEmptyHint')} />
              ) : (
                <QueueList
                  items={(overview?.queue ?? []).map((q) => ({
                    id: q.id,
                    icon: q.kind === 'feedback' ? MessageSquareWarning : UserX,
                    title: q.title,
                    subtitle: q.subtitle,
                    // Un modérateur lit les retours mais ne les clôt pas (F44).
                    canAcknowledge: q.kind === 'feedback' ? canTriageFeedback : canEditAccounts,
                  }))}
                  viewLabel={t('room.queueViewAction')}
                  acknowledgeLabel={t('room.queueAckAction')}
                  onView={handleQueueAction}
                  onAcknowledge={(id) => void handleQueueAcknowledge(id)}
                  busyId={queueBusyId}
                />
              )}
            </SectionCard>
          </div>

          {/* Journal des parties : panneau autonome, hors de la boucle de
              15 s (F40) — il se charge à l'ouverture de l'onglet. */}
          <GameSessionsPanel />

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard icon={ScrollText} title={t('room.journalTitle')} description={t('room.journalDesc')}>
              {(overview?.journal ?? []).length === 0 ? (
                <EmptyState icon={ScrollText} title={t('room.journalEmpty')} />
              ) : (
                <JournalList
                  entries={(overview?.journal ?? []).map((e) => ({
                    id: e.id,
                    kind: e.kind,
                    time: format.dateTime(new Date(e.createdAt), { timeStyle: 'short', timeZone: PARIS_TIME_ZONE }),
                    text: journalText(t, e),
                  }))}
                />
              )}
            </SectionCard>

            <SectionCard
              icon={Gamepad2}
              title={t('games.playedTitle')}
              description={
                stats?.games?.totalParties != null
                  ? t('games.totalParties', {
                      count: stats.games.totalParties,
                      plural: stats.games.totalParties > 1 ? 's' : '',
                    })
                  : undefined
              }
            >
              {(stats?.games?.games ?? []).length === 0 ? (
                <EmptyState icon={Gamepad2} title={t('games.noneRecorded')} />
              ) : (
                <ul className="space-y-2">
                  {stats?.games?.games.map((game) => (
                    <li
                      key={game.gameId}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
                    >
                      <span className="flex items-center gap-2.5 text-sm text-white">
                        <GameIconById id={game.gameId} className="h-4 w-4 text-gold" />
                        <span className="font-medium">{game.title}</span>
                      </span>
                      <Badge variant="secondary" className="tabular-nums">
                        {game.partiesPlayed}{' '}
                        {game.partiesPlayed > 1 ? t('games.parties') : t('games.party')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Tous les comptes, invités compris (lot 2) : la tuile ne comptait
                que les comptes à mot de passe (15 sur 28). Même décompte que
                la liste Comptes et que la répartition par rôle. */}
            <SectionCard icon={Users} title={t('accounts.overviewTitle')} bodyClassName="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-5">
                <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 sm:p-3">
                  <p className="text-xl font-bold text-white sm:text-2xl">{stats?.accounts.total ?? 0}</p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.total')}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-chip-blue/25 bg-chip-blue/10 p-2.5 sm:p-3">
                  <p className="text-xl font-bold text-sky-200 sm:text-2xl">{stats?.accounts.byRole.moderator ?? 0}</p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.moderators')}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 sm:p-3">
                  <p className="text-xl font-bold text-amber-200 sm:text-2xl">{stats?.accounts.byRole.admin ?? 0}</p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.admins')}</p>
                </div>
                <div className="min-w-0 rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5 sm:p-3">
                  <p className="text-xl font-bold text-rose-200 sm:text-2xl">{stats?.accounts.byRole.superadmin ?? 0}</p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.superAdmins')}</p>
                </div>
                <div className="col-span-2 min-w-0 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-2.5 sm:col-span-1 sm:p-3">
                  <p className="text-xl font-bold text-yellow-200 sm:text-2xl">{stats?.accounts.byRole.fondateur ?? 0}</p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.founders')}</p>
                </div>
              </div>
              {stats?.accounts.byKind && (
                <p className="text-xs leading-relaxed text-white/55">
                  {t('accounts.kindSummary', kindSummaryValues(stats.accounts.total, stats.accounts.byKind))}
                </p>
              )}
            </SectionCard>

            <SectionCard icon={Gavel} title={t('bans.activeTitle')} description={t('bans.suspendedCount', { count: bans.length })}>
              {bans.length === 0 ? (
                <EmptyState icon={ShieldCheck} title={t('bans.noneOverview')} />
              ) : (
                <ul className="space-y-2">
                  {bans.slice(0, 5).map((b) => (
                    <li key={b.id} className="text-sm text-white/70">
                      <span className="font-medium text-white">{b.displayName}</span>
                      {b.accountCode && <span className="font-mono text-amber-200/70"> {b.accountCode}</span>}
                      {' — '}
                      {b.banType === 'permanent'
                        ? t('bans.permanent').toLowerCase()
                        : t('bans.until', {
                            date: b.bannedUntil ? format.dateTime(new Date(b.bannedUntil), { dateStyle: 'medium', timeZone: PARIS_TIME_ZONE }) : '?',
                          })}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard
            icon={Globe}
            title={t('connected.recentTitle')}
            description={t('connected.recentWindowDesc', { minutes: ONLINE_WINDOW_MINUTES })}
          >
              {(stats?.connectedAccounts ?? []).length === 0 ? (
                <EmptyState icon={Inbox} title={t('connected.noneRecent')} />
              ) : (
                <ul className="space-y-2">
                  {stats?.connectedAccounts.map((acc) => (
                    <li
                      key={acc.id}
                      className="min-w-0 space-y-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span className="text-base leading-none">{countryFlag(acc.country)}</span>
                        <span className="min-w-0 break-words text-sm font-medium text-white sm:text-base">{acc.displayName}</span>
                        <AccountCodeBadge code={acc.accountCode} />
                        {/* Rôle pour l'équipe seulement : le type (badge voisin)
                            dit déjà invité ou compte, plus de « Joueur » accolé
                            à « Invité ». */}
                        {acc.role !== 'user' && <RoleBadge role={acc.role} compact />}
                        {/* Liste servie par User.lastSeenAt, tous types, invités
                            compris ; « En ligne » recalculé à chaque rendu. */}
                        <AccountKindBadge kind={acc.accountKind} lastSeenAt={acc.lastSeenAt} createdAt={null} compact />
                        {isOnline(acc.lastSeenAt) && (
                          <Badge className="border-green-500/30 bg-green-500/10 text-[10px] text-green-300 sm:text-xs">
                            {t('accounts.online')}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1.5 border-t border-white/5 pt-2 text-xs text-white/45">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <IpAddressDisplay
                            ips={
                              acc.ips && acc.ips.length > 0
                                ? acc.ips
                                : acc.ip
                                  ? [{ ip: acc.ip, country: acc.country, lastSeenAt: acc.lastSeenAt ?? '' }]
                                  : []
                            }
                            onIpClick={handleIpClick}
                            onNetworkClick={handleNetworkLookup}
                            compact
                            device={acc.lastDevice}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>{countryLabel(acc.country, locale, t('unknownCountry'))}</span>
                          {acc.lastSeenAt && (
                            <span>
                              · {format.dateTime(new Date(acc.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </SectionCard>
          </>
          )}
        </TabsContent>

        <TabsContent value="geo" className="grid gap-4 md:grid-cols-2">
          <CountryList
            title={t('geo.onlineByCountry')}
            description={t('geo.onlineByCountryWindowDesc', { minutes: ONLINE_WINDOW_MINUTES })}
            rows={stats?.visitors.onlineByCountry ?? []}
            onCountryClick={handleCountryClick}
          />
          <CountryList
            title={t('geo.todayByCountry')}
            description={t('geo.todayByCountryDesc')}
            rows={stats?.visitors.visitorsTodayByCountry ?? []}
            onCountryClick={handleCountryClick}
          />
          <IpVisitorList
            rows={stats?.visitorIpList ?? []}
            onIpClick={handleIpClick}
            onNetworkClick={handleNetworkLookup}
            onOpenAccount={setHistoryUserId}
          />
        </TabsContent>
        </>
        )}

        <TabsContent value="accounts" className="space-y-4">
          <SectionCard title={t('accounts.adminTitle')} description={t('accounts.adminDesc')} bodyClassName="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input
                  className="bg-black/30 pl-9"
                  placeholder={t('accounts.searchPlaceholder')}
                  value={accountSearch}
                  onChange={(e) => changeAccountSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 shrink-0 text-white/35" />
                  <span className="text-xs text-white/45 sm:hidden">{t('accounts.rolePlaceholder')}</span>
                </div>
                <Select value={accountFilterRole} onValueChange={setAccountFilterRole}>
                  <SelectTrigger className="w-full bg-black/30 sm:w-[150px]" aria-label={t('accounts.rolePlaceholder')}>
                    <SelectValue placeholder={t('accounts.rolePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('accounts.allRoles')}</SelectItem>
                    <SelectItem value="user">{t('accounts.players')}</SelectItem>
                    <SelectItem value="moderator">{t('accounts.moderators')}</SelectItem>
                    <SelectItem value="admin">{t('accounts.admins')}</SelectItem>
                    <SelectItem value="superadmin">{t('accounts.superAdmins')}</SelectItem>
                    <SelectItem value="fondateur">{t('accounts.founders')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={accountFilterStatus} onValueChange={setAccountFilterStatus}>
                  <SelectTrigger className="w-full bg-black/30 sm:w-[150px]" aria-label={t('accounts.statusPlaceholder')}>
                    <SelectValue placeholder={t('accounts.statusPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('accounts.allStatus')}</SelectItem>
                    <SelectItem value="online">{t('accounts.online')}</SelectItem>
                    <SelectItem value="banned">{t('accounts.banned')}</SelectItem>
                  </SelectContent>
                </Select>
                {/* Type et activité (lot 2) : filtrés EN BASE, comme le rôle. Le
                    type « invités » ne garde que ceux qui ont encore une
                    session valide ; les orphelins ont leur propre entrée. */}
                <Select value={accountFilterKind} onValueChange={setAccountFilterKind}>
                  <SelectTrigger className="w-full bg-black/30 sm:w-[190px]" aria-label={t('accounts.kindPlaceholder')}>
                    <SelectValue placeholder={t('accounts.kindPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('accounts.allKinds')}</SelectItem>
                    <SelectItem value="password">{t('accountKind.password')}</SelectItem>
                    <SelectItem value="google">{t('accountKind.google')}</SelectItem>
                    <SelectItem value="guest">{t('accounts.kindGuests')}</SelectItem>
                    <SelectItem value="guest_orphan">{t('accounts.kindOrphans')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={accountFilterActivity} onValueChange={setAccountFilterActivity}>
                  <SelectTrigger className="w-full bg-black/30 sm:w-[160px]" aria-label={t('accounts.activityPlaceholder')}>
                    <SelectValue placeholder={t('accounts.activityPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('accounts.allActivity')}</SelectItem>
                    <SelectItem value="24h">{t('accounts.activity24h')}</SelectItem>
                    <SelectItem value="7d">{t('accounts.activity7d')}</SelectItem>
                    <SelectItem value="inactive30">{t('accounts.activityInactive30')}</SelectItem>
                    <SelectItem value="never">{t('accounts.activityNever')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={accountSort}
                  onValueChange={(value) => setAccountSort(value === 'created' ? 'created' : 'activity')}
                >
                  <SelectTrigger className="w-full bg-black/30 sm:w-[200px]" aria-label={t('accounts.sortPlaceholder')}>
                    <SelectValue placeholder={t('accounts.sortPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activity">{t('accounts.sortActivity')}</SelectItem>
                    <SelectItem value="created">{t('accounts.sortCreated')}</SelectItem>
                  </SelectContent>
                </Select>
                {(accountSearch ||
                  accountFilterRole !== 'all' ||
                  accountFilterStatus !== 'all' ||
                  accountFilterKind !== 'all' ||
                  accountFilterActivity !== 'all') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white/50"
                    onClick={() => {
                      changeAccountSearch('')
                      setAccountFilterRole('all')
                      setAccountFilterStatus('all')
                      setAccountFilterKind('all')
                      setAccountFilterActivity('all')
                    }}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    {t('accounts.resetFilters')}
                  </Button>
                )}
              </div>

              {/* Décompte NON filtré, le même que la tuile de la vue
                  d'ensemble : il ne bouge pas avec la recherche. */}
              {accountCounts && (
                <div className="space-y-0.5">
                  <p className="text-xs leading-relaxed text-white/60">
                    {t('accounts.kindSummary', kindSummaryValues(accountCounts.total, accountCounts))}
                  </p>
                  <p className="text-[11px] leading-relaxed text-white/35">{t('accounts.countsNote')}</p>
                </div>
              )}

              {(accountSearch.trim() ||
                accountFilterRole !== 'all' ||
                accountFilterStatus !== 'all' ||
                accountFilterKind !== 'all' ||
                accountFilterActivity !== 'all') && (
                <p className="text-xs text-white/45">
                  {t('accounts.matchCount', {
                    total: usersTotal,
                    plural: usersTotal > 1 ? 's' : '',
                  })}
                </p>
              )}

              {ipLookupLoading && (
                <p className="text-sm text-white/45">{t('accounts.ipAnalyzing')}</p>
              )}

              {ipLookup && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
                  {/* overflow-wrap anywhere : une IPv6 se coupe si elle ne tient
                      pas sur un téléphone, sans hacher le reste de la phrase. */}
                  <p className="font-medium text-amber-100 [overflow-wrap:anywhere]">
                    {ipLookup.mode === 'network' && ipLookup.network
                      ? t('ipNetwork.lookupSummary', {
                          network: ipLookup.network.key,
                          accounts: ipLookup.accounts.length,
                          visitors: ipLookup.visitors.length,
                        })
                      : t('accounts.ipSummary', {
                          ip: ipLookup.ip,
                          accounts: ipLookup.accounts.length,
                          accountsPlural: ipLookup.accounts.length > 1 ? 's' : '',
                          visitors: ipLookup.visitors.length,
                          visitorsPlural: ipLookup.visitors.length > 1 ? 's' : '',
                        })}
                  </p>
                  {/* Libellé obligatoire : un réseau rassemble un foyer, un bar,
                      une colocation — jamais la preuve d'une même personne. */}
                  {ipLookup.mode === 'network' && (
                    <p className="mt-0.5 text-xs text-amber-100/70">{t('ipNetwork.lookupNote')}</p>
                  )}
                  {ipLookup.accounts.length > 0 && (
                    <ul className="mt-2 space-y-1 text-white/70">
                      {ipLookup.accounts.map((acc) => (
                        <li key={acc.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="min-w-0 break-words">{acc.displayName}</span>
                          {acc.accountCode && (
                            <span className="font-mono text-amber-200/70">{acc.accountCode}</span>
                          )}
                          {/* Comptes Google et invités compris (lot 2). Sans date
                              de création, la dernière activité sert de référence. */}
                          {acc.kind && (
                            <AccountKindBadge
                              kind={acc.kind}
                              lastSeenAt={acc.lastSeenAt}
                              createdAt={acc.createdAt ?? acc.lastSeenAt}
                              sessionExpiresAt={acc.sessionExpiresAt}
                              compact
                            />
                          )}
                          {isOnline(acc.lastSeenAt) && <span className="text-green-300">· {t('accounts.online').toLowerCase()}</span>}
                          {acc.banned && <span className="text-red-300">· {t('accounts.banned').toLowerCase()}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* La recherche est vidée en mode réseau : la liste sous le
                      bandeau est celle de tous les comptes, pas le résultat. */}
                  {ipLookup.mode === 'network' && (
                    <p className="mt-2 text-xs text-white/45">{t('ipNetwork.listNotFiltered')}</p>
                  )}
                </div>
              )}
              {users.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/45">
                  {usersLoading ? t('loading') : t('accounts.noMatch')}
                </p>
              ) : (
              users.map((u) => {
                // Même fenêtre que le filtre « En ligne » du serveur (presence.ts).
                const accountOnline = isOnline(u.lastSeenAt)
                return (
                <div
                  key={u.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:border-white/[0.16]"
                >
                  {/* En-tête compact (accordéon) : pastille + pseudo + badges.
                      Le détail et les actions se déplient au clic. */}
                  <button
                    type="button"
                    aria-expanded={expandedAccounts.has(u.id)}
                    onClick={() =>
                      setExpandedAccounts((prev) => {
                        const next = new Set(prev)
                        if (next.has(u.id)) next.delete(u.id)
                        else next.add(u.id)
                        return next
                      })
                    }
                    className="flex w-full flex-wrap items-center gap-2 p-3.5 text-left"
                  >
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            accountOnline ? 'bg-emerald-400' : 'bg-white/20'
                          )}
                          title={accountOnline ? t('accounts.online') : undefined}
                          aria-hidden
                        />
                        <span className="min-w-0 break-words font-medium text-white">{u.displayName}</span>
                        <AccountCodeBadge code={u.accountCode} />
                        <RoleBadge role={u.role} compact />
                        <AccountKindBadge
                          kind={u.kind}
                          lastSeenAt={u.lastSeenAt}
                          createdAt={u.createdAt}
                          sessionExpiresAt={u.sessionExpiresAt}
                          compact
                        />
                        {u.ban.banned && (
                          <Badge className="border-red-500/30 bg-red-500/15 text-red-200">
                            <Ban className="mr-1 h-3 w-3" />
                            {t('accounts.banned')}
                          </Badge>
                        )}
                        {u.id === user.id && (
                          <Badge variant="outline" className="text-xs">
                            {t('accounts.you')}
                          </Badge>
                        )}
                        <ChevronDown
                          className={cn(
                            'ml-auto h-4 w-4 shrink-0 text-white/40 transition-transform',
                            expandedAccounts.has(u.id) && 'rotate-180'
                          )}
                          aria-hidden
                        />
                  </button>

                  {expandedAccounts.has(u.id) && (
                  <div className="flex flex-col gap-3 border-t border-white/10 p-3.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      {canEditAccounts && canModifyTarget(user!.role, u.role) && (
                        <Input
                          className="w-full max-w-full bg-black/30 sm:max-w-[240px]"
                          value={editingNames[u.id] ?? u.displayName}
                          onChange={(e) =>
                            setEditingNames((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                          onBlur={() => {
                            const next = (editingNames[u.id] ?? '').trim()
                            if (next && next !== u.displayName) {
                              updateUser(u.id, { displayName: next })
                            }
                          }}
                        />
                      )}
                      {/* Un invité n'a pas d'email : pas de ligne vide. */}
                      {u.email && <p className="truncate text-xs text-white/45">{u.email}</p>}
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-white/30">
                        <span>
                          {t('accounts.registeredOn', {
                            date: format.dateTime(new Date(u.createdAt), { dateStyle: 'medium', timeZone: PARIS_TIME_ZONE }),
                          })}
                        </span>
                        {u.lastCountry && (
                          <span>
                            · {countryFlag(u.lastCountry)} {countryLabel(u.lastCountry, locale, t('unknownCountry'))}
                          </span>
                        )}
                        {u.lastIp || (u.ips && u.ips.length > 0) ? (
                          <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                            ·{' '}
                            <IpAddressDisplay
                              ips={
                                u.ips && u.ips.length > 0
                                  ? u.ips
                                  : u.lastIp
                                    ? [{ ip: u.lastIp, country: u.lastCountry, lastSeenAt: u.lastSeenAt ?? '' }]
                                    : []
                              }
                              onIpClick={handleIpClick}
                              // Liste ouverte aux modérateurs : « Même réseau » reste admin.
                              onNetworkClick={showAnalytics ? handleNetworkLookup : undefined}
                              compact
                              device={u.lastDevice}
                            />
                          </span>
                        ) : null}
                        {u.lastSeenAt && (
                          <span>
                            ·{' '}
                            {t('accounts.seenOn', {
                              date: format.dateTime(new Date(u.lastSeenAt), {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                                timeZone: PARIS_TIME_ZONE,
                              }),
                            })}
                          </span>
                        )}
                        {u.guestPurgeAt && (
                          <span>
                            ·{' '}
                            {/* Jour déjà passé : le balayage n'est pas encore passé. */}
                            {isGuestPurgeOverdue(u.guestPurgeAt)
                              ? t('history.guestPurgePending')
                              : t('history.guestPurge', {
                                  date: format.dateTime(new Date(u.guestPurgeAt), {
                                    dateStyle: 'medium',
                                    timeZone: PARIS_TIME_ZONE,
                                  }),
                                })}
                          </span>
                        )}
                      </div>
                      {showAccountActivity && (
                        <UserActivityLines
                          compact
                          lastLoginAt={u.lastLoginAt}
                          totalPresenceSeconds={u.totalPresenceSeconds}
                        />
                      )}
                      {u.ban.banned && u.ban.banComment && (
                        <p className="text-xs text-red-300/80">{t('accounts.banReason', { reason: u.ban.banComment })}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setHistoryUserId(u.id)}
                      >
                        <History className="mr-1 h-3.5 w-3.5" />
                        {t('accounts.history')}
                      </Button>

                      {canAssignRoles(user.role) &&
                        u.id !== user.id &&
                        canModifyTarget(user.role, u.role) &&
                        (u.isGuest ? (
                          // Invité : aucun rôle d'équipe possible (son seul
                          // identifiant est un cookie) ; le serveur répond 409.
                          <p className="min-w-0 self-center text-[11px] text-white/40">{t('accounts.guestNoRole')}</p>
                        ) : (
                          <Select
                            value={u.role}
                            onValueChange={(role) => updateUser(u.id, { role })}
                            disabled={busy}
                          >
                            <SelectTrigger className="w-full bg-black/30 sm:w-[180px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {assignableRoleOptions.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {roleLabel(r)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ))}
                    </div>
                  </div>

                  {u.id !== user.id &&
                    (canTemporaryBanTarget(user.role, u.role) ||
                      canPermanentBanTarget(user.role, u.role) ||
                      canDeleteTarget(user.role, u.role)) && (
                    <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                      {u.ban.banned ? (
                        canTemporaryBanTarget(user.role, u.role) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              setUnbanDialog({ userId: u.id, displayName: u.displayName, isGuest: u.isGuest })
                            }
                          >
                            {t('accounts.liftBan')}
                          </Button>
                        )
                      ) : (
                        <>
                          {canPermanentBanTarget(user.role, u.role) && (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busy}
                              onClick={() =>
                                setBanDialog({
                                  userId: u.id,
                                  displayName: u.displayName,
                                  type: 'permanent',
                                  isGuest: u.isGuest,
                                })
                              }
                            >
                              <UserX className="mr-1 h-3.5 w-3.5" />
                              {t('accounts.permanentBan')}
                            </Button>
                          )}
                          {canTemporaryBanTarget(user.role, u.role) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-orange-500/40 text-orange-300"
                              disabled={busy}
                              // Un ban temporaire efface les sessions : pour un
                              // invité, c'est une perte définitive du compte.
                              title={u.isGuest ? t('dialogs.guestTemporaryBanWarning') : undefined}
                              onClick={() =>
                                setBanDialog({
                                  userId: u.id,
                                  displayName: u.displayName,
                                  type: 'temporary',
                                  isGuest: u.isGuest,
                                })
                              }
                            >
                              <Clock className="mr-1 h-3.5 w-3.5" />
                              {t('accounts.temporaryBan')}
                            </Button>
                          )}
                        </>
                      )}
                      {canDeleteTarget(user.role, u.role) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            setDeleteDialog({
                              userId: u.id,
                              displayName: u.displayName,
                            })
                          }
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {t('accounts.deleteAccount')}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Sanctions ciblées : couper le vocal ou le chat écrit sans
                      bannir le compte (modérateur+ sur un grade inférieur). */}
                  {u.id !== user.id && canBanFeatureTarget(user.role, u.role) && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                      {(['voice', 'chat'] as const).map((feature) => {
                        const active = (u.featureBans ?? []).find((b) => b.feature === feature)
                        const Icon = feature === 'voice' ? Mic : MessageSquare
                        const label =
                          feature === 'voice'
                            ? t('featureBans.voice')
                            : t('featureBans.chat')
                        return active ? (
                          <Button
                            key={feature}
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            className="gap-1"
                            onClick={() => void liftFeatureBan(u.id, feature)}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {t('featureBans.lift', { feature: label })}
                            <span className="ml-1 text-[10px] text-white/50">
                              {active.permanent
                                ? t('featureBans.permanentShort')
                                : active.until
                                  ? format.dateTime(new Date(active.until), { dateStyle: 'short', timeZone: PARIS_TIME_ZONE })
                                  : ''}
                            </span>
                          </Button>
                        ) : (
                          <Button
                            key={feature}
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            className="gap-1 border-orange-500/40 text-orange-300"
                            onClick={() =>
                              setFeatureBanDialog({
                                userId: u.id,
                                displayName: u.displayName,
                                feature,
                              })
                            }
                          >
                            {feature === 'voice' ? (
                              <MicOff className="h-3.5 w-3.5" />
                            ) : (
                              <MessageSquare className="h-3.5 w-3.5" />
                            )}
                            {t('featureBans.ban', { feature: label })}
                          </Button>
                        )
                      })}
                    </div>
                  )}

                  {/* Cosmétiques : déblocage manuel par un FONDATEUR sur un
                      autre compte (effets de pseudo / cadres). */}
                  {user.role === 'fondateur' && u.id !== user.id && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        className="gap-1 border-amber-500/40 text-amber-300"
                        onClick={() =>
                          setCosmeticsDialog({ userId: u.id, displayName: u.displayName })
                        }
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {t('cosmetics.manage')}
                      </Button>
                    </div>
                  )}
                  </div>
                  )}
                </div>
                )
              })
              )}

              <Pager
                page={usersPage}
                pageSize={ACCOUNTS_PAGE_SIZE}
                total={usersTotal}
                onPage={setUsersPage}
                busy={usersLoading}
                summary={t('states.pageSummary', {
                  page: usersPage,
                  pages: Math.max(1, Math.ceil(usersTotal / ACCOUNTS_PAGE_SIZE)),
                  total: usersTotal,
                })}
                previousLabel={t('states.previousPage')}
                nextLabel={t('states.nextPage')}
              />
          </SectionCard>
        </TabsContent>

        {showBansTab && (
        <TabsContent value="bans">
          <SectionCard icon={Ban} title={t('bans.currentTitle')} description={t('bans.currentDesc')} bodyClassName="space-y-3">
              {bans.length === 0 ? (
                <EmptyState icon={ShieldCheck} title={t('bans.noneActive')} />
              ) : (
                bans.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-xl border border-red-500/20 bg-red-500/5 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-white">
                          {b.displayName}
                          <AccountCodeBadge code={b.accountCode} />
                        </p>
                        {b.email && <p className="truncate text-xs text-white/45">{b.email}</p>}
                      </div>
                      <Badge className="border-red-500/30 bg-red-500/15 text-red-200">
                        {b.banType === 'permanent' ? t('bans.permanent') : t('bans.temporary')}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-white/60">
                      {b.bannedAt && (
                        <p>{t('bans.bannedOn', { date: format.dateTime(new Date(b.bannedAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE }) })}</p>
                      )}
                      {b.banType === 'temporary' && b.bannedUntil && (
                        <p>{t('bans.expiresOn', { date: format.dateTime(new Date(b.bannedUntil), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE }) })}</p>
                      )}
                      {b.bannedByName && <p>{t('bans.by', { name: b.bannedByName })}</p>}
                      {b.banComment && (
                        <p className="text-red-200/80">{t('bans.comment', { comment: b.banComment })}</p>
                      )}
                    </div>
                    {canTemporaryBanTarget(user.role, b.role) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        disabled={busy}
                        onClick={() =>
                          setUnbanDialog({ userId: b.id, displayName: b.displayName, isGuest: b.isGuest === true })
                        }
                      >
                        {t('bans.unban')}
                      </Button>
                    )}
                  </div>
                ))
              )}
          </SectionCard>
        </TabsContent>
        )}

        {canEditAccounts && (
        <TabsContent value="moderation" className="space-y-4">
          {user && canManageSiteSettings(user.role) && (
            <SectionCard icon={Radio} title={t('siteSettings.title')} description={t('siteSettings.desc')}>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{t('siteSettings.voiceLabel')}</p>
                  <p className="text-xs text-white/50">
                    {voiceEnabled === null
                      ? '…'
                      : voiceEnabled
                        ? t('siteSettings.voiceOn')
                        : t('siteSettings.voiceOff')}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={voiceEnabled ? 'destructive' : 'default'}
                  disabled={busy || voiceEnabled === null}
                  onClick={() => void toggleGlobalVoice(!voiceEnabled)}
                >
                  {voiceEnabled ? t('siteSettings.disable') : t('siteSettings.enable')}
                </Button>
              </div>
            </SectionCard>
          )}
          <ModerationTermsPanel />
          <NameModerationAttemptsPanel />
        </TabsContent>
        )}

        {showFeedbackTab && (
        <TabsContent value="feedback" className="space-y-4">
          <SectionCard icon={MessageSquareWarning} title={t('feedback.activeTitle')} description={t('feedback.activeDesc')} bodyClassName="space-y-4">
              <FeedbackSearchBar
                value={feedbackSearch}
                onChange={setFeedbackSearch}
                placeholder={t('feedback.searchActive')}
                resultCount={feedbackTotal}
                totalCount={activeFeedbackTotal}
              />
              <FeedbackListSection
                items={feedbackItems}
                emptyMessage={
                  feedbackLoading
                    ? t('loading')
                    : feedbackSearch.trim()
                      ? t('feedback.noActiveSearch')
                      : t('feedback.noActive')
                }
                onSelect={openFeedback}
              />
              <Pager
                page={feedbackPage}
                pageSize={FEEDBACK_PAGE_SIZE}
                total={feedbackTotal}
                onPage={setFeedbackPage}
                busy={feedbackLoading}
                summary={t('states.pageSummary', {
                  page: feedbackPage,
                  pages: Math.max(1, Math.ceil(feedbackTotal / FEEDBACK_PAGE_SIZE)),
                  total: feedbackTotal,
                })}
                previousLabel={t('states.previousPage')}
                nextLabel={t('states.nextPage')}
              />
          </SectionCard>
        </TabsContent>
        )}

        {showFeedbackTab && (
        <TabsContent value="feedback-resolved" className="space-y-4">
          <SectionCard icon={CheckCheck} title={t('feedback.resolvedTitle')} description={t('feedback.resolvedDesc')} bodyClassName="space-y-4">
              <FeedbackSearchBar
                value={feedbackSearch}
                onChange={setFeedbackSearch}
                placeholder={t('feedback.searchResolved')}
                resultCount={feedbackTotal}
                totalCount={resolvedFeedbackTotal}
              />
              <FeedbackListSection
                items={feedbackItems}
                emptyMessage={
                  feedbackLoading
                    ? t('loading')
                    : feedbackSearch.trim()
                      ? t('feedback.noResolvedSearch')
                      : t('feedback.noResolved')
                }
                onSelect={openFeedback}
              />
              <Pager
                page={feedbackPage}
                pageSize={FEEDBACK_PAGE_SIZE}
                total={feedbackTotal}
                onPage={setFeedbackPage}
                busy={feedbackLoading}
                summary={t('states.pageSummary', {
                  page: feedbackPage,
                  pages: Math.max(1, Math.ceil(feedbackTotal / FEEDBACK_PAGE_SIZE)),
                  total: feedbackTotal,
                })}
                previousLabel={t('states.previousPage')}
                nextLabel={t('states.nextPage')}
              />
          </SectionCard>
        </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!closeTableDialog} onOpenChange={(open) => !open && setCloseTableDialog(null)}>
        <DialogContent className="border-red-500/30 bg-felt-deep text-white">
          <DialogHeader>
            <DialogTitle>{t('dialogs.closeTableTitle')}</DialogTitle>
            <DialogDescription className="text-white/50">
              {t('dialogs.closeTableLabel')}{' '}
              <strong className="text-white">
                {closeTableDialog?.gameTitle} — {closeTableDialog?.code}
              </strong>
              <br />
              {t('dialogs.closeTableWarning', { count: closeTableDialog?.memberCount ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseTableDialog(null)}>
              {t('dialogs.cancel')}
            </Button>
            <Button variant="destructive" disabled={closingRoomId !== null} onClick={closeTable}>
              {t('dialogs.closeTableConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="border-red-500/30 bg-felt-deep text-white">
          <DialogHeader>
            <DialogTitle>{t('dialogs.deleteTitle')}</DialogTitle>
            <DialogDescription className="text-white/50">
              {t('dialogs.deleteAccountLabel')}{' '}
              <strong className="text-white">{deleteDialog?.displayName}</strong>
              <br />
              {t('dialogs.deleteWarning')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              {t('dialogs.cancel')}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={deleteAccount}>
              {t('dialogs.deleteConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!unbanDialog} onOpenChange={(open) => !open && setUnbanDialog(null)}>
        <DialogContent className="border-white/10 bg-felt-deep text-white">
          <DialogHeader>
            <DialogTitle>{t('dialogs.unbanTitle')}</DialogTitle>
            <DialogDescription className="text-white/50">
              {t('dialogs.unbanAccountLabel')}{' '}
              <strong className="text-white">{unbanDialog?.displayName}</strong>
            </DialogDescription>
          </DialogHeader>
          {/* Le ban a effacé les sessions d'un invité : le lever ne lui rend
              rien, mais le remet dans la purge des orphelins (retention-sweep),
              qui l'emporte avec son historique de modération. Un modérateur,
              qui ne peut pas supprimer de compte, doit le savoir. */}
          {unbanDialog?.isGuest && (
            <p className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
              <span className="min-w-0">{t('dialogs.guestUnbanWarning')}</span>
            </p>
          )}
          <div>
            <label className="mb-1 block text-xs text-white/50">
              {t('dialogs.commentOptional')}
            </label>
            <textarea
              className="min-h-[80px] w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
              placeholder={t('dialogs.unbanPlaceholder')}
              value={unbanComment}
              onChange={(e) => setUnbanComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnbanDialog(null)}>
              {t('dialogs.cancel')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={submitUnban}>
              {t('dialogs.unbanConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!banDialog} onOpenChange={(open) => !open && setBanDialog(null)}>
        <DialogContent className="border-white/10 bg-felt-deep text-white">
          <DialogHeader>
            <DialogTitle>
              {banDialog?.type === 'permanent' ? t('dialogs.banPermanentTitle') : t('dialogs.banTemporaryTitle')}
            </DialogTitle>
            <DialogDescription className="text-white/50">
              {t('dialogs.banAccountLabel')}{' '}
              <strong className="text-white">{banDialog?.displayName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Le ban efface les sessions du compte : un invité (ni email, ni
                mot de passe, ni Google) ne peut plus jamais se reconnecter,
                même une fois le ban échu. */}
            {banDialog?.type === 'temporary' && banDialog.isGuest && (
              <p className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                <span className="min-w-0">{t('dialogs.guestTemporaryBanWarning')}</span>
              </p>
            )}
            {banDialog?.type === 'temporary' && (
              <div>
                <label className="mb-1 block text-xs text-white/50">{t('dialogs.durationDays')}</label>
                <Select value={banDays} onValueChange={setBanDays}>
                  <SelectTrigger className="bg-black/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('dialogs.day', { count: 1 })}</SelectItem>
                    <SelectItem value="3">{t('dialogs.days', { count: 3 })}</SelectItem>
                    <SelectItem value="7">{t('dialogs.days', { count: 7 })}</SelectItem>
                    <SelectItem value="14">{t('dialogs.days', { count: 14 })}</SelectItem>
                    <SelectItem value="30">{t('dialogs.days', { count: 30 })}</SelectItem>
                    <SelectItem value="90">{t('dialogs.days', { count: 90 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-white/50">
                {t('dialogs.banCommentLabel')}
              </label>
              <textarea
                className="min-h-[80px] w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
                placeholder={t('dialogs.banCommentPlaceholder')}
                value={banComment}
                onChange={(e) => setBanComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialog(null)}>
              {t('dialogs.cancel')}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={submitBan}>
              {t('dialogs.banConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!featureBanDialog} onOpenChange={(open) => !open && setFeatureBanDialog(null)}>
        <DialogContent className="border-white/10 bg-felt-deep text-white">
          <DialogHeader>
            <DialogTitle>
              {featureBanDialog?.feature === 'voice'
                ? t('featureBans.dialogVoiceTitle')
                : t('featureBans.dialogChatTitle')}
            </DialogTitle>
            <DialogDescription className="text-white/50">
              <strong className="text-white">{featureBanDialog?.displayName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                id="feature-ban-permanent"
                type="checkbox"
                className="h-4 w-4 accent-red-500"
                checked={featureBanPermanent}
                onChange={(e) => setFeatureBanPermanent(e.target.checked)}
              />
              <label htmlFor="feature-ban-permanent" className="text-sm text-white/80">
                {t('featureBans.permanent')}
              </label>
            </div>
            {!featureBanPermanent && (
              <div>
                <label className="mb-1 block text-xs text-white/50">{t('dialogs.durationDays')}</label>
                <Select value={featureBanDays} onValueChange={setFeatureBanDays}>
                  <SelectTrigger className="bg-black/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('dialogs.day', { count: 1 })}</SelectItem>
                    <SelectItem value="3">{t('dialogs.days', { count: 3 })}</SelectItem>
                    <SelectItem value="7">{t('dialogs.days', { count: 7 })}</SelectItem>
                    <SelectItem value="14">{t('dialogs.days', { count: 14 })}</SelectItem>
                    <SelectItem value="30">{t('dialogs.days', { count: 30 })}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-white/50">{t('dialogs.banCommentLabel')}</label>
              <textarea
                className="min-h-[70px] w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
                placeholder={t('dialogs.banCommentPlaceholder')}
                value={featureBanComment}
                onChange={(e) => setFeatureBanComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeatureBanDialog(null)}>
              {t('dialogs.cancel')}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={submitFeatureBan}>
              {t('featureBans.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CosmeticGrantsDialog target={cosmeticsDialog} onClose={() => setCosmeticsDialog(null)} />

      <Dialog
        open={!!historyUserId}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryUserId(null)
            setHistoryDetail(null)
            setHistoryError(null)
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-felt-deep text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('history.title')}</DialogTitle>
            <DialogDescription asChild className="text-white/50">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {historyDetail ? (
                  <>
                    <span className="min-w-0 break-words">{historyDetail.user.displayName}</span>
                    <AccountCodeBadge code={historyDetail.user.accountCode} />
                    <AccountKindBadge
                      kind={historyDetail.user.kind}
                      lastSeenAt={historyDetail.user.lastSeenAt}
                      createdAt={historyDetail.user.createdAt}
                      sessionExpiresAt={historyDetail.user.sessionExpiresAt}
                    />
                  </>
                ) : historyError ? (
                  <span>—</span>
                ) : (
                  <span>{t('loading')}</span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {historyError ? (
            <ErrorState
              icon={AlertTriangle}
              message={historyError}
              retryLabel={t('states.retry')}
              onRetry={() => {
                if (historyUserId) void loadUserHistory(historyUserId)
              }}
            />
          ) : historyLoading || !historyDetail ? (
            <p className="py-8 text-center text-white/50">{t('loading')}</p>
          ) : (
            <div className="space-y-4">
              {/* Invité orphelin : ni email, ni mot de passe, ni Google, et plus
                  de session. Personne ne peut rouvrir ce compte : on le dit en
                  premier, avec la date de sa suppression automatique. */}
              {historyDetail.user.kind === 'guest_orphan' && (
                <p className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-100">
                  <Unplug className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                  <span className="min-w-0">
                    {!historyDetail.user.guestPurgeAt
                      ? t('history.orphanInaccessible')
                      : historyPurgeOverdue
                        ? t('history.orphanPurgePending')
                        : t('history.orphanPurge', {
                            date: format.dateTime(new Date(historyDetail.user.guestPurgeAt), {
                              dateStyle: 'medium',
                              timeZone: PARIS_TIME_ZONE,
                            }),
                          })}
                  </span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">{t('geo.localPlayersLabel')}</p>
                  <p className="text-xl font-bold">{historyDetail.user.localPlayerCount}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">{t('history.partiesStats')}</p>
                  <p className="text-xl font-bold">{historyDetail.user.statsCount}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">{t('history.achievements')}</p>
                  <p className="text-xl font-bold">{historyDetail.user.achievementsCount}</p>
                </div>
                {/* Ex-tuile « Sessions » : elle comptait des jetons, expirés
                    compris, et se lisait comme un nombre de visites. Elle dit
                    maintenant si le compte peut encore servir, et jusqu'à quand.
                    Invité probablement perdu : la session existe en base, mais
                    rien ne prouve que son cookie aussi — jamais « Connexion
                    active » dans ce cas. */}
                <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">
                    {historyGuestLost ? t('history.sessionInDb') : t('history.activeConnection')}
                  </p>
                  {historyDetail.user.hasValidSession && historyDetail.user.sessionExpiresAt ? (
                    <p
                      className={cn(
                        'mt-1 break-words text-sm font-semibold',
                        historyGuestLost ? 'text-amber-200' : 'text-emerald-300'
                      )}
                    >
                      {/* Le JOUR seulement (servi ainsi) : l'heure d'échéance
                          redonnerait celle d'une visite. */}
                      {t(historyGuestLost ? 'history.sessionMaybeLost' : 'history.until', {
                        date: format.dateTime(new Date(historyDetail.user.sessionExpiresAt), {
                          dateStyle: 'medium',
                          timeZone: PARIS_TIME_ZONE,
                        }),
                      })}
                    </p>
                  ) : (
                    <p className="mt-1 break-words text-sm font-semibold text-white/60">
                      {t('history.noValidSession')}
                    </p>
                  )}
                </div>
              </div>

              {historyDetail.user.localPlayerNames.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/50">{t('history.localPlayerNames')}</p>
                  <p className="text-sm text-white/80">
                    {historyDetail.user.localPlayerNames.join(', ')}
                  </p>
                </div>
              )}

              <div className="min-w-0 text-sm text-white/60">
                <p>{t('history.mode', { mode: historyDetail.user.playMode })}</p>
                <p>{t('history.country', { country: countryLabel(historyDetail.user.lastCountry, locale, t('unknownCountry')) })}</p>
                {historyDetail.user.lastIp && (
                  <p className="flex flex-wrap items-center gap-2">
                    {t('history.ip')}{' '}
                    <span className="min-w-0 break-all font-mono text-amber-200/80">{historyDetail.user.lastIp}</span>
                    <DeviceBadge device={historyDetail.user.lastDevice} compact />
                  </p>
                )}
                <p>
                  {t('accounts.registeredOn', {
                    date: format.dateTime(new Date(historyDetail.user.createdAt), {
                      dateStyle: 'medium',
                      timeZone: PARIS_TIME_ZONE,
                    }),
                  })}
                </p>
                {historyDetail.user.lastSeenAt && (
                  <p>
                    {t('history.lastActivity', {
                      date: format.dateTime(new Date(historyDetail.user.lastSeenAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: PARIS_TIME_ZONE,
                      }),
                    })}
                  </p>
                )}
                {/* Invité avec session : sa suppression automatique recule à
                    chaque visite. L'orphelin a déjà son encart en tête. */}
                {historyDetail.user.kind === 'guest' && historyDetail.user.guestPurgeAt && (
                  <p>
                    {historyPurgeOverdue
                      ? t('history.guestPurgePending')
                      : t('history.guestPurge', {
                          date: format.dateTime(new Date(historyDetail.user.guestPurgeAt), {
                            dateStyle: 'medium',
                            timeZone: PARIS_TIME_ZONE,
                          }),
                        })}
                  </p>
                )}
              </div>

              {showAccountActivity && (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                    {t('history.playerActivity')}
                  </p>
                  <UserActivityLines
                    lastLoginAt={historyDetail.user.lastLoginAt}
                    totalPresenceSeconds={historyDetail.user.totalPresenceSeconds}
                  />
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-white/50">{t('history.gamesPlayed')}</p>
                    {historyDetail.user.gamesPlayed &&
                    historyDetail.user.gamesPlayed.length > 0 ? (
                      <ul className="space-y-1.5">
                        {historyDetail.user.gamesPlayed.map((g) => (
                          <li
                            key={g.gameId}
                            className="flex items-center justify-between rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm"
                          >
                            <span className="text-white/90">
                              {g.emoji} {g.title}
                            </span>
                            <Badge variant="secondary">
                              {g.partiesPlayed}{' '}
                              {g.partiesPlayed > 1 ? t('games.parties') : t('games.party')}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-white/45">{t('history.noParties')}</p>
                    )}
                  </div>
                </div>
              )}

              {historyDetail.user.ban.banned && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {t('history.currentlyBanned')}
                  {historyDetail.user.ban.banComment && (
                    <> — {historyDetail.user.ban.banComment}</>
                  )}
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                  {t('history.moderationHistory')}
                </p>
                {historyDetail.banHistory.length === 0 ? (
                  <p className="text-sm text-white/45">{t('history.noEvents')}</p>
                ) : (
                  <ul className="space-y-2">
                    {historyDetail.banHistory.map((ev) => (
                      <li
                        key={ev.id}
                        className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-white">{actionLabel(ev.action)}</p>
                        <p className="text-xs text-white/45">
                          {t('history.by', {
                            date: format.dateTime(new Date(ev.createdAt), {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                              timeZone: PARIS_TIME_ZONE,
                            }),
                            name: ev.actorName,
                          })}
                        </p>
                        {ev.comment && (
                          <p className="mt-1 text-white/70">{ev.comment}</p>
                        )}
                        {ev.bannedUntil && (
                          <p className="text-xs text-white/45">
                            {t('history.until', {
                              date: format.dateTime(new Date(ev.bannedUntil), {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                                timeZone: PARIS_TIME_ZONE,
                              }),
                            })}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedFeedback}
        onOpenChange={(open) => !open && setSelectedFeedback(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-felt-deep text-white sm:max-w-lg">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{selectedFeedback.typeLabel}</DialogTitle>
                  <Badge variant="secondary">{selectedFeedback.statusLabel}</Badge>
                </div>
                <DialogDescription className="text-white/50">
                  {selectedFeedback.authorName} ·{' '}
                  {format.dateTime(new Date(selectedFeedback.createdAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="whitespace-pre-wrap text-sm text-white/80">
                  {selectedFeedback.message ?? selectedFeedback.messagePreview}
                </p>
                {selectedFeedback.contactEmail && (
                  <p className="text-sm text-white/50">
                    {t('feedback.contact')}{' '}
                    <a
                      href={`mailto:${selectedFeedback.contactEmail}`}
                      className="text-amber-300 hover:underline"
                    >
                      {selectedFeedback.contactEmail}
                    </a>
                  </p>
                )}
                {selectedFeedback.pageUrl && (
                  <p className="text-xs text-white/40">{t('feedback.page')} {selectedFeedback.pageUrl}</p>
                )}
                {feedbackDetailLoading && selectedFeedback.screenshotCount > 0 && (
                  <p className="text-xs text-white/40">{t('feedback.loadingDetail')}</p>
                )}
                {(selectedFeedback.screenshots ?? []).length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-white/50">{t('feedback.screenshotsTitle')}</p>
                    <div className="flex flex-wrap gap-2">
                      {(selectedFeedback.screenshots ?? []).map((src, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLightboxImage(src)}
                          className="h-24 w-24 overflow-hidden rounded-lg border border-white/10"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={t('feedback.captureAlt', { index: i + 1 })} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                {canTriageFeedback && selectedFeedback.status === 'open' && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'read')}
                  >
                    {t('feedback.markRead')}
                  </Button>
                )}
                {canTriageFeedback && selectedFeedback.status !== 'resolved' && (
                  <Button
                    disabled={busy}
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'resolved')}
                  >
                    {t('feedback.resolved')}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!countryDialog}
        onOpenChange={(open) => {
          if (!open) {
            setCountryDialog(null)
            setCountryVisitors([])
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-felt-deep text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-amber-400" />
              {t('geo.countryDialogTitle', { title: countryDialog?.title ?? '' })}
            </DialogTitle>
            <DialogDescription className="text-white/50">
              {t('geo.countryDialogDesc')}
            </DialogDescription>
          </DialogHeader>
          {countryVisitorsLoading ? (
            <p className="py-8 text-center text-white/50">{t('loading')}</p>
          ) : countryVisitors.length === 0 ? (
            <p className="py-8 text-center text-white/50">{t('geo.noVisitorsForCountry')}</p>
          ) : (
            // Mêmes cartes que la liste Visiteurs, dépliables : IP du compte et
            // hors connexion, « Ouvrir la fiche ». Une recherche d'IP s'affiche
            // dans l'onglet Comptes et la fiche dans son propre dialogue : ce
            // dialogue se ferme, sinon il masquait le résultat.
            <VisitorCardList
              rows={countryVisitors}
              onIpClick={(ip) => {
                setCountryDialog(null)
                void handleIpClick(ip)
              }}
              onNetworkClick={(ip, network) => {
                setCountryDialog(null)
                void handleNetworkLookup(ip, network)
              }}
              onOpenAccount={(accountId) => {
                setCountryDialog(null)
                setHistoryUserId(accountId)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!lightboxImage} onOpenChange={(open) => !open && setLightboxImage(null)}>
        <DialogContent className="max-w-4xl border-white/10 bg-black/95 p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('feedback.lightboxTitle')}</DialogTitle>
          </DialogHeader>
          {lightboxImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={lightboxImage} alt={t('feedback.lightboxAlt')} className="max-h-[85vh] w-full object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </SupervisionShell>
  )
}
