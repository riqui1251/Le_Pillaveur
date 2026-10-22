"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from 'react'
import { useSearchParams } from 'next/navigation'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import {
  Ban,
  BarChart3,
  Clock,
  Crown,
  FileText,
  Globe,
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
  UserCheck,
  ServerCog,
} from 'lucide-react'
import { deviceLabel, type DeviceKind } from '@/lib/device-from-user-agent'
import { isGuestPurgeOverdue, parseAccountDeleteLogDetail, type AccountKind } from '@/lib/account-kind'
import type { LocalPlayStats, OnlinePlayStats, RetentionLastRun } from '@/lib/supervision-overview-server'
import type { ActiveAccountsStats } from '@/lib/active-accounts-server'
import type { OpsJobView } from '@/lib/ops-status-types'
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
  canViewOpsStatus,
  canViewSupervisionAnalytics,
  canViewSupervisionBans,
  canViewUserFeedback,
  roleLabel,
} from '@/lib/roles'
import { countryFlag, countryLabel } from '@/lib/country-display'
import { formatPresenceDuration, type DurationUnits } from '@/lib/format-presence'
import { PARIS_TIME_ZONE, parisDayStartUtc, parisDayString } from '@/lib/paris-time'
import { ACTIVE_WINDOW_MS, HONEST_PRESENCE_SINCE } from '@/lib/heartbeat'
import { ANALYTICS_CONSENT_V2_SINCE } from '@/lib/auth-cookies'
import { isOnline, ONLINE_WINDOW_MS } from '@/lib/presence'
import { type IpNetworkGroup } from '@/lib/ip-network'
import { deltaLabel, idleLabel, rateLabel } from '@/lib/supervision/labels'
import { networkGroupsOf } from '@/lib/supervision/ip-groups'
import {
  DEFAULT_STATS_VIEW,
  isModerationView,
  isStatsView,
  isSupervisionTab,
  moderationViewsFor,
  RESOLVED_SCOPE_PARAM,
  resolveSupervisionLocation,
  STATS_VIEWS,
  supervisionNavGroupsFor,
  supervisionTabsFor,
  supervisionUrlPatch,
  type FeedbackScope,
  type ModerationView,
  type StatsView,
  type SupervisionTab,
  type SupervisionView,
} from '@/lib/supervision/navigation'
import {
  DEFAULT_STATS_PERIOD,
  gameRows,
  gamesByDay,
  measureSpan,
  oldestComputedAt,
  parseStatsPeriod,
  phoneShare,
  STATS_PERIOD_STORAGE_KEY,
  STATS_PERIODS,
  weekOverWeekDelta,
  type MeasureSpan,
  type StatsPeriod,
} from '@/lib/supervision/stats-period'
import { HEALTH_OK_GROUP, healthPills, splitHealthPills, type HealthKey } from '@/lib/supervision/health'
import { accountsCoverageSince, weekFigures } from '@/lib/supervision/week'
import { methodGroups, resolveMessage, type MethodGroup, type MethodParams } from '@/lib/supervision/method'
import { parisDayToDate } from '@/lib/supervision/paris-day'
import { RETENTION_RUN_STALE_MS, retentionRunStatus } from '@/lib/supervision/retention-run'
import { acknowledgeQueueItem } from '@/lib/supervision/queue-ack'
import { FIRST_GAME_FEEDBACK_TYPE } from '@/lib/feedback'
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
import {
  Dialog,
  DialogClose,
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
import { ClientErrorsPanel } from '@/components/supervision/ClientErrorsPanel'
import { FirstGameFeedbackMeta, FirstGameFeedbackPanel } from '@/components/supervision/FirstGameFeedbackPanel'
import { OpsStatusPanel } from '@/components/supervision/OpsStatusPanel'
import { ACCOUNT_KIND_BADGES, AccountKindBadge } from '@/components/supervision/AccountKindBadge'
import {
  SupervisionShell,
  SupervisionHeader,
  SupervisionNav,
  supervisionNavItemId,
  SectionCard,
  KpiPlaque,
  LiveTableRow,
  HealthStrip,
  JournalList,
  QueueList,
  GrowthMetric,
  InfoToggle,
  InfoPanel,
  StatsFooter,
  SegmentedControl,
  Disclosure,
  useDefinitionToggle,
  Pager,
  SkeletonRows,
  EmptyState,
  ErrorState,
  type CountTone,
  type SupervisionNavGroup,
} from '@/components/supervision/SupervisionLayout'
import {
  BarList,
  ColumnChart,
  Sparkline,
  StackedBar,
  chartToneColor,
  type BarListRow,
  type ChartSeries,
  type ColumnChartDatum,
} from '@/components/supervision/charts'
import { GameIconById } from '@/components/hub/GameIconById'
import { cn } from '@/lib/utils'

/**
 * Taille des pages de la Supervision. La liste des comptes et celle des
 * retours sont paginées EN BASE (F40/F75) : le navigateur ne reçoit plus que
 * la page affichée.
 */
const ACCOUNTS_PAGE_SIZE = 25
const FEEDBACK_PAGE_SIZE = 25

/** Entrées du journal de l'équipe visibles dans la Salle ; tout l'historique est dans Modération › Journal. */
const TEAM_JOURNAL_PREVIEW = 5
const TEAM_JOURNAL_PAGE_SIZE = 25

/** Pastilles du bandeau santé qui déplient un détail sous lui plutôt que de mener ailleurs. */
const HEALTH_TOGGLE_KEYS: readonly string[] = ['retention', HEALTH_OK_GROUP]

/** Onglet ouvert par une pastille du bandeau : la sonde et les sauvegardes dans Serveur, le détail des plantages dans la vue Qualité des Statistiques. */
const HEALTH_TARGET: Readonly<Record<string, { tab: SupervisionTab; view?: SupervisionView } | undefined>> = {
  probe: { tab: 'ops' },
  backups: { tab: 'ops' },
  ops: { tab: 'ops' },
  crashes: { tab: 'stats', view: 'quality' },
} satisfies Partial<Record<HealthKey, { tab: SupervisionTab; view?: SupervisionView }>>

/** Libellé et icône de chaque onglet de la navigation. */
const TAB_META: Readonly<Record<SupervisionTab, { labelKey: `tabs.${string}`; icon: typeof LayoutDashboard }>> = {
  overview: { labelKey: 'tabs.overview', icon: LayoutDashboard },
  stats: { labelKey: 'tabs.stats', icon: BarChart3 },
  accounts: { labelKey: 'tabs.accountsShort', icon: Users },
  moderation: { labelKey: 'tabs.moderation', icon: Gavel },
  ops: { labelKey: 'tabs.ops', icon: ServerCog },
}

// Toutes les dates de la Supervision s'affichent à l'heure de Paris
// (PARIS_TIME_ZONE, src/lib/paris-time.ts, partagé avec les panneaux autonomes).

/** Fenêtre « en ligne » en minutes, pour les libellés (src/lib/presence.ts). */
const ONLINE_WINDOW_MINUTES = Math.round(ONLINE_WINDOW_MS / 60_000)

/** Unités de durée traduites (« 1 j 7 h » en français, « 1 d 7 h » en anglais…). */
function useDurationUnits(): DurationUnits {
  const t = useTranslations('supervision.units')
  return { s: t('s'), min: t('min'), h: t('h'), d: t('d') }
}

/**
 * « 13/09 » : jour de mise en production du battement honnête (gel de l'ancien
 * cumul, nouveau sens de la dernière activité), en jour de Paris.
 */
function useHonestPresenceSince(): string {
  const format = useFormatter()
  return format.dateTime(parisDayStartUtc(HONEST_PRESENCE_SINCE), {
    day: '2-digit',
    month: '2-digit',
    timeZone: PARIS_TIME_ZONE,
  })
}

/**
 * Textes communs du kit de graphiques (charts.tsx) : le kit n'appelle pas
 * useTranslations, tout lui arrive en props. « Jour », « Aucune donnée »,
 * « Voir tout (n) »… sont posés ici une fois, puis étalés dans chaque appel
 * (`{...texts.column}`), chaque graphe ajoutant ses propres libellés.
 */
function useChartTexts() {
  const t = useTranslations('supervision')
  return useMemo(
    () => ({
      column: { categoryLabel: t('charts.day'), emptyLabel: t('charts.noData'), totalLabel: t('charts.total') },
      list: {
        emptyLabel: t('charts.noData'),
        showAllLabel: (count: number) => t('charts.showAll', { count }),
        collapseLabel: t('charts.collapse'),
        shareLabel: t('charts.share'),
      },
      stacked: { emptyLabel: t('charts.noData'), shareLabel: t('charts.share') },
    }),
    [t]
  )
}

/** Un jour de Paris d'une série, prêt à devenir une colonne du kit. */
type DayValues = { day: string; values: Record<string, number>; muted?: boolean }

/**
 * Jours de Paris → colonnes du kit, à l'heure de Paris comme toute la page :
 * étiquette d'axe courte (« 26 »), libellé complet pour le bandeau de lecture
 * et la version texte (« ven. 26 sept. »). Le jour mis en avant est
 * AUJOURD'HUI, reconnu à sa date et non à sa place : une série mise en cache
 * juste avant minuit finit la veille, qu'on ne présente pas comme le jour
 * courant. `ariaFor` nomme le graphe avec sa période : l'axe n'écrit que le
 * numéro du jour, le mois n'y figure pas.
 */
function useDayCharts() {
  const t = useTranslations('supervision')
  const format = useFormatter()
  return useMemo(() => {
    const fullDay = (day: string) =>
      format.dateTime(parisDayToDate(day), { weekday: 'short', day: 'numeric', month: 'short', timeZone: PARIS_TIME_ZONE })
    const shortDay = (day: string) =>
      format.dateTime(parisDayToDate(day), { day: 'numeric', month: 'short', timeZone: PARIS_TIME_ZONE })
    const columns = (days: DayValues[]): ColumnChartDatum[] => {
      const today = parisDayString()
      return days.map((d) => ({
        key: d.day,
        label: format.dateTime(parisDayToDate(d.day), { day: 'numeric', timeZone: PARIS_TIME_ZONE }),
        fullLabel: fullDay(d.day),
        values: d.values,
        highlight: d.day === today,
        muted: d.muted,
      }))
    }
    const ariaFor = (title: string, days: string[]) =>
      days.length === 0
        ? title
        : t('charts.ariaDays', { title, from: shortDay(days[0]), to: shortDay(days[days.length - 1]) })
    return { columns, ariaFor, fullDay, shortDay }
  }, [t, format])
}

/** Nom accessible d'un bouton « i » : « Définition : Comptes actifs ». */
function useDefinitionLabel() {
  const t = useTranslations('supervision')
  return useCallback((label: string) => t('method.definitionOf', { label }), [t])
}

/**
 * Intitulé d'un graphe ou d'un groupe de chiffres, et sa précision d'une
 * ligne (unité, périmètre). `level` suit la hiérarchie de la carte : h3
 * directement sous le titre de la section, h4 sous un groupe déjà titré. Un
 * h4 passe en casse normale, pour ne pas se confondre avec le titre en
 * capitales de son groupe — sauf `caps`, pour un graphe posé en tuile parmi
 * des tuiles titrées en capitales. `definition` : la longue légende du graphe,
 * dépliée sous le titre par son « i » au lieu de s'étaler sous le graphe.
 * `headingClassName` remplace le style du titre (titres de groupe).
 */
function ChartHeading({
  title,
  subtitle,
  level = 3,
  caps = level === 3,
  definition,
  icon,
  className,
  headingClassName,
}: {
  title: string
  subtitle?: string
  level?: 3 | 4
  caps?: boolean
  definition?: ReactNode
  icon?: ReactNode
  className?: string
  headingClassName?: string
}) {
  const definitionLabel = useDefinitionLabel()
  const info = useDefinitionToggle()
  const Heading = level === 3 ? 'h3' : 'h4'
  const titleClass =
    headingClassName ??
    (caps ? 'text-xs font-semibold uppercase tracking-wide text-cream/80' : 'text-sm font-semibold text-cream/90')
  return (
    <div className={cn('mb-2.5 min-w-0', className)}>
      <div className="flex min-w-0 items-start gap-1">
        {/* Hauteur minimale du bouton de 24 px : titre et « i » restent alignés. */}
        <Heading className={cn('flex min-h-[24px] min-w-0 items-center gap-1.5 break-words', titleClass)}>
          {icon}
          <span className="min-w-0 break-words">{title}</span>
        </Heading>
        {definition && (
          <InfoToggle
            label={definitionLabel(title)}
            expanded={info.open}
            onToggle={info.toggle}
            controls={info.panelId}
          />
        )}
      </div>
      {subtitle && <p className="break-words text-xs text-cream/70">{subtitle}</p>}
      {definition && (
        <InfoPanel id={info.panelId} open={info.open}>
          {definition}
        </InfoPanel>
      )}
    </div>
  )
}

/**
 * Ligne de texte (exclusion, décompte à part) et sa définition à un geste.
 * `name` nomme la définition pour le lecteur d'écran, la ligne elle-même
 * portant des chiffres.
 */
function DefinedLine({ text, name, definition }: { text: ReactNode; name: string; definition: ReactNode }) {
  const definitionLabel = useDefinitionLabel()
  const info = useDefinitionToggle()
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start gap-1">
        <p className="min-w-0 break-words py-1">{text}</p>
        <InfoToggle label={definitionLabel(name)} expanded={info.open} onToggle={info.toggle} controls={info.panelId} />
      </div>
      <InfoPanel id={info.panelId} open={info.open}>
        {definition}
      </InfoPanel>
    </div>
  )
}

/**
 * Pied d'une section de statistiques servie depuis un cache : son heure de
 * calcul, écrite pour ne pas passer pour du temps réel.
 */
function useFreshnessLabel() {
  const t = useTranslations('supervision')
  const format = useFormatter()
  return useCallback(
    (computedAt: string | Date, cacheSeconds: number) =>
      t('growth.freshness', {
        time: format.dateTime(new Date(computedAt), { timeStyle: 'short', timeZone: PARIS_TIME_ZONE }),
        minutes: Math.max(1, Math.round(cacheSeconds / 60)),
      }),
    [t, format]
  )
}

/** Libellé d'un jeu dans une liste en barres : son icône, puis son titre. */
function GameBarLabel({ gameId, title }: { gameId: string; title: string }) {
  return (
    <>
      <span aria-hidden>
        <GameIconById id={gameId} surface="feltGold" className="mr-1.5 inline-block h-5 w-5 align-middle" />
      </span>
      {title}
    </>
  )
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

/**
 * Plus de rétention J+1 / J+7 ici (lot 7) : calculée sur lastSeenAt, un onglet
 * resté ouvert suffisait à « retenir » un compte. Les retours se lisent
 * désormais dans le tableau des comptes actifs, sur de vrais jours d'activité.
 */
type GrowthStats = {
  /** PART des comptes enregistrés parmi les comptes créés — pas un entonnoir. */
  registeredShare: { registered: number; guests: number; share: number | null }
  playersByGame: Array<{ gameId: string; gameTitle: string; players: number }>
  abandonedTables: { stalled: number; live: number; rate: number | null }
  /**
   * Parties lancées en ligne (par jour, par fenêtre, par jeu), tirées du
   * journal des parties. Type importé du serveur, pas recopié.
   */
  onlinePlay: OnlinePlayStats
  /**
   * Parties locales, compteurs anonymes. Absent d'une réponse antérieure,
   * null quand leur lecture a échoué côté serveur : la section ne s'affiche
   * simplement pas, le reste de l'onglet si.
   */
  localPlay?: LocalPlayStats | null
  windows: {
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
  /**
   * Id du compte visé, pour le lien vers sa fiche (servi par getJournal). Null
   * quand l'action n'a pas de cible propre (terme de modération, réglage,
   * compte supprimé, table fermée) : pas de lien.
   */
  targetUserId: string | null
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
  /** Liste PLAFONNÉE (30 salles au plus : les plus fraîches et les plus figées). */
  liveTables: LiveTable[]
  /**
   * Effectif RÉEL par statut, compté en base (diffusion TV comprise) : ce que
   * trace la barre par statut. Absent d'une réponse antérieure : la barre
   * retombe alors sur la liste.
   */
  liveTablesByStatus?: Record<LiveTable['status'], number>
  /**
   * Tables de JEU figées, comptées en base hors diffusion TV : même comptage
   * que la tuile « Tables figées » de la vue Qualité. Absent d'une réponse
   * antérieure : la liste sert de repli, diffusion TV écartée.
   */
  stalledGameTables?: number
  journal: JournalEntry[]
  queue: QueueItem[]
  /**
   * Trace du dernier passage du ménage des données (SiteSetting
   * 'retention.lastRun', lot 8) : une date et des volumes par bloc, aucune
   * donnée personnelle. Admins seulement. null : aucun passage enregistré
   * depuis la mise à jour ; absent : réponse d'un serveur antérieur au lot 8
   * (rien n'est affiché).
   */
  retentionLastRun?: RetentionLastRun | null
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
  /**
   * Résumé des visites sur 7 jours glissants (lot 6), servi aux admins et plus
   * seulement (canViewSupervisionAnalytics) : absent pour un modérateur.
   * Visites suivies sous consentement uniquement : 0 ne veut pas dire « pas
   * venu ».
   */
  visits7d?: { visits: number; activeSeconds: number }
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
  /**
   * Avis de 1re partie (type FIRST_GAME_FEEDBACK_TYPE) : note 1..5, jeu et
   * mode ('online' | 'local') ; null pour les autres types. Optionnels : une
   * réponse d'un serveur antérieur ne les porte pas.
   */
  rating?: number | null
  gameId?: string | null
  playMode?: string | null
  /** Renseignés uniquement sur le détail chargé à l'ouverture. */
  message?: string
  screenshots?: string[]
  userAgent?: string | null
}

/**
 * Fiche compte en PLEINE PAGE (lot 4), qui remplace le dialogue Historique :
 * un vrai lien, qu'on garde, qu'on rouvre après un rechargement ou qu'on
 * ouvre dans un autre onglet. Seul l'id du compte voyage dans l'URL — jamais
 * son pseudo ni son email.
 */
function accountFileHref(userId: string): string {
  return `/supervision/comptes/${encodeURIComponent(userId)}`
}

/**
 * Pseudo cliquable vers la fiche. Posé aussi dans l'en-tête d'une carte
 * visiteur, elle-même dépliable au clic et au clavier : le lien garde ses
 * événements, sans quoi la carte se repliait (et Entrée, intercepté par la
 * carte, n'ouvrait plus rien).
 */
function AccountNameLink({ userId, name, className }: { userId: string; name: string; className?: string }) {
  const t = useTranslations('supervision')
  return (
    <Link
      href={accountFileHref(userId)}
      title={t('accounts.openFileOf', { name })}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        'min-w-0 break-words underline decoration-white/25 underline-offset-2 hover:decoration-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50',
        className
      )}
    >
      {name}
    </Link>
  )
}

/** Bouton « Ouvrir la fiche » : même destination, pour les zones d'actions. */
function AccountFileButton({ userId }: { userId: string }) {
  const t = useTranslations('supervision')
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={accountFileHref(userId)}>
        <FileText className="mr-1 h-3.5 w-3.5" />
        {t('visitorCard.openFile')}
      </Link>
    </Button>
  )
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
      // Compte de test (action 'metrics-exclusion', ciblée) : détail neutre
      // 'on' / 'off' traduit ici, jamais affiché tel quel.
      if (e.targetUserId && e.detail === 'on') return t('room.journalMetricsExclusionOn', { actor, target })
      if (e.targetUserId && e.detail === 'off') return t('room.journalMetricsExclusionOff', { actor, target })
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

/**
 * Teinte du badge de type d'un retour : rouge pour un bug, or pour une
 * amélioration, violet pour un avis de 1re partie (ni alerte ni chantier :
 * une note), bleu jeton pour le reste. Fonds en valeur arbitraire : /15
 * n'existe pas dans l'échelle de Tailwind 3.3 et ne produisait AUCUN CSS
 * (badge sans fond).
 */
function feedbackTypeBadgeClass(type: string): string {
  switch (type) {
    case 'bug':
      return 'border-red-500/30 bg-red-500/[0.15] text-red-200'
    case 'improvement':
      return 'border-amber-500/30 bg-amber-500/[0.15] text-amber-200'
    case FIRST_GAME_FEEDBACK_TYPE:
      return 'border-violet-400/30 bg-violet-500/[0.15] text-violet-200'
    default:
      return 'border-chip-blue/50 bg-chip-blue/20 text-sky-200'
  }
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
              <Badge className={feedbackTypeBadgeClass(item.type)}>{item.typeLabel}</Badge>
              <Badge variant="secondary">{item.statusLabel}</Badge>
            </div>
            <span className="text-xs text-white/40">
              {format.dateTime(new Date(item.createdAt), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })}
            </span>
          </div>
          {/* Avis de 1re partie : la note, le jeu et le mode d'abord — c'est
              ce qu'on trie ; le commentaire suit comme pour tout retour. */}
          {item.type === FIRST_GAME_FEEDBACK_TYPE && (
            <FirstGameFeedbackMeta
              rating={item.rating}
              gameId={item.gameId}
              playMode={item.playMode}
              className="mt-2"
            />
          )}
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
  compact,
}: {
  lastLoginAt: string | null
  compact?: boolean
}) {
  const t = useTranslations('supervision')
  const format = useFormatter()
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
    </div>
  )
}

/**
 * Pays des navigateurs, en barres : la part de chacun se lit d'un coup d'œil
 * (drapeau, nom, effectif et %), et chaque rangée reste un bouton qui ouvre
 * la liste des visiteurs de ce pays. Le périmètre (`scope`) est passé
 * explicitement : il se déduisait autrefois du titre traduit (« aujourd' »,
 * « today », « oggi »…), ce qui cassait à la première reformulation. Un bloc
 * de la vue Audience : cinq pays d'emblée, les autres sur « Voir tout ».
 */
function CountryList({
  title,
  description,
  rows,
  scope,
  onCountryClick,
}: {
  title: string
  description: string
  rows: CountryRow[]
  scope: 'online' | 'today'
  onCountryClick?: (country: string | null, scope: 'online' | 'today') => void
}) {
  const t = useTranslations('supervision')
  const locale = useLocale()
  const texts = useChartTexts()
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  const barRows: BarListRow[] = sorted.map((row) => ({
    key: row.country ?? 'unknown',
    label: (
      <>
        <span aria-hidden className="mr-1.5">
          {countryFlag(row.country)}
        </span>
        {countryLabel(row.country, locale, t('unknownCountry'))}
        {row.country && row.country !== '??' && <span className="ml-1 text-xs text-cream/70">({row.country})</span>}
      </>
    ),
    value: row.count,
    onClick: onCountryClick ? () => onCountryClick(row.country, scope) : undefined,
  }))

  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
      <ChartHeading
        title={title}
        icon={<Globe className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />}
        subtitle={onCountryClick ? `${description}${t('geo.tapCountry')}` : description}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title={t('geo.noData')} />
      ) : (
        <BarList
          {...texts.list}
          ariaLabel={title}
          rows={barRows}
          showShare
          limit={5}
          categoryLabel={t('charts.country')}
          primaryLabel={t('charts.browsers')}
        />
      )}
    </div>
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
        {row.userId ? (
          <AccountNameLink userId={row.userId} name={row.displayName} className="text-sm font-medium text-white" />
        ) : (
          <span className="min-w-0 break-words text-sm font-medium text-white">{row.displayName}</span>
        )}
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
      <AccountNameLink userId={last.userId} name={last.displayName} className="text-sm font-medium text-white/80" />
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
}: {
  row: VisitorIpRow
  onIpClick?: (ip: string) => void
  onNetworkClick?: (ip: string, network: string) => void
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
          {/* Compte connecté ou dernier compte vu : la fiche est la même. */}
          <AccountFileButton userId={accountId} />
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
}: {
  rows: VisitorIpRow[]
  onIpClick?: (ip: string) => void
  onNetworkClick?: (ip: string, network: string) => void
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
}: {
  rows: VisitorIpRow[]
  onIpClick?: (ip: string) => void
  onNetworkClick?: (ip: string, network: string) => void
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

  // Posée dans le détail replié de la vue Audience, qui porte déjà son titre.
  return (
    <div className="min-w-0 space-y-3">
        <p className="break-words text-xs leading-relaxed text-white/70">{t('visitorCard.listDesc')}</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70" />
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
          />
        )}
    </div>
  )
}

/**
 * Réécrit des paramètres de l'URL courante SANS navigation : ni rechargement,
 * ni défilement, ni nouveau rendu serveur. Next synchronise useSearchParams
 * sur history.replaceState. `null` retire le paramètre. Un seul
 * replaceState pour tous : onglet et vue changent ensemble.
 */
function replaceUrlParams(patch: Record<string, string | null>) {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

function replaceUrlParam(key: string, value: string | null) {
  replaceUrlParams({ [key]: value })
}

/**
 * Détail du ménage des données, déplié sous le bandeau santé de la Salle :
 * preuve qu'il tourne (RGPD-20). En évidence dès qu'un bloc échoue ou que le
 * dernier passage date de plus de 24 h — Promise.allSettled masquerait sinon
 * des échecs répétés que personne ne regarde ; la pastille du bandeau passe
 * alors au rouge.
 */
function RetentionRunLine({ run }: { run: RetentionLastRun | null }) {
  const t = useTranslations('supervision.retentionRun')
  const format = useFormatter()

  if (run === null) {
    return (
      <p className="flex min-w-0 items-start gap-1.5 text-xs leading-relaxed text-white/70">
        <Trash2 className="mt-0.5 h-3 w-3 shrink-0" />
        <span className="min-w-0 break-words">{t('never')}</span>
      </p>
    )
  }

  const status = retentionRunStatus(run, Date.now())
  const at = new Date(run.at)
  const date = Number.isFinite(at.getTime())
    ? format.dateTime(at, { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })
    : '—'
  const failedSet = new Set(status.failed)

  return (
    <div
      className={cn(
        'min-w-0 text-xs leading-relaxed',
        status.alert
          ? 'rounded-lg border border-suit-red/[0.35] bg-suit-red/[0.07] px-3 py-2 text-red-200'
          : 'text-white/70'
      )}
    >
      <p className="flex min-w-0 items-start gap-1.5">
        {status.alert ? (
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-300" />
        ) : (
          <Trash2 className="mt-0.5 h-3 w-3 shrink-0" />
        )}
        <span className="min-w-0 break-words">
          {t('lastRun', { date })} · {t('purged', { count: status.total })}
        </span>
      </p>

      {status.alert && (
        <ul className="mt-1 space-y-0.5 pl-[18px]">
          {status.failed.length > 0 ? (
            <li className="min-w-0 break-words">
              {t('failedBlocks', { count: status.failed.length, blocks: status.failed.join(', ') })}
            </li>
          ) : (
            status.errored && <li className="min-w-0 break-words">{t('errored')}</li>
          )}
          {status.stale && (
            <li className="min-w-0 break-words">
              {t('stale', { hours: Math.round(RETENTION_RUN_STALE_MS / 3_600_000) })}
            </li>
          )}
        </ul>
      )}

      {status.blocks.length > 0 && (
        <details className="group min-w-0 pl-[18px]">
          <summary
            className={cn(
              '-mx-1 inline-flex cursor-pointer list-none items-center gap-1 rounded-md px-1 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 [&::-webkit-details-marker]:hidden',
              status.alert ? 'text-red-200/80 hover:text-red-100' : 'text-white/70 hover:text-white'
            )}
          >
            <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
            {t('detail')}
          </summary>
          {/* Identifiants techniques des blocs, affichés tels quels. */}
          <ul className="max-w-sm space-y-0.5 pb-0.5">
            {status.blocks.map((name) => (
              <li key={name} className="flex min-w-0 items-baseline justify-between gap-3">
                <span className="min-w-0 break-all font-mono">{name}</span>
                {failedSet.has(name) ? (
                  // Bloc d'invités en échec partiel : les comptes supprimés
                  // comptent dans le total, leur volume reste donc affiché.
                  <span className="flex shrink-0 items-baseline gap-2">
                    {name in run.counts && <span className="tabular-nums">{run.counts[name]}</span>}
                    <span className="font-semibold text-red-300">{t('blockFailed')}</span>
                  </span>
                ) : (
                  <span className="shrink-0 tabular-nums">{run.counts[name]}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/**
 * Taille de cohorte à partir de laquelle le taux de retour s'affiche. En
 * dessous, un seul compte fait bouger le pourcentage de 10 points ou plus :
 * seuls les effectifs bruts (« 2 sur 5 ») ont un sens.
 */
const RETURN_RATE_MIN_COHORT = 10

/**
 * Cohortes des retours, en jours de Paris avant aujourd'hui, bornes incluses
 * (RETENTION_COHORTS de active-accounts-server, module serveur non importable
 * ici). Ne sert qu'au texte des définitions.
 */
const RETURN_COHORT_DAYS = { d1: { from: 8, to: 2 }, d7: { from: 21, to: 8 } } as const

/** Fenêtre « actif » d'un battement, en minutes (src/lib/heartbeat.ts), pour les définitions. */
const ACTIVE_WINDOW_MINUTES = Math.round(ACTIVE_WINDOW_MS / 60_000)

/**
 * Tuile d'un chiffre : GrowthMetric (libellé et « i », valeur, unité,
 * définition dépliée sous le chiffre) avec le nom accessible du « i » traduit.
 */
function ActivityMetric({
  label,
  value,
  detail,
  definition,
  tone,
  delta,
  children,
}: {
  label: string
  value: string
  detail?: string
  definition: ReactNode
  tone?: 'default' | 'alert'
  delta?: { direction: 'up' | 'down'; label: string }
  children?: ReactNode
}) {
  const definitionLabel = useDefinitionLabel()
  return (
    <GrowthMetric
      label={label}
      value={value}
      detail={detail}
      definition={definition}
      definitionLabel={definitionLabel(label)}
      tone={tone}
      delta={delta}
    >
      {children}
    </GrowthMetric>
  )
}

/**
 * Plusieurs définitions derrière un seul « i », chacune nommée : une tuile
 * qui oppose deux mesures (nouveaux / revenants) les définit ensemble.
 */
function NamedDefinitions({ items }: { items: Array<{ key: string; name: string; text: string }> }) {
  return (
    <dl className="space-y-1.5">
      {items.map((item) => (
        <div key={item.key} className="min-w-0">
          <dt className="font-semibold text-cream">{item.name}</dt>
          <dd className="break-words">{item.text}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Retour J+1 ou J+7 : effectifs bruts d'abord (« 2 sur 5 »), le pourcentage
 * seulement à partir de RETURN_RATE_MIN_COHORT comptes de cohorte. Cohorte
 * vide : « — », jamais « 0 sur 0 ». Cohorte rognée au début du journal
 * (`createdSince`) : dit sous le chiffre, pendant les 2 à 3 semaines où elle
 * le précède — « 0 sur 2 » ne doit pas se lire comme une rétention nulle.
 * `tone` : l'appelant décide de l'alerte (personne de revenu à J+7).
 */
function ReturnMetric({
  label,
  cohort,
  definition,
  tone,
}: {
  label: string
  cohort: ActiveAccountsStats['retention']['d1']
  definition: string
  tone?: 'default' | 'alert'
}) {
  const t = useTranslations('supervision.activeAccounts')
  const format = useFormatter()
  const empty = cohort.cohort === 0
  const since = cohort.createdSince
    ? format.dateTime(parisDayToDate(cohort.createdSince), { day: '2-digit', month: '2-digit', timeZone: PARIS_TIME_ZONE })
    : null
  const detail = empty
    ? since
      ? t('returnEmptySince', { date: since })
      : t('returnEmpty')
    : cohort.cohort >= RETURN_RATE_MIN_COHORT
      ? t('returnRate', { rate: rateLabel(cohort.retained / cohort.cohort) })
      : t('returnRateHidden', { min: RETURN_RATE_MIN_COHORT })
  return (
    <ActivityMetric
      label={label}
      value={empty ? '—' : t('returnCount', { retained: cohort.retained, cohort: cohort.cohort })}
      detail={!empty && since ? `${detail} ${t('returnPartial', { date: since })}` : detail}
      definition={definition}
      tone={tone}
    />
  )
}

/**
 * Les plus actifs sur 7 jours, avec une barre de temps actif. Pas le BarList
 * du kit : chaque pseudo est un LIEN vers la fiche (qu'on ouvre aussi dans un
 * autre onglet), et le kit recopie le libellé dans sa version texte masquée —
 * ce serait un lien invisible mais atteignable au clavier. Ici la barre et la
 * valeur de droite sont un décor (aria-hidden) : la phrase lue par le lecteur
 * d'écran porte déjà les deux chiffres.
 */
function TopAccountsBars({
  accounts,
  duration,
}: {
  accounts: ActiveAccountsStats['topAccounts7d']
  duration: (seconds: number | null) => string
}) {
  const t = useTranslations('supervision')
  const max = Math.max(0, ...accounts.map((acc) => acc.activeSeconds ?? 0))
  return (
    <div className="min-w-0">
      <p aria-hidden className="mb-1 flex justify-end px-3 text-xs text-cream/70">
        {t('activeAccounts.topActiveHeader')}
      </p>
      <ol className="space-y-1.5">
        {accounts.map((acc, index) => {
          const tracked = acc.activeSeconds != null
          const width = tracked && max > 0 ? ((acc.activeSeconds ?? 0) / max) * 100 : 0
          return (
            <li
              key={acc.userId}
              className="flex min-w-0 items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
            >
              <span className="w-5 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-gold">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <AccountNameLink userId={acc.userId} name={acc.displayName} className="text-sm font-medium text-white" />
                    <AccountCodeBadge code={acc.accountCode} />
                    <AccountKindBadge kind={acc.kind} lastSeenAt={null} createdAt={null} compact />
                  </div>
                  <span aria-hidden className="shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-cream">
                    {tracked ? duration(acc.activeSeconds) : '—'}
                  </span>
                </div>
                <span aria-hidden className="mt-1.5 block h-2 w-full">
                  {width > 0 && (
                    <span
                      className="block h-full rounded-r-[4px]"
                      style={{ width: `${width}%`, minWidth: 2, backgroundColor: chartToneColor('gold') }}
                    />
                  )}
                </span>
                <p className="mt-1 break-words text-xs tabular-nums text-cream/70">
                  {tracked ? (
                    <>
                      <span aria-hidden>{t('activeAccounts.topGames', { games: acc.games })}</span>
                      <span className="sr-only">
                        {t('activeAccounts.topLine', { active: duration(acc.activeSeconds), games: acc.games })}
                      </span>
                    </>
                  ) : (
                    t('activeAccounts.topLineUntracked', { games: acc.games })
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Icône d'une catégorie d'appareil (même jeu d'icônes que DeviceBadge). */
const DEVICE_ICONS: Partial<Record<DeviceKind, typeof Monitor>> = {
  mobile: Smartphone,
  tablet: Tablet,
  mac: Laptop,
  pc: Monitor,
}

/**
 * Appareils des visites de 7 jours : barres des VISITES (une partition, d'où
 * la part en %), et en indice les comptes distincts vus sur chaque appareil
 * — ceux-là ne s'additionnent pas (un compte vu sur mobile et sur PC compte
 * pour les deux), ils ne portent donc ni barre ni part.
 */
function VisitDevicesBars({ devices }: { devices: ActiveAccountsStats['visits']['devices7d'] }) {
  const t = useTranslations('supervision')
  const texts = useChartTexts()
  const title = t('activeAccounts.devicesTitle')
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      {/* h3 : un bloc de la vue, voisin du graphe des visiteurs, pas sous lui. */}
      <ChartHeading title={title} definition={t('activeAccounts.devicesDef')} />
      <BarList
        {...texts.list}
        ariaLabel={title}
        rows={devices.map((row) => {
          const Icon = DEVICE_ICONS[row.device]
          return {
            key: row.device,
            label: (
              <>
                {/* « Inconnu » n'a pas d'icône : une case vide garde les libellés alignés. */}
                {Icon ? (
                  <Icon aria-hidden className="mr-1.5 inline-block h-3.5 w-3.5 align-middle text-cream/70" />
                ) : (
                  <span aria-hidden className="mr-1.5 inline-block w-3.5" />
                )}
                {t(`activeAccounts.deviceKinds.${row.device}`)}
              </>
            ),
            value: row.visits,
            hint: t('activeAccounts.devicesAccounts', { count: row.accounts }),
          }
        })}
        showShare
        categoryLabel={t('charts.device')}
        primaryLabel={t('charts.visits')}
        emptyLabel={t('activeAccounts.devicesEmpty')}
      />
    </div>
  )
}

/** Intitulé de chaque période du sélecteur, et des fenêtres des mesures. */
const PERIOD_LABEL_KEY = { d1: 'stats.today', d7: 'stats.week', d30: 'stats.month' } as const satisfies Record<
  StatsPeriod,
  string
>

/** Les trois fenêtres, pour une mesure servie sur chacune. */
const ALL_WINDOWS = ['d1', 'd7', 'd30'] as const

/** « 08/10 » : un jour de Paris en court, pour les intitulés « depuis le … ». */
function useParisShortDate() {
  const format = useFormatter()
  return useCallback(
    (day: string) => format.dateTime(parisDayToDate(day), { day: '2-digit', month: '2-digit', timeZone: PARIS_TIME_ZONE }),
    [format]
  )
}

/**
 * Fenêtre RÉELLEMENT lue pour une mesure (stats-period.ts) : « 7 jours », ou
 * « 30 jours · depuis le 08/10 » quand la mesure est plus jeune que sa
 * fenêtre.
 */
function useSpanWindow() {
  const t = useTranslations('supervision')
  const shortDate = useParisShortDate()
  return useCallback(
    (span: MeasureSpan) => {
      const window = t(PERIOD_LABEL_KEY[span.key])
      return span.since ? t('gameSessions.windowSince', { window, date: shortDate(span.since) }) : window
    },
    [t, shortDate]
  )
}

/**
 * Nom d'un chiffre suivi de sa fenêtre : « Comptes actifs · 7 jours ». Sous
 * « Aujourd'hui », une mesure qui n'existe que sur 7 jours le dit ainsi dans
 * son intitulé — jamais un chiffre sous une période qu'il ne mesure pas.
 */
function useSpanLabel() {
  const t = useTranslations('supervision')
  const spanWindow = useSpanWindow()
  return useCallback(
    (label: string, span: MeasureSpan) => t('method.windowed', { label, window: spanWindow(span) }),
    [t, spanWindow]
  )
}

/** Bloc d'une vue des Statistiques : un seul cadre, jamais de cadre dans le cadre. */
function StatsPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4', className)}>{children}</div>
  )
}

/**
 * Comptes actifs et joueurs uniques par jour de Paris, sur 14 jours, côte à
 * côte sur la même échelle (même unité : des comptes). Les jours antérieurs
 * aux sources sont rayés : un 0 y mentirait. Les sièges sans compte ne sont
 * pas des joueurs uniques : jamais dans les colonnes, mais dits jour par jour.
 */
function PlayersSeriesChart({ series, accountsSince }: { series: ActiveAccountsStats['series']; accountsSince: string }) {
  const t = useTranslations('supervision')
  const texts = useChartTexts()
  const { columns, ariaFor, fullDay, shortDay } = useDayCharts()
  const days = series.map((d) => d.day)
  const title = t('activeAccounts.seriesAccountsTitle')
  const deletedSeatDays = series.filter((d) => d.deletedSeats > 0)
  return (
    <div className="min-w-0">
      <ChartHeading
        title={title}
        subtitle={
          days.length > 0
            ? t('onlinePlayers.range', { from: shortDay(days[0]), to: shortDay(days[days.length - 1]) })
            : undefined
        }
        definition={t('activeAccounts.seriesDef')}
      />
      <ColumnChart
        {...texts.column}
        ariaLabel={ariaFor(title, days)}
        data={columns(
          series.map((d) => ({
            day: d.day,
            values: { activeAccounts: d.activeAccounts, uniquePlayers: d.uniquePlayers },
            muted: d.day < accountsSince,
          }))
        )}
        series={[
          { key: 'activeAccounts', label: t('activeAccounts.seriesAccounts'), tone: 'gold' },
          { key: 'uniquePlayers', label: t('activeAccounts.seriesPlayers'), tone: 'cream' },
        ]}
        mutedLabel={t('activeAccounts.legendNoData')}
        caption={
          <>
            {deletedSeatDays.length > 0 && (
              <span className="block break-words">
                {t('activeAccounts.seriesDeletedSeatsDays', {
                  days: deletedSeatDays
                    .map((d) => t('activeAccounts.seriesDay', { date: fullDay(d.day), value: d.deletedSeats }))
                    .join(' · '),
                })}
              </span>
            )}
            {/* Le passé bouge (visites en cascade, places à compte nul) : dit en clair. */}
            <span className="block break-words">{t('activeAccounts.seriesRecomputed')}</span>
          </>
        }
      />
    </div>
  )
}

/**
 * Nouveaux comptes au jour de leur CRÉATION, empilés comptes enregistrés /
 * invités (le total d'une pile = les nouveaux du jour). Invités en violet :
 * la teinte de leur badge de type partout ailleurs.
 */
function NewAccountsChart({ series, accountsSince }: { series: ActiveAccountsStats['series']; accountsSince: string }) {
  const t = useTranslations('supervision')
  const texts = useChartTexts()
  const { columns, ariaFor } = useDayCharts()
  const days = series.map((d) => d.day)
  const title = t('activeAccounts.seriesNewTitle')
  return (
    <div className="min-w-0">
      <ChartHeading level={4} title={title} definition={t('activeAccounts.seriesNewDef')} />
      <ColumnChart
        {...texts.column}
        ariaLabel={ariaFor(title, days)}
        data={columns(
          series.map((d) => {
            // Champs absents d'une réponse antérieure : 0, jamais NaN.
            const total = d.newAccounts ?? 0
            const guests = Math.min(total, d.newGuests ?? 0)
            return { day: d.day, values: { registered: total - guests, guests }, muted: d.day < accountsSince }
          })
        )}
        series={[
          { key: 'registered', label: t('activeAccounts.seriesNewRegistered'), tone: 'gold' },
          { key: 'guests', label: t('activeAccounts.seriesNewGuests'), tone: 'violet' },
        ]}
        stacked
        mutedLabel={t('activeAccounts.legendNoData')}
      />
    </div>
  )
}

/** Comptes affichés d'emblée parmi les plus actifs (le serveur en sert 10). */
const TOP_ACCOUNTS_PREVIEW = 5

/**
 * Vue Joueurs : combien de comptes viennent, nouveaux ou revenants, et
 * s'ils reviennent. Quatre chiffres, une courbe, les plus actifs ; le reste
 * (part des comptes enregistrés, invités sans jouer, sièges sans compte,
 * navigateurs sans compte, nouveaux comptes par jour, temps actif) replié.
 * Chargée à l'ouverture de l'onglet, hors de la boucle de 15 s.
 */
function StatsPlayersView({
  period,
  stats,
  failed,
  onRetry,
  growth,
  growthFailed,
  onRetryGrowth,
  onMethod,
}: {
  period: StatsPeriod
  stats: ActiveAccountsStats | null
  failed: boolean
  onRetry: () => void
  growth: GrowthStats | null
  growthFailed: boolean
  onRetryGrowth: () => void
  onMethod: (group: MethodGroup) => void
}) {
  const t = useTranslations('supervision')
  if (!stats) {
    return failed ? (
      <ErrorState icon={AlertTriangle} message={t('activeAccounts.loadError')} retryLabel={t('states.retry')} onRetry={onRetry} />
    ) : (
      <SkeletonRows rows={4} />
    )
  }
  return (
    <PlayersBody
      period={period}
      stats={stats}
      refreshFailed={failed}
      growth={growth}
      growthFailed={growthFailed}
      onRetryGrowth={onRetryGrowth}
      onMethod={onMethod}
    />
  )
}

function PlayersBody({
  period,
  stats,
  refreshFailed,
  growth,
  growthFailed,
  onRetryGrowth,
  onMethod,
}: {
  period: StatsPeriod
  stats: ActiveAccountsStats
  refreshFailed: boolean
  growth: GrowthStats | null
  growthFailed: boolean
  onRetryGrowth: () => void
  onMethod: (group: MethodGroup) => void
}) {
  const t = useTranslations('supervision')
  const format = useFormatter()
  const units = useDurationUnits()
  const freshness = useFreshnessLabel()
  const spanLabel = useSpanLabel()
  const spanWindow = useSpanWindow()
  const texts = useChartTexts()
  const [topExpanded, setTopExpanded] = useState(false)
  const { accounts, players, visits, retention, coverage } = stats
  const computedAt = new Date(stats.computedAt)
  // Journal OU visites : la plus ancienne des deux sources (même règle que la Salle).
  const accountsSince = accountsCoverageSince(coverage)
  const fullDay = (day: string) =>
    format.dateTime(parisDayToDate(day), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: PARIS_TIME_ZONE })
  const duration = (seconds: number | null) => (seconds == null ? '—' : formatPresenceDuration(seconds, units))

  // Fenêtres réellement lues : nouveaux, revenants et invités sans jouer
  // n'existent que sur 7 et 30 jours (« Aujourd'hui » lit 7 jours, et le dit) ;
  // les navigateurs sans compte, sur 1 et 7 jours.
  const activeSpan = measureSpan(period, ALL_WINDOWS, { computedAt, since: accountsSince })
  const pairSpan = measureSpan(period, ['d7', 'd30'] as const, { computedAt, since: accountsSince })
  const idleSpan = measureSpan(period, ['d7', 'd30'] as const, { computedAt, since: coverage.journalSince })
  const seatsSpan = measureSpan(period, ALL_WINDOWS, { computedAt, since: coverage.journalSince })
  const browsersSpan = measureSpan(period, ['d1', 'd7'] as const)
  const weekSpan = measureSpan(period, ['d7'] as const, { computedAt, since: coverage.visitsSince })
  const activeKey = activeSpan.key
  const pairKey = pairSpan.key
  const top = stats.topAccounts7d
  const shownTop = topExpanded ? top : top.slice(0, TOP_ACCOUNTS_PREVIEW)
  const d7Cohort = retention.d7
  const footerAt = oldestComputedAt(stats.computedAt, growth?.computedAt) ?? stats.computedAt

  return (
    <div className="min-w-0 space-y-4">
      {refreshFailed && (
        <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-100">
          {t('activeAccounts.refreshError')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <ActivityMetric
          label={spanLabel(t('activeAccounts.title'), activeSpan)}
          value={String(accounts.active[activeKey])}
          detail={t('onlinePlayers.accountsDetail', { count: accounts.active[activeKey], guests: accounts.guests[activeKey] })}
          definition={
            activeKey === 'd1'
              ? t('activeAccounts.activeTodayDef', { minutes: ACTIVE_WINDOW_MINUTES })
              : t('activeAccounts.activeWindowDef', { days: activeSpan.days, minutes: ACTIVE_WINDOW_MINUTES })
          }
        />
        {/* Partition exacte des actifs (nouveau = créé dans la fenêtre,
            revenant = créé avant) : la barre se lit sans calcul. */}
        <ActivityMetric
          label={spanLabel(t('statsTab.players.newReturning'), pairSpan)}
          value={`${accounts.newAccounts[pairKey]} · ${accounts.returning[pairKey]}`}
          detail={t('activeAccounts.activeCount', { count: accounts.active[pairKey] })}
          definition={
            <NamedDefinitions
              items={[
                { key: 'new', name: t('activeAccounts.newLabel'), text: t('activeAccounts.newDef') },
                { key: 'returning', name: t('activeAccounts.returningLabel'), text: t('activeAccounts.returningDef') },
              ]}
            />
          }
        >
          <StackedBar
            {...texts.stacked}
            ariaLabel={t('activeAccounts.newReturningAria', { window: spanWindow(pairSpan) })}
            segments={[
              { key: 'new', label: t('activeAccounts.newLabel'), value: accounts.newAccounts[pairKey], tone: 'gold' },
              { key: 'returning', label: t('activeAccounts.returningLabel'), value: accounts.returning[pairKey], tone: 'cream' },
            ]}
            categoryLabel={t('charts.category')}
            valueLabel={t('charts.accounts')}
          />
        </ActivityMetric>
        <ReturnMetric
          label={t('activeAccounts.returnD1Label')}
          cohort={retention.d1}
          definition={t('activeAccounts.returnDef', { days: 1, ...RETURN_COHORT_DAYS.d1, min: RETURN_RATE_MIN_COHORT })}
        />
        {/* Personne de revenu à J+7 sur une cohorte non vide : l'alerte de la vue. */}
        <ReturnMetric
          label={t('activeAccounts.returnD7Label')}
          cohort={d7Cohort}
          definition={t('activeAccounts.returnDef', { days: 7, ...RETURN_COHORT_DAYS.d7, min: RETURN_RATE_MIN_COHORT })}
          tone={d7Cohort.cohort > 0 && d7Cohort.retained === 0 ? 'alert' : 'default'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatsPanel>
          <PlayersSeriesChart series={stats.series} accountsSince={accountsSince} />
        </StatsPanel>
        <StatsPanel>
          <ChartHeading title={t('activeAccounts.topTitle')} definition={t('activeAccounts.topDef')} />
          {top.length === 0 ? (
            <p className="text-sm text-cream/70">{t('activeAccounts.topEmpty')}</p>
          ) : (
            <>
              <TopAccountsBars accounts={shownTop} duration={duration} />
              {top.length > TOP_ACCOUNTS_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setTopExpanded((open) => !open)}
                  aria-expanded={topExpanded}
                  className="mt-2 inline-flex min-h-[32px] items-center gap-1 rounded-md text-xs font-semibold text-amber-200 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                >
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', topExpanded && 'rotate-180')} aria-hidden />
                  {topExpanded ? t('charts.collapse') : t('statsTab.players.topShowAll', { count: top.length })}
                </button>
              )}
            </>
          )}
        </StatsPanel>
      </div>

      <Disclosure title={t('statsTab.players.detailTitle')} icon={UserCheck}>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {growth ? (
            // Les deux effectifs sont écrits dans la légende de la barre, avec leur part.
            <ActivityMetric
              label={t('method.windowed', {
                label: t('growth.registeredShareLabel'),
                window: t('statsTab.days', { days: growth.windows.registeredShareDays }),
              })}
              value={rateLabel(growth.registeredShare.share)}
              definition={t('growth.registeredShareDef', { days: growth.windows.registeredShareDays })}
            >
              <StackedBar
                {...texts.stacked}
                ariaLabel={t('growth.registeredShareLabel')}
                segments={[
                  { key: 'registered', label: t('growth.registeredSegment'), value: growth.registeredShare.registered, tone: 'gold' },
                  { key: 'guests', label: t('growth.guestsSegment'), value: growth.registeredShare.guests, tone: 'violet' },
                ]}
                categoryLabel={t('charts.category')}
                valueLabel={t('charts.accounts')}
                emptyLabel={t('growth.registeredShareEmpty')}
              />
            </ActivityMetric>
          ) : growthFailed ? (
            <ErrorState icon={AlertTriangle} message={t('statsTab.growthError')} retryLabel={t('states.retry')} onRetry={onRetryGrowth} />
          ) : (
            <SkeletonRows rows={1} />
          )}
          <ActivityMetric
            label={spanLabel(t('activeAccounts.medianActive'), weekSpan)}
            value={duration(visits.medianActiveSecondsPerAccount7d)}
            definition={t('activeAccounts.medianActiveDef', { minutes: ACTIVE_WINDOW_MINUTES })}
          />
        </div>

        {/* Décomptes à part, jamais additionnés aux comptes actifs. */}
        <div className="min-w-0 space-y-1 text-xs text-white/70">
          <DefinedLine
            text={t('statsTab.countLine', {
              label: spanLabel(t('method.names.idleGuests'), idleSpan),
              count: accounts.idleGuests[idleSpan.key],
            })}
            name={t('method.names.idleGuests')}
            definition={t('activeAccounts.idleGuestsDef')}
          />
          <DefinedLine
            text={t('statsTab.countLine', {
              label: spanLabel(t('method.names.deletedSeats'), seatsSpan),
              count: players.deletedSeats[seatsSpan.key],
            })}
            name={t('method.names.deletedSeats')}
            definition={t('activeAccounts.deletedSeatsDef')}
          />
          {/* Autre unité que les comptes : des navigateurs, dits comme tels. */}
          <DefinedLine
            text={t('statsTab.countLine', {
              label: spanLabel(t('activeAccounts.browsersTitle'), browsersSpan),
              count: stats.browsersWithoutAccount[browsersSpan.key],
            })}
            name={t('activeAccounts.browsersTitle')}
            definition={
              <>
                {t('activeAccounts.browsersDef')} {t('activeAccounts.browsersNotAdded')}
              </>
            }
          />
        </div>

        <NewAccountsChart series={stats.series} accountsSince={accountsSince} />
      </Disclosure>

      {/* Un seul pied : ce qui est hors effectifs, la couverture des deux
          sources, l'heure du calcul (valeurs en cache, la plus ancienne). */}
      <StatsFooter
        notes={[
          {
            key: 'excluded',
            content: (
              <DefinedLine
                text={t('activeAccounts.excluded', { staff: accounts.staffExcluded, test: accounts.testExcluded })}
                name={t('method.names.excluded')}
                definition={t('activeAccounts.excludedDef')}
              />
            ),
          },
          {
            key: 'coverage',
            content: coverage.visitsSince
              ? t('activeAccounts.coverage', { journal: fullDay(coverage.journalSince), visits: fullDay(coverage.visitsSince) })
              : t('activeAccounts.coverageNoVisits', { journal: fullDay(coverage.journalSince) }),
          },
        ]}
        freshness={freshness(footerAt, stats.cacheSeconds)}
        methodLabel={t('method.button')}
        onMethod={() => onMethod('players')}
      />
    </div>
  )
}

/**
 * Vue Audience : les NAVIGATEURS qui viennent (statistiques acceptées) —
 * une autre unité que les comptes, jamais additionnée à eux. Le nombre de la
 * période, les navigateurs actifs maintenant, deux chiffres de visites (7
 * jours, dit), la courbe par jour, les appareils, les pays ; la liste des
 * visiteurs par IP repliée.
 */
function StatsAudienceView({
  period,
  stats,
  dailySeries,
  activeAccounts,
  activeAccountsFailed,
  onCountryClick,
  onIpClick,
  onNetworkClick,
  onMethod,
}: {
  period: StatsPeriod
  stats: StatsResponse | null
  dailySeries: DailyPoint[]
  activeAccounts: ActiveAccountsStats | null
  activeAccountsFailed: boolean
  onCountryClick: (country: string | null, scope: 'online' | 'today') => void
  onIpClick: (ip: string) => void
  onNetworkClick: (ip: string, network: string) => void
  onMethod: (group: MethodGroup) => void
}) {
  const t = useTranslations('supervision')
  const units = useDurationUnits()
  const texts = useChartTexts()
  const { columns, ariaFor, shortDay } = useDayCharts()
  const spanLabel = useSpanLabel()
  const freshness = useFreshnessLabel()
  const visitorsSpan = measureSpan(period, ALL_WINDOWS)
  const visits = activeAccounts?.visits
  const visitsSpan = measureSpan(period, ['d7'] as const, {
    computedAt: new Date(activeAccounts?.computedAt ?? Date.now()),
    since: activeAccounts?.coverage.visitsSince ?? null,
  })
  const visitors = stats ? { d1: stats.visitors.today, d7: stats.visitors.week, d30: stats.visitors.month }[visitorsSpan.key] : null
  // Écart d'une semaine sur l'autre : sur 7 jours seulement, jours RÉVOLUS
  // (stats-period.ts) — jamais sous « Aujourd'hui », entamé, ni sous 30 jours,
  // que la série de 15 jours ne sait pas comparer.
  const delta = period === 'd7' ? weekOverWeekDelta(dailySeries, parisDayString(), ANALYTICS_CONSENT_V2_SINCE) : null
  const phone = visits ? phoneShare(visits.devices7d ?? []) : null
  const visitsPending = activeAccountsFailed ? t('room.weekUnavailable') : t('loading')
  // Les 14 jours tracés : la série en sert un de plus, pour l'écart.
  const points = dailySeries.slice(-14)
  const days = points.map((p) => p.date)
  const chartTitle = t('room.visitorsChartTitle')
  // Consentement de version 2 : le bandeau a été reposé à tous et un
  // navigateur ne compte plus tant qu'il n'a pas répondu. Tant que ce jour
  // est dans la fenêtre, on le dit sous le graphe, À DÉCOUVERT : la marche
  // qu'il dessine n'est pas une chute de fréquentation.
  const consentBreakShown = days.length > 0 && days[0] <= ANALYTICS_CONSENT_V2_SINCE

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {/* NAVIGATEURS ayant accepté les statistiques (DailyVisitor), pas des
            comptes ni des personnes : l'indice le dit. */}
        <ActivityMetric
          label={t('room.weekVisitors', { window: t(PERIOD_LABEL_KEY[visitorsSpan.key]) })}
          value={visitors == null ? '—' : String(visitors)}
          detail={t('stats.weekHint')}
          delta={
            delta != null
              ? { direction: delta >= 0 ? 'up' : 'down', label: `${deltaLabel(delta)} ${t('room.vsPrevWeek')}` }
              : undefined
          }
          definition={t('statsTab.audience.visitorsWindowDef')}
        />
        {/* Des navigateurs encore : la pastille « en ligne » de l'en-tête,
            elle, compte des comptes. La définition le rappelle. */}
        <ActivityMetric
          label={t('stats.activeBrowsers')}
          value={stats ? String(stats.visitors.onlineNow) : '—'}
          detail={t('stats.activeBrowsersHint', { minutes: ONLINE_WINDOW_MINUTES })}
          definition={t('statsTab.audience.activeBrowsersDef', { minutes: ONLINE_WINDOW_MINUTES })}
        />
        <ActivityMetric
          label={spanLabel(t('activeAccounts.medianVisit'), visitsSpan)}
          value={visits ? (visits.medianVisitSeconds7d == null ? '—' : formatPresenceDuration(visits.medianVisitSeconds7d, units)) : '—'}
          detail={visits ? undefined : visitsPending}
          definition={t('activeAccounts.medianVisitDef')}
        />
        <ActivityMetric
          label={spanLabel(t('statsTab.audience.phoneShare'), visitsSpan)}
          value={phone ? rateLabel(phone.share) : '—'}
          detail={
            phone
              ? t('statsTab.audience.phoneShareDetail', { phone: phone.phone, total: phone.total })
              : visits
                ? t('activeAccounts.devicesEmpty')
                : visitsPending
          }
          definition={t('statsTab.audience.phoneShareDef')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatsPanel>
          <ChartHeading
            title={chartTitle}
            subtitle={
              days.length > 0
                ? `${t('room.trendVisitors')} · ${t('onlinePlayers.range', { from: shortDay(days[0]), to: shortDay(days[days.length - 1]) })}`
                : t('room.trendVisitors')
            }
            definition={t('room.visitorsDef')}
          />
          <ColumnChart
            {...texts.column}
            ariaLabel={ariaFor(chartTitle, days)}
            data={columns(points.map((p) => ({ day: p.date, values: { visitors: p.visitors } })))}
            series={[{ key: 'visitors', label: t('room.visitorsSeries'), tone: 'gold' }]}
            caption={consentBreakShown ? t('room.visitorsConsentNote', { date: shortDay(ANALYTICS_CONSENT_V2_SINCE) }) : undefined}
          />
        </StatsPanel>
        {/* Les visites de 7 jours, par appareil (champ absent d'une réponse antérieure : rien). */}
        {visits ? (
          <VisitDevicesBars devices={visits.devices7d ?? []} />
        ) : (
          <StatsPanel>
            <p className="text-xs text-white/70">{visitsPending}</p>
          </StatsPanel>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CountryList
          title={t('geo.onlineByCountry')}
          description={t('geo.onlineByCountryWindowDesc', { minutes: ONLINE_WINDOW_MINUTES })}
          rows={stats?.visitors.onlineByCountry ?? []}
          scope="online"
          onCountryClick={onCountryClick}
        />
        <CountryList
          title={t('geo.todayByCountry')}
          description={t('geo.todayByCountryDesc')}
          rows={stats?.visitors.visitorsTodayByCountry ?? []}
          scope="today"
          onCountryClick={onCountryClick}
        />
      </div>

      <Disclosure title={t('statsTab.audience.ipTitle')} icon={Network}>
        <IpVisitorList rows={stats?.visitorIpList ?? []} onIpClick={onIpClick} onNetworkClick={onNetworkClick} />
      </Disclosure>

      {/* Deux unités dans la même vue : chaque note dit à quels blocs elle
          s'applique, jamais un périmètre de comptes posé sur des navigateurs. */}
      <StatsFooter
        notes={[
          { key: 'browsers', content: t('statsTab.audience.browsersNote') },
          {
            key: 'scope',
            content: activeAccounts?.coverage.visitsSince
              ? t('activeAccounts.visitsScope', { date: shortDay(activeAccounts.coverage.visitsSince) })
              : t('activeAccounts.visitsScopeNone'),
          },
        ]}
        freshness={activeAccounts ? freshness(activeAccounts.computedAt, activeAccounts.cacheSeconds) : undefined}
        methodLabel={t('method.button')}
        onMethod={() => onMethod('audience')}
      />
    </div>
  )
}

/** Rangées du tableau par jeu affichées avant « Voir tout ». */
const GAME_TABLE_PREVIEW = 8

/** Effectif d'une colonne du tableau par jeu : « — » quand la mesure manque. */
function countCell(value: number | null): string {
  return value == null ? '—' : String(value)
}

/**
 * Vue Jeux : les parties de la période, en ligne (journal des parties) et
 * locales (compteurs anonymes), un graphe par jour qui empile les deux, un
 * tableau par jeu. Le cumul depuis toujours et les joueurs par jeu sont
 * repliés ; le journal des parties aussi, sauf quand un lien « voir dans le
 * journal » l'ouvre (?userId=).
 */
function StatsGamesView({
  period,
  growth,
  growthFailed,
  onRetryGrowth,
  activeAccounts,
  allTime,
  journalUserId,
  journalOpen,
  onJournalOpenChange,
  journalRef,
  onShowAllJournal,
  onMethod,
}: {
  period: StatsPeriod
  growth: GrowthStats | null
  growthFailed: boolean
  onRetryGrowth: () => void
  activeAccounts: ActiveAccountsStats | null
  allTime: StatsResponse['games'] | undefined
  journalUserId: string | undefined
  journalOpen: boolean
  onJournalOpenChange: (open: boolean) => void
  journalRef: RefObject<HTMLDivElement>
  onShowAllJournal: () => void
  onMethod: (group: MethodGroup) => void
}) {
  const t = useTranslations('supervision')
  return (
    <div className="min-w-0 space-y-4">
      {growth ? (
        <GamesBody period={period} growth={growth} activeAccounts={activeAccounts} allTime={allTime} onMethod={onMethod} />
      ) : growthFailed ? (
        <ErrorState icon={AlertTriangle} message={t('statsTab.growthError')} retryLabel={t('states.retry')} onRetry={onRetryGrowth} />
      ) : (
        <SkeletonRows rows={4} />
      )}

      {/* Journal des parties : panneau autonome, monté seulement une fois
          déplié (il charge ses propres pages). Un lien « voir dans le
          journal » d'une fiche compte l'ouvre et y défile (journalRef). */}
      <div ref={journalRef} className="min-w-0 scroll-mt-4">
        <Disclosure
          title={t('statsTab.games.journalTitle')}
          icon={ScrollText}
          open={journalOpen}
          onOpenChange={onJournalOpenChange}
        >
          {journalUserId && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="text-white/70" onClick={onShowAllJournal}>
                <X className="mr-1 h-3.5 w-3.5" />
                {t('journalFilter.showAll')}
              </Button>
            </div>
          )}
          {/* Sans son propre cadre ni son titre : le dépliant les porte déjà. */}
          <GameSessionsPanel userId={journalUserId} bare />
        </Disclosure>
      </div>
    </div>
  )
}

function GamesBody({
  period,
  growth,
  activeAccounts,
  allTime,
  onMethod,
}: {
  period: StatsPeriod
  growth: GrowthStats
  activeAccounts: ActiveAccountsStats | null
  allTime: StatsResponse['games'] | undefined
  onMethod: (group: MethodGroup) => void
}) {
  const t = useTranslations('supervision')
  const texts = useChartTexts()
  const { columns, ariaFor, shortDay } = useDayCharts()
  const shortDate = useParisShortDate()
  const spanLabel = useSpanLabel()
  const freshness = useFreshnessLabel()
  const [tableExpanded, setTableExpanded] = useState(false)
  const { onlinePlay, localPlay } = growth
  // null : lecture des parties locales en échec côté serveur.
  const local = localPlay ?? null
  const computedAt = new Date(growth.computedAt)
  const onlineSpan = measureSpan(period, ALL_WINDOWS, { computedAt, since: onlinePlay.journalSince })
  const localSpan = measureSpan(period, ALL_WINDOWS, { computedAt, since: local?.since ?? null })
  // La somme et le tableau par jeu portent la fenêtre de la part EN LIGNE,
  // que rien ne coupe : les parties en ligne d'avant le premier jour local y
  // sont bien comptées. Un local plus jeune que la fenêtre est dit à part
  // (indice de la tuile, note du tableau), jamais dans l'intitulé, qui
  // annoncerait sinon une période que la part en ligne déborde.
  const key = onlineSpan.key
  const online = onlinePlay.launches[key]
  const onlineTotal = online.solo + online.withHumans
  const localTotals = local ? local.totals[key] : null
  const accountsComputedAt = activeAccounts ? new Date(activeAccounts.computedAt) : computedAt
  const playersSpan = measureSpan(period, ALL_WINDOWS, {
    computedAt: accountsComputedAt,
    since: activeAccounts ? accountsCoverageSince(activeAccounts.coverage) : null,
  })

  const days = gamesByDay(onlinePlay.launchesByDay, onlinePlay.journalSince, local ? { days: local.byDay, since: local.since } : null)
  const dayKeys = days.map((d) => d.day)
  const chartTitle = t('onlinePlayers.launchesTitle')
  // Solo et « entre humains » gardent leurs teintes de toujours (crème, or) ;
  // les locales prennent le bleu, une autre source.
  const series: ChartSeries[] = [
    { key: 'solo', label: t('statsTab.games.seriesSolo'), tone: 'cream' },
    { key: 'withHumans', label: t('statsTab.games.seriesWithHumans'), tone: 'gold' },
    ...(local ? [{ key: 'local', label: t('statsTab.games.seriesLocal'), tone: 'blue' as const }] : []),
  ]
  const chartNotes = [
    dayKeys.length > 0 && dayKeys[0] < onlinePlay.journalSince
      ? t('statsTab.games.onlineSince', { date: shortDate(onlinePlay.journalSince) })
      : null,
    local === null
      ? t('statsTab.games.localMissing')
      : local.since === null
        ? t('localPlay.byDayEmpty')
        : dayKeys.length > 0 && dayKeys[0] < local.since
          ? t('statsTab.games.localSince', { date: shortDate(local.since) })
          : null,
  ].filter((note): note is string => note !== null)

  const rows = gameRows(onlinePlay.launchesByGame[key], local ? local.byGame[key] : null)
  const shownRows = tableExpanded ? rows : rows.slice(0, GAME_TABLE_PREVIEW)
  const tableTitle = spanLabel(t('statsTab.games.tableTitle'), onlineSpan)
  const allTimeGames = allTime?.games ?? []
  const footerAt = oldestComputedAt(growth.computedAt, activeAccounts?.computedAt) ?? growth.computedAt

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <ActivityMetric
          label={spanLabel(t('statsTab.games.launches'), onlineSpan)}
          value={String(onlineTotal + (localTotals?.starts ?? 0))}
          detail={
            !localTotals
              ? t('statsTab.games.launchesOnlineOnly')
              : localSpan.since
                ? t('statsTab.games.launchesDetailLocalSince', { date: shortDate(localSpan.since) })
                : t('statsTab.games.launchesDetail')
          }
          definition={t('statsTab.games.launchesDef')}
        />
        <ActivityMetric
          label={spanLabel(t('statsTab.games.online'), onlineSpan)}
          value={String(onlineTotal)}
          detail={t('statsTab.games.onlineSplit', { solo: online.solo, withHumans: online.withHumans })}
          definition={t('onlinePlayers.launchesDef')}
        />
        <ActivityMetric
          label={spanLabel(t('statsTab.games.local'), localSpan)}
          value={localTotals ? String(localTotals.starts) : '—'}
          detail={localTotals ? t('localPlay.endsHint', { count: localTotals.ends }) : t('statsTab.games.localUnavailable')}
          definition={t('localPlay.def')}
        />
        {/* Le SEUL chiffre de joueurs de l'onglet : celui du tableau des
            comptes actifs, qui voit aussi le jeu local (temps en partie des
            visites), sur la définition de la courbe de la vue Joueurs. */}
        <ActivityMetric
          label={spanLabel(t('activeAccounts.playersTitle'), playersSpan)}
          value={activeAccounts ? String(activeAccounts.players.unique[playersSpan.key]) : '—'}
          detail={
            activeAccounts
              ? t('activeAccounts.accountsUnit', { count: activeAccounts.players.unique[playersSpan.key] })
              : t('loading')
          }
          definition={
            playersSpan.key === 'd1'
              ? t('activeAccounts.playersTodayDef')
              : t('activeAccounts.playersWindowDef', { days: playersSpan.days })
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatsPanel>
          <ChartHeading
            title={chartTitle}
            subtitle={
              dayKeys.length > 0
                ? t('onlinePlayers.range', { from: shortDay(dayKeys[0]), to: shortDay(dayKeys[dayKeys.length - 1]) })
                : undefined
            }
            definition={
              <NamedDefinitions
                items={[
                  { key: 'online', name: t('statsTab.games.online'), text: t('onlinePlayers.launchesDef') },
                  { key: 'local', name: t('statsTab.games.local'), text: t('localPlay.def') },
                ]}
              />
            }
          />
          <ColumnChart
            {...texts.column}
            ariaLabel={ariaFor(chartTitle, dayKeys)}
            data={columns(
              days.map((d) => ({
                day: d.day,
                values: { solo: d.solo, withHumans: d.withHumans, local: d.local },
                muted: d.muted,
              }))
            )}
            series={series}
            stacked
            mutedLabel={t('statsTab.games.legendBeforeMeasure')}
            caption={chartNotes.length > 0 ? chartNotes.join(' ') : undefined}
          />
        </StatsPanel>

        <StatsPanel>
          <ChartHeading title={tableTitle} definition={t('statsTab.games.tableDef')} />
          {local?.since && localSpan.since && (
            <p className="mb-2 text-xs text-cream/70">{t('statsTab.games.localSince', { date: shortDate(local.since) })}</p>
          )}
          {rows.length === 0 ? (
            <EmptyState icon={Gamepad2} title={t('statsTab.games.tableEmpty')} />
          ) : (
            <>
              <table className="w-full table-fixed text-sm">
                <caption className="sr-only">{tableTitle}</caption>
                <thead>
                  <tr className="text-xs text-white/70">
                    <th scope="col" className="py-1.5 pr-2 text-left font-semibold">
                      {t('charts.game')}
                    </th>
                    <th scope="col" className="w-[3.75rem] py-1.5 pl-1 text-right font-semibold">
                      {t('statsTab.games.online')}
                    </th>
                    <th scope="col" className="w-[3.75rem] py-1.5 pl-1 text-right font-semibold">
                      {t('statsTab.games.local')}
                    </th>
                    <th scope="col" className="w-[3.25rem] py-1.5 pl-1 text-right font-semibold">
                      {t('charts.total')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((row) => {
                    // Sous le nom, ce que les colonnes ne disent pas : un jeu en
                    // ligne joué seulement en solo contre des bots, un jeu local
                    // quitté avant la fin. Dans la colonne du jeu, la seule assez
                    // large à 375 px ; chaque mot n'appartient qu'à une source
                    // (« entre humains » en ligne, « terminées » en local).
                    const details = [
                      row.online != null && row.online > 0 && row.withHumans != null
                        ? t('statsTab.games.rowWithHumans', { count: row.withHumans })
                        : null,
                      row.local != null && row.local > 0
                        ? row.noEndScreen
                          ? t('statsTab.games.rowNoEndScreen')
                          : t('localPlay.endsHint', { count: row.ends ?? 0 })
                        : null,
                    ].filter((detail): detail is string => detail !== null)
                    return (
                      <tr key={row.gameId} className="border-t border-white/[0.07] align-top">
                        <th scope="row" className="py-2 pr-2 text-left font-medium text-white">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <GameIconById id={row.gameId} surface="feltGold" className="h-5 w-5 shrink-0" />
                            <span className="min-w-0 break-words">{row.gameTitle}</span>
                          </span>
                          {details.length > 0 && (
                            <span className="mt-0.5 block break-words pl-[1.375rem] text-xs font-normal text-white/70">
                              {details.join(' · ')}
                            </span>
                          )}
                        </th>
                        <td className="py-2 pl-1 text-right tabular-nums text-white/80">{countCell(row.online)}</td>
                        <td className="py-2 pl-1 text-right tabular-nums text-white/80">{countCell(row.local)}</td>
                        <td className="py-2 pl-1 text-right font-semibold tabular-nums text-white">{countCell(row.total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {rows.length > GAME_TABLE_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setTableExpanded((open) => !open)}
                  aria-expanded={tableExpanded}
                  className="mt-2 inline-flex min-h-[32px] items-center gap-1 rounded-md text-xs font-semibold text-amber-200 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                >
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', tableExpanded && 'rotate-180')} aria-hidden />
                  {tableExpanded ? t('charts.collapse') : t('charts.showAll', { count: rows.length })}
                </button>
              )}
            </>
          )}
        </StatsPanel>
      </div>

      <Disclosure title={t('statsTab.games.detailTitle')} icon={Gamepad2}>
        {/* Un cumul, pas une activité : la note reste à découvert, sans quoi
            on lirait la liste comme les parties de la période. */}
        <div className="min-w-0">
          {/* h4 : sous le titre du dépliant (h3). */}
          <ChartHeading
            level={4}
            caps
            title={t('games.playedTitle')}
            subtitle={allTime?.totalParties != null ? t('games.totalParties', { count: allTime.totalParties }) : undefined}
          />
          {allTimeGames.length === 0 ? (
            <EmptyState icon={Gamepad2} title={t('games.noneRecorded')} />
          ) : (
            <BarList
              {...texts.list}
              ariaLabel={t('games.playedTitle')}
              rows={allTimeGames.map((game) => ({
                key: game.gameId,
                label: <GameBarLabel gameId={game.gameId} title={game.title} />,
                value: game.partiesPlayed,
              }))}
              total={allTime?.totalParties}
              showShare
              limit={8}
              categoryLabel={t('charts.game')}
              primaryLabel={t('games.parties')}
            />
          )}
          <p className="mt-2 break-words text-xs leading-relaxed text-white/70">{t('games.allTimeNote')}</p>
        </div>
        {/* Pas de part en % : un joueur de deux jeux compte dans les deux. */}
        <div className="min-w-0">
          <ChartHeading
            level={4}
            caps
            title={t('method.windowed', {
              label: t('growth.playersByGameTitle'),
              window: t('statsTab.days', { days: growth.windows.playersByGameDays }),
            })}
            definition={t('growth.playersByGameDef', { days: growth.windows.playersByGameDays })}
          />
          <BarList
            {...texts.list}
            ariaLabel={t('growth.playersByGameTitle')}
            rows={growth.playersByGame.map((row) => ({
              key: row.gameId,
              label: <GameBarLabel gameId={row.gameId} title={row.gameTitle} />,
              value: row.players,
            }))}
            categoryLabel={t('charts.game')}
            primaryLabel={t('charts.players')}
            emptyLabel={t('growth.noData')}
          />
        </div>
      </Disclosure>

      {/* L'exclusion de l'équipe ne vaut ici que pour les joueurs uniques :
          les parties ont leurs propres règles, dites par la note suivante et
          par les définitions des tuiles. */}
      <StatsFooter
        notes={[
          ...(activeAccounts
            ? [
                {
                  key: 'excluded',
                  content: (
                    <DefinedLine
                      text={t('statsTab.games.playersExcluded', {
                        staff: activeAccounts.accounts.staffExcluded,
                        test: activeAccounts.accounts.testExcluded,
                      })}
                      name={t('method.names.excluded')}
                      definition={t('activeAccounts.excludedDef')}
                    />
                  ),
                },
              ]
            : []),
          { key: 'local', content: t('statsTab.games.localNote') },
        ]}
        freshness={freshness(footerAt, growth.cacheSeconds)}
        methodLabel={t('method.button')}
        onMethod={() => onMethod('games')}
      />
    </>
  )
}

/**
 * Vue Qualité : ce qui casse ou déçoit — tables figées, part du temps passé
 * en partie, plantages côté joueur, avis après la première partie. Ni la
 * période ni ses fenêtres ne s'y appliquent : chaque chiffre dit la sienne.
 */
function StatsQualityView({
  growth,
  activeAccounts,
  activeAccountsFailed,
  onMethod,
}: {
  growth: GrowthStats | null
  activeAccounts: ActiveAccountsStats | null
  activeAccountsFailed: boolean
  onMethod: (group: MethodGroup) => void
}) {
  const t = useTranslations('supervision')
  const units = useDurationUnits()
  const spanLabel = useSpanLabel()
  const freshness = useFreshnessLabel()
  const visits = activeAccounts?.visits
  const hasVisibleTime = visits ? visits.visibleSeconds7d > 0 : false
  const duration = (seconds: number) => formatPresenceDuration(seconds, units)
  const visitsSpan = measureSpan('d7', ['d7'] as const, {
    computedAt: new Date(activeAccounts?.computedAt ?? Date.now()),
    since: activeAccounts?.coverage.visitsSince ?? null,
  })
  const footerAt = oldestComputedAt(growth?.computedAt, activeAccounts?.computedAt)
  // Les deux caches ont la même durée de vie ; la plus longue, par prudence.
  const cacheSeconds = Math.max(growth?.cacheSeconds ?? 0, activeAccounts?.cacheSeconds ?? 0)
  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ActivityMetric
          label={t('growth.abandonedLabel')}
          value={growth ? String(growth.abandonedTables.stalled) : '—'}
          detail={
            growth
              ? t('growth.abandonedDetail', { stalled: growth.abandonedTables.stalled, live: growth.abandonedTables.live })
              : t('loading')
          }
          definition={t('growth.abandonedDef')}
          tone={growth && growth.abandonedTables.stalled > 0 ? 'alert' : 'default'}
        />
        <ActivityMetric
          label={spanLabel(t('activeAccounts.gameShare'), visitsSpan)}
          value={visits && hasVisibleTime ? rateLabel(visits.gameSeconds7d / visits.visibleSeconds7d) : '—'}
          detail={
            visits
              ? hasVisibleTime
                ? t('activeAccounts.gameShareDetail', {
                    game: duration(visits.gameSeconds7d),
                    visible: duration(visits.visibleSeconds7d),
                  })
                : t('activeAccounts.devicesEmpty')
              : activeAccountsFailed
                ? t('room.weekUnavailable')
                : t('loading')
          }
          definition={t('activeAccounts.gameShareDef')}
        />
      </div>

      {/* Panneaux autonomes, hors de la boucle de 15 s (F40), chargés à
          l'ouverture de la vue. */}
      <ClientErrorsPanel />
      <FirstGameFeedbackPanel />

      <StatsFooter
        freshness={footerAt ? freshness(footerAt, cacheSeconds) : undefined}
        methodLabel={t('method.button')}
        onMethod={() => onMethod('quality')}
      />
    </div>
  )
}


/**
 * « Méthode » : toutes les définitions de l'onglet Statistiques dans une
 * seule fenêtre, rangées par thème (src/lib/supervision/method.ts), avec
 * les valeurs que les tuiles interpolent (minutes, jours, seuil de cohorte).
 * Elle s'ouvre sur le thème de la section dont on a suivi le lien : le
 * focus va à son titre, qui défile en vue ; la fermeture le rend au bouton.
 * Seule la liste défile : le titre, le X et le bouton « Fermer » restent à
 * l'écran au téléphone (pas de touche Échap), et toucher le voile ferme
 * aussi — une fenêtre de lecture, rien à perdre.
 */
function MethodDialog({
  group,
  onClose,
  growthWindows,
}: {
  group: MethodGroup | null
  onClose: () => void
  growthWindows: MethodParams['growthWindows']
}) {
  const t = useTranslations('supervision')
  const headingRefs = useRef<Partial<Record<MethodGroup, HTMLHeadingElement | null>>>({})
  const groups = useMemo(
    () =>
      methodGroups({
        onlineMinutes: ONLINE_WINDOW_MINUTES,
        activeMinutes: ACTIVE_WINDOW_MINUTES,
        returnCohorts: RETURN_COHORT_DAYS,
        returnMinCohort: RETURN_RATE_MIN_COHORT,
        growthWindows,
      }),
    [growthWindows]
  )
  const translate = (key: string, values?: Record<string, string | number>) => t(key, values)

  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] flex-col border-white/10 bg-felt-deep text-white sm:max-w-2xl"
        // Le gabarit de base retient le toucher du voile (fenêtres de saisie) :
        // rendre la main à Radix, qui ferme.
        onPointerDownOutside={undefined}
        onInteractOutside={undefined}
        onOpenAutoFocus={(event) => {
          const target = group ? headingRefs.current[group] : null
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t('method.title')}</DialogTitle>
          <DialogDescription className="text-white/70">{t('method.desc')}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 space-y-6 overflow-y-auto px-4 sm:-mx-6 sm:px-6">
          {groups.map(({ group: key, entries }) => (
            <section key={key} className="min-w-0" aria-labelledby={`method-${key}`}>
              <h3
                id={`method-${key}`}
                ref={(node) => {
                  headingRefs.current[key] = node
                }}
                tabIndex={-1}
                className="mb-2 scroll-mt-2 border-b border-gold/30 pb-1 font-display text-sm font-bold uppercase tracking-wide text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
              >
                {t(`method.groups.${key}`)}
              </h3>
              <dl className="min-w-0 space-y-3">
                {entries.map((entry) => (
                  <div key={entry.id} className="min-w-0">
                    <dt className="break-words text-sm font-semibold text-cream">{resolveMessage(entry.term, translate)}</dt>
                    <dd className="mt-0.5 break-words text-xs leading-relaxed text-white/80">
                      {resolveMessage(entry.definition, translate)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <DialogFooter className="shrink-0">
          <DialogClose asChild>
            <Button variant="outline" className="min-h-[44px]">
              {t('method.close')}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Modération › Journal : tout l'historique de l'équipe, page par page
 * (/api/admin/journal), hors de la boucle de 15 s. La page se relit quand
 * l'exploitant en change, et quand la vue d'ensemble voit passer une action
 * nouvelle (`latestId`) : sans quoi la liste et son total resteraient ceux de
 * l'ouverture.
 */
function TeamJournalPanel({
  latestId,
  renderEntries,
}: {
  latestId: string | undefined
  renderEntries: (entries: JournalEntry[]) => ComponentProps<typeof JournalList>['entries']
}) {
  const t = useTranslations('supervision')
  const [page, setPage] = useState(1)
  const [journal, setJournal] = useState<{ entries: JournalEntry[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  // Une réponse plus ancienne (page changée entre-temps) peut arriver après
  // la plus récente : seule la dernière requête lancée écrit.
  const requestSeq = useRef(0)

  const load = useCallback(async (target: number) => {
    const seq = ++requestSeq.current
    const isLatest = () => seq === requestSeq.current
    setLoading(true)
    setFailed(false)
    try {
      const params = new URLSearchParams({ page: String(target), pageSize: String(TEAM_JOURNAL_PAGE_SIZE) })
      const res = await fetch(`/api/admin/journal?${params.toString()}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`journal ${res.status}`)
      const data = (await res.json()) as { entries?: JournalEntry[]; total?: number }
      if (!isLatest()) return
      const total = data.total ?? 0
      // Page vidée entre deux lectures (sanction levée, par exemple) : on
      // retombe sur la dernière page qui existe, pas sur « aucune action ».
      const lastPage = Math.max(1, Math.ceil(total / TEAM_JOURNAL_PAGE_SIZE))
      if (target > lastPage) {
        setPage(lastPage)
        return
      }
      setJournal({ entries: data.entries ?? [], total })
    } catch {
      if (isLatest()) setFailed(true)
    } finally {
      if (isLatest()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(page)
  }, [load, page, latestId])

  const total = journal?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / TEAM_JOURNAL_PAGE_SIZE))

  return (
    <SectionCard
      icon={ScrollText}
      title={t('room.journalTitle')}
      description={total > 0 ? t('moderationTab.journalDesc', { count: total }) : t('room.journalDesc')}
      bodyClassName="space-y-3"
    >
      {failed ? (
        <ErrorState
          icon={AlertTriangle}
          message={t('moderationTab.journalLoadError')}
          retryLabel={t('states.retry')}
          onRetry={() => void load(page)}
        />
      ) : !journal ? (
        <SkeletonRows rows={5} />
      ) : journal.entries.length === 0 ? (
        <EmptyState icon={ScrollText} title={t('room.journalEmpty')} />
      ) : (
        <JournalList entries={renderEntries(journal.entries)} />
      )}
      {!failed && (
        <Pager
          page={page}
          pageSize={TEAM_JOURNAL_PAGE_SIZE}
          total={total}
          onPage={setPage}
          busy={loading}
          summary={t('states.pageSummary', { page, pages, total })}
          previousLabel={t('states.previousPage')}
          nextLabel={t('states.nextPage')}
        />
      )}
    </SectionCard>
  )
}

/**
 * Le tableau de bord lit l'URL (?tab=, ?userId=) dès sa racine : il vit sous
 * sa propre frontière Suspense, condition que Next pose à useSearchParams
 * depuis que le site n'est plus forcé en rendu dynamique. La page reste de
 * fait rendue à la demande (son layout lit le cookie de session pour filtrer
 * l'accès), donc le repli ne s'affiche jamais — la frontière est là pour que
 * le build ne dépende pas de ce détail du layout.
 */
export default function SupervisionPage() {
  return (
    <Suspense fallback={null}>
      <SupervisionDashboard />
    </Suspense>
  )
}

function SupervisionDashboard() {
  const t = useTranslations('supervision')
  const tErrors = useTranslations('errors')
  const locale = useLocale()
  const format = useFormatter()
  const durationUnits = useDurationUnits()
  const honestPresenceSince = useHonestPresenceSince()
  const dayCharts = useDayCharts()
  const { user, loading } = useAuth()
  const router = useRouter()
  // Onglet ouvert, lu dans ?tab= : un rechargement ou un retour depuis la
  // fiche d'un compte ramène sur le même onglet (voir selectTab).
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  // ?userId= : journal des parties restreint à un compte (lien « voir dans le
  // journal » de la fiche). Le nom n'y figure jamais, seul l'id.
  const journalUserId = searchParams.get('userId') || undefined
  // ?view= : vue de l'onglet ouvert (Statistiques : Audience, Joueurs, Jeux,
  // Qualité ; Modération : Signalements, Sanctions, Mots et pseudos, Journal).
  const viewParam = searchParams.get('view')
  // ?scope=resolved : filtre « Traités » des signalements.
  const scopeParam = searchParams.get('scope')
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [overview, setOverview] = useState<SupervisionOverview | null>(null)
  // Premier aller-retour de loadLive terminé, réponses reçues ou non : la
  // Salle et Statistiques n'ont rien d'autre à attendre pour quitter leur
  // squelette (le chargement des COMPTES, qu'elles n'affichent pas, n'y
  // entre pas).
  const [liveSettled, setLiveSettled] = useState(false)
  // Heure de la dernière actualisation RÉUSSIE de loadLive (« à jour · 14:32 »
  // de l'en-tête) : un tour en échec laisse l'heure du précédent, qui dit
  // depuis quand les chiffres affichés n'ont pas bougé.
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Date | null>(null)
  // Bandeau santé de la Salle, hors de la boucle de 15 s : relus à
  // l'ouverture de la Salle et au bouton Actualiser. undefined = pas encore
  // lus (aucune pastille), null = lecture en échec (pastille orange).
  const [opsJobs, setOpsJobs] = useState<OpsJobView[] | null | undefined>(undefined)
  const [crashes24h, setCrashes24h] = useState<number | null | undefined>(undefined)
  // Détail déplié sous le bandeau : le ménage, ou tout ce qui va bien.
  const [healthExpanded, setHealthExpanded] = useState<string | null>(null)
  // Indicateurs de croissance : hors de la boucle de 15 s (F40), chargés une
  // seule fois à l'ouverture de l'onglet Statistiques et servis avec leur
  // date de calcul.
  const [growth, setGrowth] = useState<GrowthStats | null>(null)
  // Échec du chargement de la croissance : affiché, et il ne bloque plus
  // l'arrivée sur le journal filtré (qui attendait ces indicateurs).
  const [growthFailed, setGrowthFailed] = useState(false)
  // Tableau des comptes actifs (lot 7) : même régime que la croissance, hors
  // de la boucle — chargé à l'ouverture de la Salle (« Cette semaine ») ou de
  // Statistiques, puis sur Actualiser.
  const [activeAccounts, setActiveAccounts] = useState<ActiveAccountsStats | null>(null)
  const [activeAccountsFailed, setActiveAccountsFailed] = useState(false)
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
  const [editingNames, setEditingNames] = useState<Record<string, string>>({})
  const [accountSearch, setAccountSearch] = useState('')
  // Accordéon de la liste des comptes : seuls les comptes DÉPLIÉS montrent
  // le détail (email, IP, actions) — la liste reste compacte.
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<SupervisionTab>('overview')
  // Onglet lu dans l'URL : jusque-là, `activeTab` n'est que la valeur de
  // départ. Les chargements propres à un onglet l'attendent — sans quoi une
  // arrivée sur ?tab=stats ou ?tab=accounts tirait d'abord ceux de La Salle,
  // et les comptes actifs deux fois.
  const [locationReady, setLocationReady] = useState(false)
  // Vues des Statistiques et de la Modération, reflétées dans ?view=.
  // Gardées en passant sur un autre onglet : on y revient là où on les avait
  // laissées.
  const [statsView, setStatsView] = useState<StatsView>(DEFAULT_STATS_VIEW)
  const statsViewRef = useRef(statsView)
  statsViewRef.current = statsView
  const [moderationView, setModerationView] = useState<ModerationView>('reports')
  const moderationViewRef = useRef(moderationView)
  moderationViewRef.current = moderationView
  // Filtre des signalements (« En cours » / « Traités ») : il détermine ce
  // que le serveur renvoie, plus aucun tri côté navigateur. Reflété dans
  // ?scope=resolved pour qu'un rechargement garde les traités.
  const [feedbackScope, setFeedbackScope] = useState<FeedbackScope>('active')
  const feedbackScopeRef = useRef(feedbackScope)
  feedbackScopeRef.current = feedbackScope
  // Période des Statistiques : 7 jours, ou celle que ce navigateur a choisie
  // la dernière fois (relue après le premier rendu, voir plus bas).
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>(DEFAULT_STATS_PERIOD)
  // Journal des parties de la vue Jeux : replié, sauf arrivée par « voir
  // dans le journal » (?userId=).
  const [journalOpen, setJournalOpen] = useState(Boolean(journalUserId))
  const [accountFilterRole, setAccountFilterRole] = useState('all')
  const [accountFilterStatus, setAccountFilterStatus] = useState('all')
  const [accountFilterKind, setAccountFilterKind] = useState('all')
  const [accountFilterActivity, setAccountFilterActivity] = useState('all')
  // Tri par dernière activité par défaut : un compte actif ne se retrouve
  // plus derrière des inscrits récents qui ne sont jamais revenus.
  const [accountSort, setAccountSort] = useState<'activity' | 'created'>('activity')
  const [rolesHelpOpen, setRolesHelpOpen] = useState(false)
  // « Méthode » des statistiques : null = fermée, sinon le thème sur lequel
  // elle s'ouvre (celui de la section dont on a suivi le lien).
  const [methodGroup, setMethodGroup] = useState<MethodGroup | null>(null)
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
  // Lire un retour est ouvert aux modérateurs, le CLORE reste admin+ (F44).
  const canTriageFeedback = user ? canManageUserFeedback(user.role) : false

  const tRef = useRef(t)
  const tErrorsRef = useRef(tErrors)
  tRef.current = t
  tErrorsRef.current = tErrors

  const userId = user?.id
  const userRole = user?.role

  // Onglets et vues de Modération que ce rôle peut ouvrir : mêmes conditions
  // que les routes qui les alimentent (navigation.ts). Serveur reste aux
  // fondateurs : la route le vérifie aussi, ici c'est seulement ne pas
  // montrer un onglet qui répondrait 403.
  const allowedTabs = useMemo(() => (userRole ? supervisionTabsFor(userRole) : []), [userRole])
  const moderationViews = useMemo(() => (userRole ? moderationViewsFor(userRole) : []), [userRole])

  // Navigation en trois familles : Salle et Statistiques, Comptes et
  // Modération, Serveur à part (l'état de la machine n'est ni de l'analyse ni
  // de la modération, et seuls les fondateurs le voient).
  const navGroups = useMemo<SupervisionNavGroup[]>(() => {
    if (!userRole) return []
    return supervisionNavGroupsFor(userRole).map((group) => ({
      label: t(`navGroups.${group.key}`),
      items: group.tabs.map((tab) => {
        const item = { value: tab, label: t(TAB_META[tab].labelKey), icon: TAB_META[tab].icon }
        // Total NON filtré, invités compris : l'ancien `usersTotal || stats…`
        // mêlait deux définitions et suivait la recherche en cours.
        if (tab === 'accounts') return { ...item, count: accountCounts?.total || '' }
        if (tab === 'moderation') {
          return {
            ...item,
            count: activeFeedbackTotal || '',
            tone: activeFeedbackTotal > 0 ? ('warning' as const) : ('neutral' as const),
          }
        }
        return item
      }),
    }))
  }, [userRole, accountCounts?.total, activeFeedbackTotal, t])

  /** Compteur d'une vue de Modération : signalements en cours, sanctions actives. */
  const moderationViewBadge = (view: ModerationView): { count?: number | string; tone?: CountTone } => {
    if (view === 'reports') {
      return { count: activeFeedbackTotal || '', tone: activeFeedbackTotal > 0 ? 'warning' : 'neutral' }
    }
    if (view === 'sanctions') return { count: bans.length || '', tone: bans.length > 0 ? 'danger' : 'neutral' }
    return {}
  }

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
        // « À jour » seulement quand les deux réponses sont arrivées : une
        // moitié en échec laisse des chiffres d'avant à l'écran.
        if (statsRes.ok && overviewRes.ok) setLiveUpdatedAt(new Date())
      } catch (e) {
        if (!silent) setError(e instanceof Error ? e.message : tErrorsRef.current('generic'))
      } finally {
        setLiveSettled(true)
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
    setGrowthFailed(false)
    try {
      const res = await fetch('/api/admin/growth', { credentials: 'include' })
      if (!res.ok) throw new Error(`growth ${res.status}`)
      setGrowth(await res.json())
    } catch {
      // Les indicateurs ne cassent pas la console : une carte le signale à
      // leur place, avec « Réessayer ».
      setGrowthFailed(true)
    }
  }, [userRole])

  /**
   * Comptes actifs : une requête à part, jamais dans la boucle (un parcours
   * de 31 jours de visites et de journal, mis en cache côté serveur). Un échec
   * garde la valeur déjà affichée : le panneau le signale au-dessus. Une
   * lecture en cours sert aussi à qui la redemande (changement d'onglet,
   * Actualiser) : jamais deux parcours en parallèle.
   */
  const activeAccountsRequest = useRef<Promise<void> | null>(null)
  const loadActiveAccounts = useCallback((): Promise<void> => {
    if (!userRole || !canViewSupervisionAnalytics(userRole)) {
      setActiveAccounts(null)
      return Promise.resolve()
    }
    if (activeAccountsRequest.current) return activeAccountsRequest.current
    setActiveAccountsFailed(false)
    const request = (async () => {
      try {
        const res = await fetch('/api/admin/accounts/activity', { credentials: 'include' })
        if (!res.ok) throw new Error(`accounts activity ${res.status}`)
        setActiveAccounts(await res.json())
      } catch {
        setActiveAccountsFailed(true)
      } finally {
        activeAccountsRequest.current = null
      }
    })()
    activeAccountsRequest.current = request
    return request
  }, [userRole])

  /**
   * Entrées du bandeau santé qui ne viennent pas de la vue d'ensemble : les
   * plantages des 24 h (tout admin) et les tâches root du VPS (fondateurs, la
   * route refuse les autres). Jamais dans la boucle de 15 s : ce sont des
   * fichiers d'état et un comptage, relus à l'ouverture de la Salle et sur
   * Actualiser. Un échec donne null — « illisible », pas « tout va bien ».
   */
  const loadSalleHealth = useCallback(async () => {
    if (!userRole || !canViewSupervisionAnalytics(userRole)) return
    const loadCrashes = async () => {
      try {
        const res = await fetch('/api/admin/client-errors', { credentials: 'include' })
        if (!res.ok) throw new Error(`client-errors ${res.status}`)
        const data: unknown = await res.json()
        const total =
          data && typeof data === 'object' && 'total24h' in data && typeof data.total24h === 'number'
            ? data.total24h
            : null
        setCrashes24h(total)
      } catch {
        setCrashes24h(null)
      }
    }
    const loadOpsJobs = async () => {
      if (!canViewOpsStatus(userRole)) return
      try {
        const res = await fetch('/api/admin/ops-status', { credentials: 'include', cache: 'no-store' })
        if (!res.ok) throw new Error(`ops-status ${res.status}`)
        const data: unknown = await res.json()
        // Réponse d'un serveur antérieur à la route, ou page d'erreur du proxy.
        if (!data || typeof data !== 'object' || !('jobs' in data) || !Array.isArray(data.jobs)) {
          throw new Error('ops-status: réponse illisible')
        }
        setOpsJobs(data.jobs as OpsJobView[])
      } catch {
        setOpsJobs(null)
      }
    }
    await Promise.all([loadCrashes(), loadOpsJobs()])
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
      }
    },
    [userId, userRole, loadUsers, loadSettings, loadBans, loadLive, loadFeedback]
  )

  /**
   * Dernier triplet ?tab= / ?view= / ?scope= appliqué. L'onglet, la vue et le
   * filtre affichés vivent dans l'état ; l'URL n'en est que le reflet, relue
   * seulement quand elle CHANGE (premier rendu connecté, navigation vers un
   * autre ?tab=). selectTab met l'état à jour tout de suite et l'URL un rendu
   * plus tard : sans ce repère, une autre dépendance qui bougerait entre les
   * deux rejouerait l'ancien onglet.
   */
  const appliedLocation = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (loading) return
    if (!user || !canAccessSupervision(user.role)) {
      router.replace('/compte')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (loading || !userRole || !canAccessSupervision(userRole)) return
    const requested = `${tabParam ?? ''}|${viewParam ?? ''}|${scopeParam ?? ''}`
    if (appliedLocation.current === requested) return
    const resolved = resolveSupervisionLocation({
      tab: tabParam,
      view: viewParam,
      scope: scopeParam,
      userId: journalUserId ?? null,
      role: userRole,
    })
    setActiveTab(resolved.tab)
    setLocationReady(true)
    if (isStatsView(resolved.view)) setStatsView(resolved.view)
    if (isModerationView(resolved.view)) setModerationView(resolved.view)
    if (resolved.feedbackScope) setFeedbackScope(resolved.feedbackScope)
    // Ancien lien redirigé (?tab=overview&userId=, ?tab=geo, ?tab=bans,
    // ?tab=feedback…), vue absente, inconnue ou hors de portée, onglet hors
    // de portée : l'URL suit ce qui est réellement ouvert, sinon un
    // rechargement après « tout afficher » rouvrirait La Salle au lieu du
    // journal.
    const scope = resolved.feedbackScope === 'resolved' ? RESOLVED_SCOPE_PARAM : null
    const patch: Record<string, string | null> = {}
    if (tabParam && resolved.tab !== tabParam) patch.tab = resolved.tab
    if ((viewParam || null) !== resolved.view) patch.view = resolved.view
    if ((scopeParam || null) !== scope) patch.scope = scope
    const pick = (key: string, current: string | null) => (key in patch ? patch[key] : current)
    appliedLocation.current = `${pick('tab', tabParam) ?? ''}|${pick('view', viewParam) ?? ''}|${pick('scope', scopeParam) ?? ''}`
    if (Object.keys(patch).length > 0) replaceUrlParams(patch)
  }, [loading, userRole, tabParam, viewParam, scopeParam, journalUserId])

  /**
   * Change d'onglet et l'écrit dans l'URL (?tab=, ?view=, ?scope=), sans
   * recharger ni défiler. Sans `view`, l'onglet rouvre la vue où on l'avait
   * laissé. replaceUrlParams plutôt que router.replace : le routeur de
   * @/i18n/navigation ne transmet pas `scroll: false`, et une navigation
   * relancerait le rendu serveur (layout gardé par la session) à chaque clic
   * d'onglet. Remplacer plutôt qu'empiler : le retour arrière ne rejoue pas
   * chaque onglet visité, il quitte la Supervision ou revient d'une fiche.
   *
   * `reveal` : lien posé DANS un panneau (file, « Tout le journal »,
   * pastilles, adresses IP). Quand l'onglet change, le panneau quitté est
   * démonté avec le bouton qui avait le focus, et la page garderait son
   * défilement au milieu du nouvel onglet : on remonte à la navigation si
   * elle est sortie de l'écran et on rend le focus à l'onglet ouvert. Sans
   * changement d'onglet, rien ne bouge.
   */
  const navRef = useRef<HTMLElement>(null)
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab
  const selectTab = useCallback((tab: SupervisionTab, view?: SupervisionView, options?: { reveal?: boolean }) => {
    const tabChanged = activeTabRef.current !== tab
    activeTabRef.current = tab
    // ?view=, ?scope= et ?userId= ne valent que là où ils servent : retirés
    // ailleurs, ils ne traînent pas dans un lien copié depuis un autre onglet
    // (supervisionUrlPatch).
    let nextView: SupervisionView | null = null
    if (tab === 'stats') {
      const statsTarget = isStatsView(view) ? view : statsViewRef.current
      statsViewRef.current = statsTarget
      setStatsView(statsTarget)
      nextView = statsTarget
    } else if (tab === 'moderation') {
      const moderationTarget = isModerationView(view) ? view : moderationViewRef.current
      moderationViewRef.current = moderationTarget
      setModerationView(moderationTarget)
      nextView = moderationTarget
    }
    const patch = supervisionUrlPatch({ tab, view: nextView, feedbackScope: feedbackScopeRef.current })
    appliedLocation.current = `${tab}|${nextView ?? ''}|${patch.scope ?? ''}`
    setActiveTab(tab)
    replaceUrlParams(patch)
    if (options?.reveal && tabChanged) {
      // Après le rendu du nouvel onglet : son bouton porte alors aria-current.
      window.requestAnimationFrame(() => {
        const nav = navRef.current
        if (!nav) return
        if (nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ block: 'start' })
        nav.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true })
      })
    }
  }, [])

  /** Nom d'onglet venu d'un composant générique (navigation) : ignoré s'il est inconnu. */
  const selectTabValue = useCallback(
    (value: string) => {
      if (isSupervisionTab(value)) selectTab(value)
    },
    [selectTab]
  )

  /** Ouvre une vue des Statistiques depuis son sélecteur. */
  const selectStatsView = useCallback((view: StatsView) => selectTab('stats', view), [selectTab])

  /** Ouvre une vue de la Modération depuis son sélecteur. */
  const selectModerationView = useCallback((view: ModerationView) => selectTab('moderation', view), [selectTab])

  /**
   * Ouvre les signalements sur un filtre : depuis le filtre lui-même ou la
   * file « À traiter » de la Salle (toujours « en cours », où l'entrée vit).
   */
  const openFeedbackReports = useCallback(
    (scope: FeedbackScope, options?: { reveal?: boolean }) => {
      feedbackScopeRef.current = scope
      setFeedbackScope(scope)
      selectTab('moderation', 'reports', options)
    },
    [selectTab]
  )

  // Période mémorisée par navigateur. Relue APRÈS le premier rendu : le
  // rendu serveur ne la connaît pas, et un stockage bloqué (navigation
  // privée, données effacées) laisse simplement 7 jours.
  useEffect(() => {
    try {
      const saved = parseStatsPeriod(window.localStorage.getItem(STATS_PERIOD_STORAGE_KEY))
      if (saved) setStatsPeriod(saved)
    } catch {
      // Stockage indisponible : la période par défaut reste.
    }
  }, [])

  const changeStatsPeriod = useCallback((period: StatsPeriod) => {
    setStatsPeriod(period)
    try {
      window.localStorage.setItem(STATS_PERIOD_STORAGE_KEY, period)
    } catch {
      // Stockage indisponible : la période vaut pour cette visite seulement.
    }
  }, [])

  // Un lien « voir dans le journal » arrivé après coup (même page, autre
  // compte) déplie aussi le journal.
  useEffect(() => {
    if (journalUserId) setJournalOpen(true)
  }, [journalUserId])

  // Arrivée par « voir dans le journal » : le journal est en bas de la vue
  // Jeux, sous les chiffres. On l'amène à l'écran une fois par compte
  // filtré, quand ce qui le précède est chargé (sinon il redescend sous les
  // tuiles, le graphe et le tableau par jeu).
  const journalPanelRef = useRef<HTMLDivElement>(null)
  const journalScrolledFor = useRef<string | null>(null)
  // « En direct » de la Salle, cible de la pastille « Tables » du bandeau.
  const liveSectionRef = useRef<HTMLDivElement>(null)
  // Chargée OU en échec : dans les deux cas, ce qui précède le journal a sa hauteur.
  const growthSettled = growth !== null || growthFailed
  // Idem pour les comptes actifs, dont la vue Jeux tire ses joueurs uniques.
  const activeAccountsSettled = activeAccounts !== null || activeAccountsFailed
  useEffect(() => {
    if (
      !journalUserId ||
      activeTab !== 'stats' ||
      statsView !== 'games' ||
      !journalOpen ||
      !growthSettled ||
      !activeAccountsSettled
    ) {
      return
    }
    if (journalScrolledFor.current === journalUserId) return
    journalScrolledFor.current = journalUserId
    journalPanelRef.current?.scrollIntoView({ block: 'start' })
  }, [journalUserId, activeTab, statsView, journalOpen, growthSettled, activeAccountsSettled])

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
    if (loading || !userId || !userRole || !locationReady || activeTab !== 'stats') return
    if (growth) return
    void loadGrowth()
  }, [loading, userId, userRole, locationReady, activeTab, growth, loadGrowth])

  // Comptes actifs : même règle, sur la Salle (« Cette semaine ») comme sur
  // Statistiques — la route est mise en cache, la croissance, elle, reste
  // propre à Statistiques. Ni l'état de chargement ni l'échec ne sont des
  // dépendances — un échec relancerait la requête en boucle ; on réessaie au
  // prochain retour sur l'onglet, par Actualiser ou par le bouton du panneau.
  // Actualiser les relit aussi : sans quoi « Cette semaine » restait figée
  // sur la première réponse pendant toute la session.
  useEffect(() => {
    if (loading || !userId || !userRole || !locationReady) return
    if (activeTab !== 'stats' && activeTab !== 'overview') return
    if (activeAccounts) return
    void loadActiveAccounts()
  }, [loading, userId, userRole, locationReady, activeTab, activeAccounts, loadActiveAccounts])

  // Bandeau santé : relu à chaque ouverture de la Salle.
  useEffect(() => {
    if (loading || !userId || !userRole || !locationReady || activeTab !== 'overview') return
    void loadSalleHealth()
  }, [loading, userId, userRole, locationReady, activeTab, loadSalleHealth])

  const handleIpClick = useCallback(async (ip: string) => {
    ipLookupForRef.current = ip
    setAccountSearch(ip)
    selectTab('accounts', undefined, { reveal: true })
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
  }, [selectTab])

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
    selectTab('accounts', undefined, { reveal: true })
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
  }, [selectTab])

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

  // La Salle — tendance tirée de la série quotidienne (pas d'appel dédié).
  // Écart d'une semaine sur l'autre : les 7 jours RÉVOLUS contre les 7 d'avant,
  // même règle que la vue Audience (stats-period.ts). Plus de delta du jour :
  // il comparait une journée entamée à la veille entière (presque toujours
  // rouge le matin), et DailyVisitor ne garde pas l'heure qui permettrait de
  // comparer à la même heure la veille.
  const trendPoints = overview?.dailySeries ?? []
  const todayParis = parisDayString()
  const weekVisitorsDelta = weekOverWeekDelta(trendPoints, todayParis, ANALYTICS_CONSENT_V2_SINCE)
  // Consentement de version 2 : le bandeau est reposé à tous et les
  // navigateurs ne comptent plus tant qu'ils n'ont pas répondu. Une courbe
  // qui inclut ce jour (ou un jour d'avant) montrerait une chute de
  // fréquentation qui n'en est pas une.
  const comparableSince = (day: string) => day > ANALYTICS_CONSENT_V2_SINCE
  // Mini-courbe sous la SEULE plaque « 7 jours » (la même, sous deux plaques
  // voisines, se lisait deux fois au lecteur d'écran), en teintes lisibles
  // sur le crème. Jours RÉVOLUS seulement : finir sur aujourd'hui, entamé,
  // plongerait chaque matin vers un point mis en avant — la chute trompeuse
  // pour laquelle le delta du jour a été retiré. Et seulement APRÈS la reprise
  // du bandeau de consentement : sa marche n'est pas une baisse, et seul le
  // graphe de tendance porte la note qui le dit (même règle que le delta).
  const sparkPoints = trendPoints.filter((p) => p.date < todayParis && comparableSince(p.date))
  const visitorsSparkline =
    sparkPoints.length > 1 ? (
      <Sparkline
        ariaLabel={dayCharts.ariaFor(t('room.visitorsChartTitle'), sparkPoints.map((p) => p.date))}
        values={sparkPoints.map((p) => p.visitors)}
        labels={sparkPoints.map((p) => dayCharts.fullDay(p.date))}
        surface="cream"
        tone="gold"
      />
    ) : undefined
  const liveTables = overview?.liveTables ?? []
  // Effectifs par statut : ceux de la BASE, pas ceux de la liste affichée,
  // plafonnée à 30 salles (voir getLiveTables). La liste ne sert que de repli
  // face à un serveur antérieur à ce champ.
  const liveStatusCount = (status: LiveTable['status']) =>
    overview?.liveTablesByStatus?.[status] ?? liveTables.filter((tbl) => tbl.status === status).length
  const liveStatusOrder = ['playing', 'briefing', 'waiting', 'cast'] as const
  const liveTotal = liveStatusOrder.reduce((sum, status) => sum + liveStatusCount(status), 0)
  const liveSummary = liveStatusOrder
    .filter((status) => liveStatusCount(status) > 0)
    .map((status) => t(`room.liveStatusCount.${status}`, { count: liveStatusCount(status) }))
    .join(' · ')
  // Tables figées en tête, les plus anciennement figées d'abord ; les autres
  // gardent l'ordre du serveur (tri stable).
  // Un afficheur TV inactif n'est pas une table figée : il n'a aucune partie
  // à débloquer, la purge des salles de cast le retire, et la pastille
  // « Tables » comme la vue Qualité l'excluent déjà.
  const isStalledGame = (tbl: LiveTable) => tbl.stalled && tbl.status !== 'cast'
  const sortedLiveTables = [...liveTables].sort((a, b) =>
    isStalledGame(a) === isStalledGame(b)
      ? isStalledGame(a)
        ? b.idleSeconds - a.idleSeconds
        : 0
      : isStalledGame(a)
        ? -1
        : 1
  )
  const liveStatusLabel = (status: LiveTable['status']) =>
    t(
      status === 'waiting'
        ? 'room.statusWaiting'
        : status === 'briefing'
          ? 'room.statusBriefing'
          : status === 'cast'
            ? 'room.statusCast'
            : 'room.statusPlaying'
    )

  // Bandeau santé : rien n'y figure tant que sa source n'est pas lue.
  const health = splitHealthPills(
    healthPills(
      {
        opsJobs,
        retention: overview?.retentionLastRun,
        crashes24h,
        stalledTables: overview
          ? (overview.stalledGameTables ?? liveTables.filter((tbl) => tbl.stalled && tbl.status !== 'cast').length)
          : undefined,
        now: Date.now(),
      },
      (key, values) => t(key, values)
    )
  )
  const retentionInAlert = health.alerts.some((pill) => pill.key === 'retention')
  // Tables figées → « En direct », juste en dessous ; ménage et groupe vert →
  // détail déplié sous le bandeau ; le reste → HEALTH_TARGET.
  const selectHealthPill = (key: string) => {
    const target = HEALTH_TARGET[key]
    if (target) {
      selectTab(target.tab, target.view, { reveal: true })
    } else if (key === 'stalled') {
      // Le focus suit le défilement : le Tab suivant mène aux tables.
      const section = liveSectionRef.current
      if (!section) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      section.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
      section.focus({ preventScroll: true })
    } else {
      setHealthExpanded((open) => (open === key ? null : key))
    }
  }

  // « Cette semaine » : tiré du tableau des comptes actifs, « — » tant qu'il
  // manque. L'intitulé dit le premier jour mesuré quand la source est plus
  // jeune que la semaine.
  const week = activeAccounts ? weekFigures(activeAccounts) : null
  const weekWindow = (since: string | null | undefined) =>
    since
      ? t('gameSessions.windowSince', {
          window: t('stats.week'),
          date: format.dateTime(parisDayToDate(since), { day: '2-digit', month: '2-digit', timeZone: PARIS_TIME_ZONE }),
        })
      : t('stats.week')
  const weekPendingHint = activeAccountsFailed ? t('room.weekUnavailable') : t('loading')

  // Journal de l'équipe : l'heure pour aujourd'hui, le jour sinon — une
  // heure seule ferait passer une action d'avant-hier pour une de ce matin.
  // La Salle en montre les dernières entrées (vue d'ensemble), Modération ›
  // Journal tout l'historique, page par page (TeamJournalPanel).
  const teamJournal = overview?.journal ?? []
  const journalTime = (iso: string) => {
    const at = new Date(iso)
    return parisDayString(at) === todayParis
      ? format.dateTime(at, { timeStyle: 'short', timeZone: PARIS_TIME_ZONE })
      : format.dateTime(at, { day: '2-digit', month: '2-digit', timeZone: PARIS_TIME_ZONE })
  }
  const teamJournalEntries = (entries: JournalEntry[]) =>
    entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      time: journalTime(e.createdAt),
      // Phrase traduite d'un bloc, puis le lien vers la fiche de la cible :
      // découper la phrase autour du pseudo casserait dès qu'il apparaît
      // aussi dans le nom de l'acteur.
      text: e.targetUserId ? (
        <>
          {journalText(t, e)}{' '}
          <Link
            href={accountFileHref(e.targetUserId)}
            title={t('accounts.openFileOf', { name: e.targetName ?? '—' })}
            className="whitespace-nowrap text-amber-300/80 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          >
            {t('visitorCard.openFile')}
          </Link>
        </>
      ) : (
        journalText(t, e)
      ),
    }))

  // « N en ligne » : COMPTES actifs (User.lastSeenAt, presence.ts), équipe et
  // invités compris. Sans statistiques (modérateurs), pas de chiffre du tout
  // plutôt qu'un « 0 en ligne » permanent.
  const onlineCount = stats ? stats.connectedAccounts.filter((acc) => isOnline(acc.lastSeenAt)).length : null
  const openOnlineAccounts = () => {
    changeAccountSearch('')
    setAccountFilterRole('all')
    setAccountFilterKind('all')
    setAccountFilterActivity('all')
    setAccountFilterStatus('online')
    selectTab('accounts')
  }

  // Les tableaux mis en cache côté serveur sont relus (le cache répond tant
  // qu'il est frais, l'heure de calcul affichée le dit) : la croissance sur
  // Statistiques, les comptes actifs sur Statistiques ET sur La Salle, dont
  // « Cette semaine » restait sinon figée sur la première réponse.
  const refreshAll = () => {
    void loadAll()
    if (activeTab === 'overview') {
      void loadSalleHealth()
      void loadActiveAccounts()
    }
    if (activeTab === 'stats') {
      void loadGrowth()
      void loadActiveAccounts()
    }
  }

  // « Voir » : un signalement s'ouvre dans Modération › Signalements, filtre
  // « en cours » (là où il attend) ; un pseudo suspect dans Comptes, cherché.
  const handleQueueAction = (id: string) => {
    const item = overview?.queue.find((q) => q.id === id)
    if (!item) return
    if (item.href === 'feedback') {
      openFeedbackReports('active', { reveal: true })
      return
    }
    changeAccountSearch(item.title)
    selectTab('accounts', undefined, { reveal: true })
  }

  const handleQueueAcknowledge = async (id: string) => {
    const item = overview?.queue.find((q) => q.id === id)
    if (!item || queueBusyId) return
    setQueueBusyId(id)
    setError(null)
    try {
      // Retiré de la file seulement une fois acquitté : un refus (droits,
      // compte disparu) faisait disparaître l'élément jusqu'au rafraîchissement.
      await acknowledgeQueueItem(item, t('apiErrors.modifyDenied'))
      setOverview((prev) => (prev ? { ...prev, queue: prev.queue.filter((q) => q.id !== id) } : prev))
      void loadLive(true)
      if (item.kind === 'feedback') void loadFeedback(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
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
        online={
          onlineCount !== null
            ? {
                label: t('header.onlineCount', { count: onlineCount }),
                description: t('header.onlineTitle', { count: onlineCount, minutes: ONLINE_WINDOW_MINUTES }),
                onClick: openOnlineAccounts,
              }
            : undefined
        }
        updatedLabel={
          liveUpdatedAt
            ? t('header.updatedAt', {
                time: format.dateTime(liveUpdatedAt, { timeStyle: 'short', timeZone: PARIS_TIME_ZONE }),
              })
            : undefined
        }
        onRefresh={refreshAll}
        refreshLabel={t('header.refresh')}
        refreshing={busy}
      />

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
        onSelect={selectTabValue}
        groupAria={t('tabs.section')}
        navRef={navRef}
      />

      {/* Pas de tablist : la navigation est faite de boutons aria-current, en
          familles. Des tabpanel sans onglet ne portaient aucun nom et
          ajoutaient un arrêt de tabulation vide ; le panneau ouvert se nomme
          par le bouton actif, et seul lui est monté. */}
      <div className="min-w-0 space-y-4">
        {showAnalytics && activeTab === 'overview' && (
        <section aria-labelledby={supervisionNavItemId('overview')} className="min-w-0 space-y-5">
          {/* La Salle est un écran de TRIAGE : ce qui va mal, ce qui attend,
              ce qui se joue, puis la semaine en quatre chiffres. Les
              graphiques et les définitions vivent dans Statistiques. */}
          {!liveSettled ? (
            <SkeletonRows rows={4} />
          ) : (
          <>
          <HealthStrip
            ariaLabel={t('health.aria')}
            alerts={health.alerts}
            ok={health.ok}
            okGroupKey={HEALTH_OK_GROUP}
            okGroupLabel={t('health.okGroup', { labels: health.ok.map((pill) => pill.label).join(' · ') })}
            toggleKeys={HEALTH_TOGGLE_KEYS}
            expandedKey={healthExpanded}
            onSelect={selectHealthPill}
          >
            {healthExpanded === 'retention' && retentionInAlert && overview?.retentionLastRun !== undefined && (
              <RetentionRunLine run={overview.retentionLastRun} />
            )}
            {healthExpanded === HEALTH_OK_GROUP && health.ok.length > 0 && (
              <ul className="min-w-0 space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs leading-relaxed text-white/70">
                {health.ok.map((pill) => (
                  <li key={pill.key} className="min-w-0 break-words">
                    {pill.key === 'retention' && overview?.retentionLastRun !== undefined ? (
                      <RetentionRunLine run={overview.retentionLastRun} />
                    ) : (
                      <>
                        <span className="font-semibold text-white">{pill.label}</span> · {pill.detail}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </HealthStrip>

          {/* À traiter d'abord : c'est la seule chose qui attend une décision.
              Une colonne sous 1024 px, la file au-dessus. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              icon={MessageSquareWarning}
              title={
                <>
                  {t('room.queueTitle')}
                  <span
                    className={cn(
                      'rounded-full px-2 py-px text-xs font-bold tabular-nums',
                      (overview?.queue ?? []).length > 0 ? 'bg-suit-red/20 text-red-200' : 'bg-white/10 text-white/70'
                    )}
                  >
                    {(overview?.queue ?? []).length}
                  </span>
                </>
              }
              description={t('room.queueDesc')}
            >
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

            {/* tabIndex -1 : la pastille « Tables » y pose le focus. */}
            <div
              ref={liveSectionRef}
              tabIndex={-1}
              className="min-w-0 scroll-mt-4 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
            >
              <SectionCard icon={Radio} title={t('room.liveTablesTitle')} description={t('room.liveTablesDesc')} className="h-full">
                {liveTables.length === 0 ? (
                  <EmptyState icon={Gamepad2} title={t('room.liveTablesEmpty')} hint={t('room.liveTablesEmptyHint')} />
                ) : (
                  <div className="min-w-0 space-y-2.5">
                    {/* Effectifs comptés en base, diffusion TV comprise ; la
                        liste, elle, est plafonnée par le serveur. */}
                    <p className="break-words text-xs font-medium text-white/80">
                      {liveSummary}
                      {liveTotal > liveTables.length && ` · ${t('room.liveShown', { shown: liveTables.length })}`}
                    </p>
                    <ul className="space-y-1.5">
                      {sortedLiveTables.map((tbl) => {
                        const extra = tbl.memberCount - tbl.memberNames.length
                        const names = tbl.memberNames.join(', ') + (extra > 0 ? ` +${extra}` : '')
                        return (
                          <LiveTableRow
                            key={tbl.id}
                            icon={tbl.gameId ? <GameIconById id={tbl.gameId} surface="feltGold" className="h-5 w-5 shrink-0" /> : undefined}
                            gameTitle={tbl.gameTitle}
                            code={tbl.code}
                            status={tbl.status}
                            statusLabel={liveStatusLabel(tbl.status)}
                            players={
                              names
                                ? `${t('room.playersCount', { count: tbl.memberCount })} · ${names}`
                                : t('room.playersCount', { count: tbl.memberCount })
                            }
                            elapsed={
                              tbl.status === 'cast' && tbl.stalled
                                ? t('room.castIdleFor', { duration: idleLabel(tbl.idleSeconds) })
                                : t('room.openedFor', {
                                    duration: formatPresenceDuration(
                                      (Date.now() - new Date(tbl.createdAt).getTime()) / 1000,
                                      durationUnits
                                    ),
                                  })
                            }
                            stalled={isStalledGame(tbl)}
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
                        )
                      })}
                    </ul>
                  </div>
                )}
              </SectionCard>
            </div>
          </div>

          {/* La semaine en quatre plaques, sans graphique : le détail, les
              définitions et les autres périodes sont dans Statistiques. */}
          <section aria-labelledby="salle-week-title" className="min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
              <div className="min-w-0">
                <h2 id="salle-week-title" className="text-base font-semibold text-white">
                  {t('room.weekTitle')}
                </h2>
                <p className="text-xs text-white/70">{t('room.weekDesc')}</p>
              </div>
              <button
                type="button"
                onClick={() => selectTab('stats', undefined, { reveal: true })}
                className="-mx-1 inline-flex min-h-[32px] items-center gap-1 rounded-md px-1 text-xs font-semibold text-amber-200 transition-colors hover:text-amber-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
              >
                {t('room.allStats')}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {/* NAVIGATEURS ayant accepté les statistiques (DailyVisitor), pas
                  des comptes ni des personnes : l'indice le dit, et rien n'est
                  additionné aux comptes des plaques voisines. */}
              <KpiPlaque
                label={t('room.weekVisitors', { window: t('stats.week') })}
                value={stats ? stats.visitors.week : '—'}
                hint={t('stats.weekHint')}
                delta={
                  weekVisitorsDelta != null
                    ? {
                        direction: weekVisitorsDelta >= 0 ? 'up' : 'down',
                        label: `${deltaLabel(weekVisitorsDelta)} ${t('room.vsPrevWeek')}`,
                      }
                    : undefined
                }
                trend={visitorsSparkline}
              />
              {/* Comptes, hors équipe et comptes de test (tableau des comptes
                  actifs) : aucun écart affiché, la réponse n'en donne pas. */}
              <KpiPlaque
                label={t('room.weekActive', { window: weekWindow(week?.accountsSince) })}
                value={week ? week.activeAccounts : '—'}
                hint={
                  week
                    ? t('onlinePlayers.accountsDetail', { count: week.activeAccounts, guests: week.guests })
                    : weekPendingHint
                }
              />
              <KpiPlaque
                label={t('room.weekLaunches', { window: weekWindow(week?.launchesSince) })}
                value={week ? week.launches : '—'}
                hint={week ? t('room.weekLaunchesHint') : weekPendingHint}
              />
              <KpiPlaque
                label={t('room.weekReturning', { window: weekWindow(week?.accountsSince) })}
                value={week ? week.returning : '—'}
                hint={week ? t('room.weekReturningHint', { count: week.activeAccounts }) : weekPendingHint}
              />
            </div>
            {/* Trois plaques sur quatre sortent d'un cache, pas de la boucle
                en direct : l'heure de l'en-tête ne vaut pas pour elles. */}
            {activeAccounts && (
              <p className="break-words text-xs text-white/70">
                {t('room.weekFreshness', {
                  time: format.dateTime(new Date(activeAccounts.computedAt), {
                    timeStyle: 'short',
                    timeZone: PARIS_TIME_ZONE,
                  }),
                  minutes: Math.max(1, Math.round(activeAccounts.cacheSeconds / 60)),
                })}
              </p>
            )}
          </section>

          {/* Les dernières actions seulement : la suite est dans
              Modération › Journal. */}
          <SectionCard
            icon={ScrollText}
            title={t('room.journalTitle')}
            description={t('room.journalDesc')}
            actions={
              teamJournal.length > TEAM_JOURNAL_PREVIEW ? (
                <button
                  type="button"
                  onClick={() => selectTab('moderation', 'journal', { reveal: true })}
                  className="-mx-1 inline-flex min-h-[32px] items-center gap-1 rounded-md px-1 text-xs font-semibold text-amber-200 transition-colors hover:text-amber-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                >
                  {t('room.journalAll')}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : undefined
            }
          >
            {teamJournal.length === 0 ? (
              <EmptyState icon={ScrollText} title={t('room.journalEmpty')} />
            ) : (
              <JournalList entries={teamJournalEntries(teamJournal.slice(0, TEAM_JOURNAL_PREVIEW))} />
            )}
          </SectionCard>
          </>
          )}
        </section>
        )}

        {showAnalytics && activeTab === 'stats' && (
        <section aria-labelledby={supervisionNavItemId('stats')} className="min-w-0 space-y-4">
          {/* Les vues n'ont pas de cadre titré : sans ce titre, le plan de la
              page passait du h1 aux h3 des blocs sans nommer la vue ouverte.
              À l'œil, le sélecteur le dit déjà. */}
          <h2 className="sr-only">{t(`method.groups.${statsView}`)}</h2>
          {/* Barre d'outils : la vue (une question à la fois) et la période,
              mémorisée par navigateur. La vue Qualité n'en dépend pas :
              chacun de ses chiffres dit sa propre fenêtre. */}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <SegmentedControl
              label={t('statsTab.viewsAria')}
              options={STATS_VIEWS.map((view) => ({ value: view, label: t(`method.groups.${view}`) }))}
              value={statsView}
              onChange={selectStatsView}
            />
            {statsView !== 'quality' && (
              <SegmentedControl
                label={t('statsTab.periodAria')}
                options={STATS_PERIODS.map((period) => ({ value: period, label: t(PERIOD_LABEL_KEY[period]) }))}
                value={statsPeriod}
                onChange={changeStatsPeriod}
              />
            )}
          </div>

          {statsView === 'audience' &&
            // Visiteurs, pays et courbe viennent de la boucle en direct : son
            // premier retour suffit, réponse reçue ou non.
            (!liveSettled ? (
              <SkeletonRows rows={4} />
            ) : (
              <StatsAudienceView
                period={statsPeriod}
                stats={stats}
                dailySeries={overview?.dailySeries ?? []}
                activeAccounts={activeAccounts}
                activeAccountsFailed={activeAccountsFailed}
                onCountryClick={handleCountryClick}
                onIpClick={handleIpClick}
                onNetworkClick={handleNetworkLookup}
                onMethod={setMethodGroup}
              />
            ))}
          {statsView === 'players' && (
            <StatsPlayersView
              period={statsPeriod}
              stats={activeAccounts}
              failed={activeAccountsFailed}
              onRetry={() => void loadActiveAccounts()}
              growth={growth}
              growthFailed={growthFailed}
              onRetryGrowth={() => void loadGrowth()}
              onMethod={setMethodGroup}
            />
          )}
          {statsView === 'games' && (
            <StatsGamesView
              period={statsPeriod}
              growth={growth}
              growthFailed={growthFailed}
              onRetryGrowth={() => void loadGrowth()}
              activeAccounts={activeAccounts}
              allTime={stats?.games}
              journalUserId={journalUserId}
              journalOpen={journalOpen}
              onJournalOpenChange={setJournalOpen}
              journalRef={journalPanelRef}
              onShowAllJournal={() => replaceUrlParam('userId', null)}
              onMethod={setMethodGroup}
            />
          )}
          {statsView === 'quality' && (
            <StatsQualityView
              growth={growth}
              activeAccounts={activeAccounts}
              activeAccountsFailed={activeAccountsFailed}
              onMethod={setMethodGroup}
            />
          )}
        </section>
        )}

        {activeTab === 'accounts' && (
        <section aria-labelledby={supervisionNavItemId('accounts')} className="min-w-0 space-y-4">
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

              {/* La définition de « en ligne » à découvert, là où mène la
                  pastille de l'en-tête : un title ne se lit pas au toucher. */}
              {accountFilterStatus === 'online' && (
                <p className="break-words text-xs text-white/70">
                  {t('accounts.onlineFilterDesc', { minutes: ONLINE_WINDOW_MINUTES })}
                </p>
              )}

              {/* Décompte NON filtré : il ne bouge pas avec la recherche. */}
              {accountCounts && (
                <div className="space-y-0.5">
                  <p className="text-xs leading-relaxed text-white/60">
                    {t('accounts.kindSummary', kindSummaryValues(accountCounts.total, accountCounts))}
                  </p>
                  {/* Répartition par rôle (joueurs compris, invités compris),
                      qui vivait dans une carte de la Salle. Servie avec les
                      statistiques : absente pour qui ne les voit pas. Un rôle
                      à 0 reste écrit : « 0 modérateur » est une information. */}
                  {stats && (
                    <p className="text-xs leading-relaxed text-white/70">
                      {t('accounts.byRoleLine', {
                        players: stats.accounts.byRole.user,
                        moderators: stats.accounts.byRole.moderator,
                        admins: stats.accounts.byRole.admin,
                        superadmins: stats.accounts.byRole.superadmin,
                        founders: stats.accounts.byRole.fondateur,
                      })}
                    </p>
                  )}
                  <p className="text-[11px] leading-relaxed text-white/35">
                    {t('accounts.countsNote', { date: honestPresenceSince })}
                  </p>
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
                        <li key={acc.id} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                          <AccountNameLink userId={acc.id} name={acc.displayName} className="text-white/85" />
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
                        {/* Résumé 7 j (admins et plus : absent pour un modérateur).
                            Visites suivies sous consentement seulement : sans
                            visite, « aucune visite suivie », jamais « 0 visite ». */}
                        {u.visits7d && (
                          <span className="min-w-0 break-words text-[11px] tabular-nums text-white/45">
                            {u.visits7d.visits > 0
                              ? t('accounts.visits7d', {
                                  visits: u.visits7d.visits,
                                  active: formatPresenceDuration(u.visits7d.activeSeconds, durationUnits),
                                })
                              : t('accounts.visits7dNone')}
                          </span>
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
                        <UserActivityLines compact lastLoginAt={u.lastLoginAt} />
                      )}
                      {u.ban.banned && u.ban.banComment && (
                        <p className="text-xs text-red-300/80">{t('accounts.banReason', { reason: u.ban.banComment })}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {/* Fiche en pleine page (ex-dialogue Historique) : parties en
                          ligne, séances, réseaux et modération y vivent. */}
                      <AccountFileButton userId={u.id} />

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
        </section>
        )}

        {/* Modération : une vue à la fois (signalements, sanctions, mots et
            pseudos, journal de l'équipe), chacune montrée seulement au rôle
            dont la route répondrait. Un modérateur n'a que les signalements :
            pas de sélecteur à un seul bouton. */}
        {allowedTabs.includes('moderation') && activeTab === 'moderation' && (
        <section aria-labelledby={supervisionNavItemId('moderation')} className="min-w-0 space-y-4">
          {moderationViews.length > 1 && (
            <SegmentedControl
              label={t('moderationTab.viewsAria')}
              options={moderationViews.map((view) => ({
                value: view,
                label: t(`moderationTab.views.${view}`),
                ...moderationViewBadge(view),
              }))}
              value={moderationView}
              onChange={selectModerationView}
            />
          )}

          {/* Avis de 1re partie : leur route répond dès modérateur. Qui voit les
              Statistiques les lit dans la vue Qualité ; les autres ici, au-dessus
              des retours où arrivent ceux qui portent un commentaire. */}
          {moderationView === 'reports' && moderationViews.includes('reports') && !showAnalytics && (
            <FirstGameFeedbackPanel />
          )}
          {moderationView === 'reports' && moderationViews.includes('reports') && (
            <SectionCard
              icon={feedbackScope === 'active' ? MessageSquareWarning : CheckCheck}
              title={t(feedbackScope === 'active' ? 'feedback.activeTitle' : 'feedback.resolvedTitle')}
              description={t(feedbackScope === 'active' ? 'feedback.activeDesc' : 'feedback.resolvedDesc')}
              bodyClassName="space-y-4"
            >
              {/* Le filtre choisit ce que le serveur renvoie ; ses deux
                  compteurs viennent de la même réponse. */}
              <SegmentedControl
                label={t('moderationTab.scopeAria')}
                options={[
                  {
                    value: 'active',
                    label: t('moderationTab.scope.active'),
                    count: activeFeedbackTotal || '',
                    tone: activeFeedbackTotal > 0 ? 'warning' : 'neutral',
                  },
                  { value: 'resolved', label: t('moderationTab.scope.resolved'), count: resolvedFeedbackTotal || '' },
                ]}
                value={feedbackScope}
                onChange={openFeedbackReports}
              />
              <FeedbackSearchBar
                value={feedbackSearch}
                onChange={setFeedbackSearch}
                placeholder={t(feedbackScope === 'active' ? 'feedback.searchActive' : 'feedback.searchResolved')}
                resultCount={feedbackTotal}
                totalCount={feedbackScope === 'active' ? activeFeedbackTotal : resolvedFeedbackTotal}
              />
              <FeedbackListSection
                items={feedbackItems}
                emptyMessage={
                  feedbackLoading
                    ? t('loading')
                    : feedbackScope === 'active'
                      ? t(feedbackSearch.trim() ? 'feedback.noActiveSearch' : 'feedback.noActive')
                      : t(feedbackSearch.trim() ? 'feedback.noResolvedSearch' : 'feedback.noResolved')
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
          )}

          {moderationView === 'sanctions' && moderationViews.includes('sanctions') && (
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
                        {b.email && <p className="truncate text-xs text-white/70">{b.email}</p>}
                      </div>
                      <Badge className="border-red-500/30 bg-red-500/[0.15] text-red-200">
                        {b.banType === 'permanent' ? t('bans.permanent') : t('bans.temporary')}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-white/70">
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
          )}

          {moderationView === 'words' && moderationViews.includes('words') && (
            <>
              {canManageSiteSettings(user.role) && (
                <SectionCard icon={Radio} title={t('siteSettings.title')} description={t('siteSettings.desc')}>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{t('siteSettings.voiceLabel')}</p>
                      <p className="text-xs text-white/70">
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
            </>
          )}

          {/* Tout l'historique de l'équipe (la Salle n'en montre que le
              début), de la plus récente à la plus ancienne. */}
          {moderationView === 'journal' && moderationViews.includes('journal') && (
            <TeamJournalPanel latestId={teamJournal[0]?.id} renderEntries={teamJournalEntries} />
          )}
        </section>
        )}

        {/* Serveur : panneau autonome (route /api/admin/ops-status). Monté
            seulement onglet ouvert, son rafraîchissement de 60 s s'arrête
            avec lui. */}
        {allowedTabs.includes('ops') && activeTab === 'ops' && (
        <section aria-labelledby={supervisionNavItemId('ops')} className="min-w-0 space-y-4">
          <OpsStatusPanel />
        </section>
        )}
      </div>

      {/* Aide sur les rôles : une référence, pas une information du jour —
          en pied de page sur tous les onglets, juste avant l'empreinte de
          version, plutôt qu'en tête où elle repoussait le travail. */}
      <section className="min-w-0 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={() => setRolesHelpOpen((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          aria-expanded={rolesHelpOpen}
          aria-controls="supervision-roles-help"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          {t('rolesHelpTitle')}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', rolesHelpOpen && 'rotate-180')} aria-hidden />
        </button>
        {rolesHelpOpen && (
          <div
            id="supervision-roles-help"
            className="mt-3 space-y-1.5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 text-sm leading-relaxed text-white/80"
          >
            <p><strong className="text-yellow-200">{t('roles.fondateur')}</strong> — {t('roleDescriptions.fondateur')}</p>
            <p><strong className="text-rose-200">{t('roles.superadmin')}</strong> — {t('roleDescriptions.superadmin')}</p>
            <p><strong className="text-amber-200">{t('roles.admin')}</strong> — {t('roleDescriptions.admin')}</p>
            <p><strong className="text-teal-200">{t('roles.moderator')}</strong> — {t('roleDescriptions.moderator')}</p>
            <p><strong className="text-white">{t('roles.user')}</strong> — {t('roleDescriptions.user')}</p>
            <p className="text-xs text-white/70">{t('rolesHierarchy')}</p>
          </div>
        )}
      </section>

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
                {selectedFeedback.type === FIRST_GAME_FEEDBACK_TYPE && (
                  <FirstGameFeedbackMeta
                    rating={selectedFeedback.rating}
                    gameId={selectedFeedback.gameId}
                    playMode={selectedFeedback.playMode}
                    size="lg"
                  />
                )}
                {/* Un avis de 1re partie peut n'être qu'une note : le dire
                    plutôt que laisser un paragraphe vide. */}
                {(selectedFeedback.message ?? selectedFeedback.messagePreview) ||
                selectedFeedback.type !== FIRST_GAME_FEEDBACK_TYPE ? (
                  <p className="whitespace-pre-wrap text-sm text-white/80">
                    {selectedFeedback.message ?? selectedFeedback.messagePreview}
                  </p>
                ) : (
                  <p className="text-sm italic text-white/50">{t('feedback.noComment')}</p>
                )}
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
            // dans l'onglet Comptes : ce dialogue se ferme, sinon il masquait
            // le résultat. La fiche, en pleine page, le démonte d'elle-même.
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

      <MethodDialog group={methodGroup} onClose={() => setMethodGroup(null)} growthWindows={growth?.windows ?? null} />
    </SupervisionShell>
  )
}
