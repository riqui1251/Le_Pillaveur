"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import {
  Activity,
  Ban,
  Calendar,
  CalendarDays,
  CalendarRange,
  Clock,
  Crown,
  Globe,
  History,
  Info,
  Network,
  Search,
  Shield,
  ShieldCheck,
  UserX,
  Users,
  Gamepad2,
  Trash2,
  MessageSquarePlus,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Monitor,
  Smartphone,
  Laptop,
  Tablet,
} from 'lucide-react'
import { deviceLabel } from '@/lib/device-from-user-agent'
import { useAuth } from '@/hooks/useAuth'
import {
  assignableRoles,
  canAccessSupervision,
  canAssignRoles,
  canPermanentBanTarget,
  canTemporaryBanTarget,
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
import { formatPresenceDuration } from '@/lib/format-presence'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ModerationTermsPanel } from '@/components/supervision/ModerationTermsPanel'
import { NameModerationAttemptsPanel } from '@/components/supervision/NameModerationAttemptsPanel'
import { cn } from '@/lib/utils'

type CountryRow = { country: string | null; count: number }

type IpEntry = {
  ip: string
  country: string | null
  lastSeenAt: string
  firstSeenAt?: string
}

type ConnectedAccount = {
  id: string
  displayName: string
  email: string | null
  accountCode: string | null
  country: string | null
  ip: string | null
  ips?: IpEntry[]
  lastDevice?: string | null
  lastSeenAt: string | null
  role: string
  online: boolean
}

type BotSignals = {
  suspicious: boolean
  reasons: string[]
}

type VisitorIpRow = {
  subjectKey: string
  visitorId: string
  userId: string | null
  country: string | null
  primaryIp: string | null
  lastDevice: string | null
  ips: IpEntry[]
  displayName: string | null
  email: string | null
  accountCode: string | null
  role: string | null
  localPlayerNames: string[]
  localPlayerCount: number
  botSignals: BotSignals
  lastSeenAt: string
  online: boolean
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
    total: number
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

type AdminUser = {
  id: string
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
}

type ActiveBan = {
  id: string
  email: string | null
  displayName: string
  accountCode: string | null
  role: string
  banType: string
  bannedUntil: string | null
  banComment: string | null
  bannedAt: string | null
  bannedByName: string | null
}

type FeedbackItem = {
  id: string
  type: string
  typeLabel: string
  message: string
  messagePreview: string
  screenshots: string[]
  pageUrl: string | null
  userAgent: string | null
  userId: string | null
  authorName: string
  contactEmail: string | null
  status: string
  statusLabel: string
  createdAt: string
  updatedAt: string
}

type UserDetail = {
  user: {
    id: string
    email: string
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

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: number
  hint: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2 sm:p-6">
        <CardTitle className="text-sm font-medium leading-snug text-white/80">{label}</CardTitle>
        <Icon className="h-4 w-4 shrink-0 text-amber-400/80" />
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6">
        <div className="text-2xl font-bold text-white sm:text-3xl">{value}</div>
        <p className="mt-1 text-xs leading-relaxed text-white/45">{hint}</p>
      </CardContent>
    </Card>
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

function matchesAccountSearch(
  user: {
    displayName: string
    email: string | null
    accountCode: string | null
    lastIp?: string | null
    ips?: IpEntry[]
  },
  query: string
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const codeQ = q.replace(/^lp-/, '')
  if (user.displayName.toLowerCase().includes(q)) return true
  if (user.email?.toLowerCase().includes(q)) return true
  if (user.accountCode?.toLowerCase().includes(codeQ)) return true
  if (user.lastIp?.toLowerCase().includes(q)) return true
  if (user.ips?.some((entry) => entry.ip.toLowerCase().includes(q))) return true
  return false
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

function IpAddressDisplay({
  ips,
  device,
  onIpClick,
  compact,
}: {
  ips: IpEntry[]
  device?: string | null
  onIpClick?: (ip: string) => void
  compact?: boolean
}) {
  const t = useTranslations('supervision')
  const locale = useLocale()
  const format = useFormatter()
  if (ips.length === 0) {
    return <span className="text-white/40">—</span>
  }

  const primary = ips[0]
  const others = ips.slice(1)

  return (
    <div className={`inline-flex flex-wrap items-center gap-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      <button
        type="button"
        onClick={() => onIpClick?.(primary.ip)}
        className="font-mono text-amber-200/90 hover:underline"
      >
        {primary.ip}
      </button>
      <DeviceBadge device={device} compact={compact} />
      {others.length > 0 && (
        <details className="inline-block">
          <summary className="cursor-pointer list-none rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-amber-200/70 hover:bg-white/10 [&::-webkit-details-marker]:hidden">
            {t('device.moreIps', { count: others.length })}
          </summary>
          <ul className="mt-1 space-y-0.5 rounded-md border border-white/10 bg-black/40 p-2">
            {others.map((entry) => (
              <li key={entry.ip}>
                <button
                  type="button"
                  onClick={() => onIpClick?.(entry.ip)}
                  className="font-mono text-[11px] text-amber-200/80 hover:underline"
                >
                  {entry.ip}
                </button>
                <span className="ml-1 text-[10px] text-white/35">
                  {countryLabel(entry.country, locale, t('unknownCountry'))} · {format.dateTime(new Date(entry.lastSeenAt), { dateStyle: 'medium' })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function matchesFeedbackSearch(item: FeedbackItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item.message.toLowerCase().includes(q)) return true
  if (item.messagePreview.toLowerCase().includes(q)) return true
  if (item.authorName.toLowerCase().includes(q)) return true
  if (item.typeLabel.toLowerCase().includes(q)) return true
  if (item.type.toLowerCase().includes(q)) return true
  if (item.statusLabel.toLowerCase().includes(q)) return true
  if (item.contactEmail?.toLowerCase().includes(q)) return true
  if (item.pageUrl?.toLowerCase().includes(q)) return true
  return false
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
                      : 'border-violet-500/30 bg-violet-500/15 text-violet-200'
                }
              >
                {item.typeLabel}
              </Badge>
              <Badge variant="secondary">{item.statusLabel}</Badge>
            </div>
            <span className="text-xs text-white/40">
              {format.dateTime(new Date(item.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-white">{item.authorName}</p>
          <p className="mt-1 text-sm text-white/60">{item.messagePreview}</p>
          {item.screenshots.length > 0 && (
            <p className="mt-1 text-xs text-white/35">
              {item.screenshots.length}
              {item.screenshots.length > 1 ? t('feedback.screenshots') : t('feedback.screenshot')}
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
      <Badge className={cn('border-violet-500/30 bg-violet-500/15 text-violet-200', badgeClass)}>
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
  return (
    <div className={compact ? 'space-y-0.5 text-[11px] text-white/35' : 'space-y-1 text-sm text-white/60'}>
      <p>
        {t('activity.lastLogin')}{' '}
        {lastLoginAt
          ? format.dateTime(new Date(lastLoginAt), { dateStyle: 'medium', timeStyle: 'short' })
          : t('activity.neverLoggedIn')}
      </p>
      <p>
        {t('activity.timeOnSite', { duration: formatPresenceDuration(totalPresenceSeconds) })}
        {!compact && (
          <span className="text-xs text-white/35">{t('activity.estimated')}</span>
        )}
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
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base text-white sm:text-lg">
          <Globe className="h-5 w-5 shrink-0 text-amber-400" />
          {title}
        </CardTitle>
        <CardDescription className="leading-relaxed">
          {description}
          {onCountryClick && t('geo.tapCountry')}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6">
        {rows.length === 0 ? (
          <p className="text-sm text-white/45">{t('geo.noData')}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.country ?? 'unknown'}>
                <button
                  type="button"
                  onClick={() => onCountryClick?.(row.country, scope)}
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
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
      </CardContent>
    </Card>
  )
}

function LocalPlayersSection({ row }: { row: VisitorIpRow }) {
  const t = useTranslations('supervision')
  if (row.localPlayerCount === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-white/45">{t('geo.localPlayersLabel')}</p>
        <p className="mt-1 text-sm text-white/40">
          {t('geo.noLocalPlayers')}
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

function VisitorDetailPanel({
  row,
  onIpClick,
}: {
  row: VisitorIpRow
  onIpClick?: (ip: string) => void
}) {
  const t = useTranslations('supervision')
  const locale = useLocale()
  const format = useFormatter()
  return (
    <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-sm">
      <div>
        <p className="text-xs font-medium text-white/45">{t('geo.ipAddresses')}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <DeviceBadge device={row.lastDevice} />
        </div>
        {row.ips.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {row.ips.map((entry) => (
              <li
                key={entry.ip}
                className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
              >
                <button
                  type="button"
                  onClick={() => onIpClick?.(entry.ip)}
                  className="font-mono text-xs text-amber-200/90 hover:underline"
                >
                  {entry.ip}
                </button>
                <span className="text-white/50">
                  {countryFlag(entry.country)} {countryLabel(entry.country, locale, t('unknownCountry'))}
                </span>
                <span className="text-[11px] text-white/35">
                  {format.dateTime(new Date(entry.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-white/40">{t('geo.noIp')}</p>
        )}
      </div>
      {row.displayName ? (
        <div>
          <p className="text-xs font-medium text-white/45">{t('geo.linkedAccount')}</p>
          <p className="mt-1 text-white">
            {row.displayName}
            {row.accountCode && (
              <span className="ml-2 font-mono text-amber-200/70">{row.accountCode}</span>
            )}
          </p>
          {row.email && <p className="text-xs text-white/45">{row.email}</p>}
        </div>
      ) : (
        <p className="text-white/45">{t('geo.noLinkedAccount')}</p>
      )}
      <LocalPlayersSection row={row} />
      <p className="font-mono text-[10px] text-white/30">{t('geo.visitorId', { id: row.visitorId })}</p>
    </div>
  )
}

function IpVisitorList({
  rows,
  onIpClick,
}: {
  rows: VisitorIpRow[]
  onIpClick?: (ip: string) => void
}) {
  const t = useTranslations('supervision')
  const locale = useLocale()
  const format = useFormatter()
  const [query, setQuery] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      if (row.primaryIp?.toLowerCase().includes(q)) return true
      if (row.ips.some((entry) => entry.ip.toLowerCase().includes(q))) return true
      if (row.visitorId.toLowerCase().includes(q)) return true
      if (row.displayName?.toLowerCase().includes(q)) return true
      if (row.email?.toLowerCase().includes(q)) return true
      if (row.accountCode?.toLowerCase().includes(q)) return true
      if (row.localPlayerNames.some((name) => name.toLowerCase().includes(q))) return true
      if (countryLabel(row.country, locale, t('unknownCountry')).toLowerCase().includes(q)) return true
      if (row.country?.toLowerCase().includes(q)) return true
      return false
    })
  }, [rows, query])

  const renderPlayer = (row: VisitorIpRow) =>
    row.displayName ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-white">{row.displayName}</span>
        <AccountCodeBadge code={row.accountCode} />
        {row.role && <RoleBadge role={row.role} compact />}
        {row.online && (
          <Badge className="border-green-500/30 bg-green-500/10 text-[10px] text-green-300">{t('accounts.online')}</Badge>
        )}
      </div>
    ) : (
      <span className="text-sm text-white/40">{t('geo.anonymousVisitor')}</span>
    )

  const toggleExpand = (key: string) => {
    setExpandedKey((current) => (current === key ? null : key))
  }

  return (
    <Card className="border-white/10 bg-white/[0.03] md:col-span-2">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base text-white sm:text-lg">
          <Network className="h-5 w-5 shrink-0 text-amber-400" />
          {t('geo.visitorsTitle')}
        </CardTitle>
        <CardDescription className="leading-relaxed">
          {t('geo.visitorsDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0 sm:p-6">
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
          <p className="py-6 text-center text-sm text-white/45">
            {rows.length === 0
              ? t('geo.noVisitors')
              : t('geo.noSearchResults')}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => {
              const expanded = expandedKey === row.subjectKey
              const ips =
                row.ips.length > 0
                  ? row.ips
                  : row.primaryIp
                    ? [{ ip: row.primaryIp, country: row.country, lastSeenAt: row.lastSeenAt }]
                    : []

              return (
                <div
                  key={row.subjectKey}
                  className={`rounded-xl border bg-black/20 transition-colors ${
                    expanded ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(row.subjectKey)}
                    className="w-full p-3 text-left"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        {renderPlayer(row)}
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                          <IpAddressDisplay ips={ips} device={row.lastDevice} onIpClick={onIpClick} compact />
                          <span className="flex items-center gap-1 text-xs text-white/50">
                            {countryFlag(row.country)}
                            {countryLabel(row.country, locale, t('unknownCountry'))}
                          </span>
                          {row.localPlayerCount > 0 && (
                            <Badge variant="outline" className="w-fit text-[10px] text-white/55">
                              {row.localPlayerCount}{row.localPlayerCount > 1 ? t('geo.localPlayers') : t('geo.localPlayer')}
                            </Badge>
                          )}
                          {row.botSignals.suspicious && (
                            <Badge className="w-fit border-orange-500/35 bg-orange-500/10 text-[10px] text-orange-200">
                              Suspect
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-2 sm:block sm:text-right">
                        <span className="text-xs text-white/40">
                          {format.dateTime(new Date(row.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <p className="text-[10px] text-amber-300/60 sm:mt-1">
                          {expanded ? t('geo.hide') : t('geo.details')}
                        </p>
                      </div>
                    </div>
                  </button>
                  {expanded && <div className="px-3 pb-3"><VisitorDetailPanel row={{ ...row, ips }} onIpClick={onIpClick} /></div>}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SupervisionPage() {
  const t = useTranslations('supervision')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('errors')
  const locale = useLocale()
  const format = useFormatter()
  const actionLabel = useActionLabel()
  const { user, loading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [bans, setBans] = useState<ActiveBan[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingNames, setEditingNames] = useState<Record<string, string>>({})
  const [accountSearch, setAccountSearch] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [accountFilterRole, setAccountFilterRole] = useState('all')
  const [accountFilterStatus, setAccountFilterStatus] = useState('all')
  const [rolesHelpOpen, setRolesHelpOpen] = useState(false)
  const [ipLookup, setIpLookup] = useState<{
    ip: string
    accounts: Array<{
      id: string
      displayName: string
      email: string | null
      accountCode: string | null
      role: string
      online: boolean
      banned: boolean
    }>
    visitors: Array<{ visitorId: string; displayName: string | null; online: boolean }>
  } | null>(null)
  const [ipLookupLoading, setIpLookupLoading] = useState(false)

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
  } | null>(null)
  const [unbanComment, setUnbanComment] = useState('')

  const [banDialog, setBanDialog] = useState<{
    userId: string
    displayName: string
    type: 'permanent' | 'temporary'
  } | null>(null)
  const [banComment, setBanComment] = useState('')
  const [banDays, setBanDays] = useState('7')

  const [historyUserId, setHistoryUserId] = useState<string | null>(null)
  const [historyDetail, setHistoryDetail] = useState<UserDetail | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const [deleteDialog, setDeleteDialog] = useState<{
    userId: string
    displayName: string
  } | null>(null)

  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([])
  const [feedbackSearch, setFeedbackSearch] = useState('')
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  const canEditAccounts = user ? canManageUsers(user.role) : false
  const showAccountActivity = user ? canViewAccountActivity(user.role) : false
  const assignableRoleOptions = user ? assignableRoles(user.role) : []
  const showAnalytics = user ? canViewSupervisionAnalytics(user.role) : false
  const showBansTab = user ? canViewSupervisionBans(user.role) : false
  const showFeedbackTab = user ? canViewUserFeedback(user.role) : false
  const defaultTab = showAnalytics ? 'overview' : 'accounts'
  const onlineSinceMs = Date.now() - 5 * 60 * 1000

  const subtitle = showAnalytics
    ? t('subtitles.full')
    : showBansTab
      ? t('subtitles.bans')
      : t('subtitles.accounts')

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (!matchesAccountSearch(u, accountSearch)) return false
      if (accountFilterRole !== 'all' && u.role !== accountFilterRole) return false
      if (accountFilterStatus === 'banned' && !u.ban.banned) return false
      if (accountFilterStatus === 'online') {
        const seen = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0
        if (seen < onlineSinceMs) return false
      }
      return true
    })
  }, [users, accountSearch, accountFilterRole, accountFilterStatus, onlineSinceMs])

  const activeFeedbackItems = useMemo(
    () =>
      feedbackItems.filter(
        (f) => f.status !== 'resolved' && matchesFeedbackSearch(f, feedbackSearch)
      ),
    [feedbackItems, feedbackSearch]
  )

  const resolvedFeedbackItems = useMemo(
    () =>
      feedbackItems.filter(
        (f) => f.status === 'resolved' && matchesFeedbackSearch(f, feedbackSearch)
      ),
    [feedbackItems, feedbackSearch]
  )

  const activeFeedbackTotal = useMemo(
    () => feedbackItems.filter((f) => f.status !== 'resolved').length,
    [feedbackItems]
  )

  const resolvedFeedbackTotal = useMemo(
    () => feedbackItems.filter((f) => f.status === 'resolved').length,
    [feedbackItems]
  )

  const tabOptions = useMemo(() => {
    const tabs: Array<{ value: string; label: string }> = []
    if (showAnalytics) {
      tabs.push({ value: 'overview', label: t('tabs.overview') })
      tabs.push({ value: 'geo', label: t('tabs.geo') })
    }
    tabs.push({
      value: 'accounts',
      label: t('tabs.accounts', { count: users.length || stats?.accounts.total || '…' }),
    })
    if (showBansTab) {
      tabs.push({ value: 'bans', label: t('tabs.bans', { count: bans.length }) })
    }
    if (canEditAccounts) {
      tabs.push({ value: 'moderation', label: t('tabs.moderation') })
    }
    if (showFeedbackTab) {
      tabs.push({ value: 'feedback', label: t('tabs.feedback', { count: activeFeedbackTotal }) })
      tabs.push({
        value: 'feedback-resolved',
        label: t('tabs.feedbackResolved', { count: resolvedFeedbackTotal }),
      })
    }
    return tabs
  }, [
    showAnalytics,
    showBansTab,
    canEditAccounts,
    showFeedbackTab,
    users.length,
    stats?.accounts.total,
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

  const loadAll = useCallback(async (silent = false) => {
    if (!userId || !userRole) return
    if (!silent) {
      setBusy(true)
      setError(null)
    }
    try {
      const analytics = canViewSupervisionAnalytics(userRole)
      const bansAllowed = canViewSupervisionBans(userRole)
      const feedbackAllowed = canViewUserFeedback(userRole)

      const usersRes = await fetch('/api/admin/users', { credentials: 'include' })
      if (usersRes.status === 403) {
        router.replace('/compte')
        return
      }
      if (!usersRes.ok) throw new Error(tRef.current('apiErrors.loadAccounts'))

      const usersData = await usersRes.json()
      setUsers(usersData.users ?? [])
      setEditingNames(
        Object.fromEntries(
          (usersData.users as AdminUser[]).map((u) => [u.id, u.displayName])
        )
      )

      if (analytics) {
        const statsRes = await fetch('/api/admin/stats', { credentials: 'include' })
        if (statsRes.ok) {
          setStats(await statsRes.json())
        } else {
          setStats(null)
        }
      } else {
        setStats(null)
      }

      if (bansAllowed) {
        const bansRes = await fetch('/api/admin/bans', { credentials: 'include' })
        if (bansRes.ok) {
          const bansData = await bansRes.json()
          setBans(bansData.bans ?? [])
        } else {
          setBans([])
        }
      } else {
        setBans([])
      }

      if (feedbackAllowed) {
        const feedbackRes = await fetch('/api/admin/feedback', { credentials: 'include' })
        if (feedbackRes.ok) {
          const feedbackData = await feedbackRes.json()
          setFeedbackItems(feedbackData.feedback ?? [])
        } else {
          setFeedbackItems([])
        }
      } else {
        setFeedbackItems([])
      }
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : tErrorsRef.current('generic'))
      }
    } finally {
      if (!silent) setBusy(false)
    }
  }, [router, userId, userRole])

  const loadUserHistory = useCallback(async (userIdToLoad: string) => {
    setHistoryLoading(true)
    setHistoryDetail(null)
    try {
      const res = await fetch(`/api/admin/users/${userIdToLoad}`, { credentials: 'include' })
      if (!res.ok) throw new Error(tRef.current('apiErrors.historyUnavailable'))
      const data = await res.json()
      setHistoryDetail(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrorsRef.current('generic'))
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

  useEffect(() => {
    if (loading || !userId || !userRole || !canAccessSupervision(userRole)) return
    void loadAll()
    const id = window.setInterval(() => void loadAll(true), 15_000)
    return () => window.clearInterval(id)
  }, [loading, userId, userRole, loadAll])

  const handleIpClick = useCallback(async (ip: string) => {
    setAccountSearch(ip)
    setActiveTab('accounts')
    setIpLookupLoading(true)
    setIpLookup(null)
    try {
      const res = await fetch(`/api/admin/ip-lookup?ip=${encodeURIComponent(ip)}`, {
        credentials: 'include',
      })
      if (res.ok) setIpLookup(await res.json())
    } catch {
      /* ignore */
    } finally {
      setIpLookupLoading(false)
    }
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
      if (!res.ok) throw new Error(data.error ?? t('apiErrors.modifyDenied'))
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)))
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
    } catch (e) {
      setError(e instanceof Error ? e.message : tErrors('generic'))
    } finally {
      setBusy(false)
    }
  }

  if (loading || !user || !canAccessSupervision(user.role)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-white/60">
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <div className="mx-auto max-w-6xl space-y-4 px-3 pb-24 pt-3 sm:space-y-6 sm:px-6 sm:pb-16 sm:pt-6">
      {/* En-tête mobile : pas de titre dupliqué (déjà dans la navbar) */}
      <div className="md:hidden">
        <p className="break-words text-sm leading-relaxed text-white/50">{subtitle}</p>
      </div>

      {/* En-tête desktop */}
      <div className="hidden md:block">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Shield className="h-6 w-6 shrink-0 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <RoleBadge role={user.role} compact />
        </div>
        <p className="max-w-2xl break-words text-sm leading-relaxed text-white/50">{subtitle}</p>
      </div>

      <Alert className="border-amber-500/25 bg-amber-500/5 p-3 sm:p-4">
        <button
          type="button"
          className="flex w-full min-w-0 items-center justify-between gap-2 text-left"
          onClick={() => setRolesHelpOpen((open) => !open)}
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <AlertTitle className="text-sm leading-snug text-amber-100 sm:text-base">{t('rolesHelpTitle')}</AlertTitle>
          </div>
          {rolesHelpOpen ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-amber-300" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-amber-300" />
          )}
        </button>
        {rolesHelpOpen && (
          <AlertDescription className="mt-2 space-y-2 text-sm leading-relaxed text-white/70">
            <p>
              <strong className="text-yellow-200">{t('roles.fondateur')}</strong> — {ROLE_DESCRIPTIONS.fondateur}
            </p>
            <p>
              <strong className="text-rose-200">{t('roles.superadmin')}</strong> — {ROLE_DESCRIPTIONS.superadmin}
            </p>
            <p>
              <strong className="text-amber-200">{t('roles.admin')}</strong> — {ROLE_DESCRIPTIONS.admin}
            </p>
            <p>
              <strong className="text-violet-200">{t('roles.moderator')}</strong> — {ROLE_DESCRIPTIONS.moderator}
            </p>
            <p>
              <strong className="text-white/80">{t('roles.user')}</strong> — {ROLE_DESCRIPTIONS.user}
            </p>
            <p className="text-xs text-white/40">
              {t('rolesHierarchy')}
            </p>
          </AlertDescription>
        )}
      </Alert>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 space-y-4">
        <div className="md:hidden">
          <label htmlFor="supervision-tab-select" className="mb-1.5 block text-xs font-medium text-white/45">
            {t('tabs.section')}
          </label>
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger id="supervision-tab-select" className="h-11 w-full border-white/10 bg-white/[0.04]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tabOptions.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsList className="hidden h-auto w-full flex-wrap justify-start gap-1 bg-white/5 p-1 md:flex">
          {tabOptions.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-3 py-1.5 text-sm">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {showAnalytics && (
        <>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard
              label={t('stats.onlineNow')}
              value={stats?.visitors.onlineNow ?? 0}
              hint={t('stats.onlineNowHint')}
              icon={Activity}
            />
            <StatCard
              label={t('stats.today')}
              value={stats?.visitors.today ?? 0}
              hint={t('stats.todayHint')}
              icon={Calendar}
            />
            <StatCard
              label={t('stats.week')}
              value={stats?.visitors.week ?? 0}
              hint={t('stats.weekHint')}
              icon={CalendarDays}
            />
            <StatCard
              label={t('stats.month')}
              value={stats?.visitors.month ?? 0}
              hint={t('stats.monthHint')}
              icon={CalendarRange}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="flex items-center gap-2 text-base text-white sm:text-lg">
                  <Users className="h-5 w-5 shrink-0 text-amber-400" />
                  {t('accounts.registered')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 sm:gap-3 lg:grid-cols-5 p-4 pt-0 sm:p-6">
                <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 sm:p-3">
                  <p className="text-xl font-bold text-white sm:text-2xl">{stats?.accounts.total ?? 0}</p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.total')}</p>
                </div>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2.5 sm:p-3">
                  <p className="text-xl font-bold text-violet-200 sm:text-2xl">
                    {stats?.accounts.byRole.moderator ?? 0}
                  </p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.moderators')}</p>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 sm:p-3">
                  <p className="text-xl font-bold text-amber-200 sm:text-2xl">
                    {stats?.accounts.byRole.admin ?? 0}
                  </p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.admins')}</p>
                </div>
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5 sm:p-3">
                  <p className="text-xl font-bold text-rose-200 sm:text-2xl">
                    {stats?.accounts.byRole.superadmin ?? 0}
                  </p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.superAdmins')}</p>
                </div>
                <div className="col-span-2 rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-2.5 sm:col-span-1 sm:p-3">
                  <p className="text-xl font-bold text-yellow-200 sm:text-2xl">
                    {stats?.accounts.byRole.fondateur ?? 0}
                  </p>
                  <p className="text-[11px] text-white/45 sm:text-xs">{t('accounts.founders')}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base text-white sm:text-lg">{t('bans.activeTitle')}</CardTitle>
                <CardDescription className="leading-relaxed">{t('bans.suspendedCount', { count: bans.length })}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6">
                {bans.length === 0 ? (
                  <p className="text-sm text-white/45">{t('bans.noneOverview')}</p>
                ) : (
                  <ul className="space-y-2">
                    {bans.slice(0, 5).map((b) => (
                      <li key={b.id} className="text-sm text-white/70">
                        <span className="font-medium text-white">{b.displayName}</span>
                        {b.accountCode && (
                          <span className="font-mono text-amber-200/70"> {b.accountCode}</span>
                        )}
                        {' — '}
                        {b.banType === 'permanent'
                          ? t('bans.permanent').toLowerCase()
                          : t('bans.until', {
                              date: b.bannedUntil
                                ? format.dateTime(new Date(b.bannedUntil), { dateStyle: 'medium' })
                                : '?',
                            })}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base text-white sm:text-lg">
                <Globe className="h-5 w-5 shrink-0 text-amber-400" />
                {t('connected.recentTitle')}
              </CardTitle>
              <CardDescription className="leading-relaxed">
                {t('connected.recentDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6">
              {(stats?.connectedAccounts ?? []).length === 0 ? (
                <p className="text-sm text-white/45">{t('connected.noneRecent')}</p>
              ) : (
                <ul className="space-y-2">
                  {stats?.connectedAccounts.map((acc) => (
                    <li
                      key={acc.id}
                      className="space-y-2.5 rounded-xl border border-white/10 bg-black/20 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                        <span className="text-base leading-none">{countryFlag(acc.country)}</span>
                        <span className="text-sm font-medium text-white sm:text-base">{acc.displayName}</span>
                        <AccountCodeBadge code={acc.accountCode} />
                        <RoleBadge role={acc.role} compact />
                        {acc.online && (
                          <Badge className="border-green-500/30 bg-green-500/10 text-[10px] text-green-300 sm:text-xs">
                            {t('accounts.online')}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1.5 border-t border-white/5 pt-2 text-xs text-white/45">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <IpAddressDisplay
                            ips={
                              acc.ips && acc.ips.length > 0
                                ? acc.ips
                                : acc.ip
                                  ? [{ ip: acc.ip, country: acc.country, lastSeenAt: acc.lastSeenAt ?? '' }]
                                  : []
                            }
                            onIpClick={handleIpClick}
                            compact
                            device={acc.lastDevice}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>{countryLabel(acc.country, locale, t('unknownCountry'))}</span>
                          {acc.lastSeenAt && (
                            <span>
                              · {format.dateTime(new Date(acc.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base text-white sm:text-lg">
                <Gamepad2 className="h-5 w-5 shrink-0 text-amber-400" />
                {t('games.playedTitle')}
              </CardTitle>
              <CardDescription className="leading-relaxed">
                {t('games.playedDesc')}
                {stats?.games?.totalParties != null && (
                  <>
                    {t('games.totalParties', {
                      count: stats.games.totalParties,
                      plural: stats.games.totalParties > 1 ? 's' : '',
                    })}
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6">
              {(stats?.games?.games ?? []).length === 0 ? (
                <p className="text-sm text-white/45">{t('games.noneRecorded')}</p>
              ) : (
                <ul className="space-y-2">
                  {stats?.games?.games.map((game) => (
                    <li
                      key={game.gameId}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
                    >
                      <span className="flex items-center gap-2.5 text-sm text-white">
                        <span className="text-lg">{game.emoji}</span>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="geo" className="grid gap-4 md:grid-cols-2">
          <CountryList
            title={t('geo.onlineByCountry')}
            description={t('geo.onlineByCountryDesc')}
            rows={stats?.visitors.onlineByCountry ?? []}
            onCountryClick={handleCountryClick}
          />
          <CountryList
            title={t('geo.todayByCountry')}
            description={t('geo.todayByCountryDesc')}
            rows={stats?.visitors.visitorsTodayByCountry ?? []}
            onCountryClick={handleCountryClick}
          />
          <IpVisitorList rows={stats?.visitorIpList ?? []} onIpClick={handleIpClick} />
        </TabsContent>
        </>
        )}

        <TabsContent value="accounts">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-white">{t('accounts.adminTitle')}</CardTitle>
              <CardDescription>
                {t('accounts.adminDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input
                  className="bg-black/30 pl-9"
                  placeholder={t('accounts.searchPlaceholder')}
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 shrink-0 text-white/35" />
                  <span className="text-xs text-white/45 sm:hidden">{t('accounts.rolePlaceholder')}</span>
                </div>
                <Select value={accountFilterRole} onValueChange={setAccountFilterRole}>
                  <SelectTrigger className="w-full bg-black/30 sm:w-[150px]">
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
                  <SelectTrigger className="w-full bg-black/30 sm:w-[150px]">
                    <SelectValue placeholder={t('accounts.statusPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('accounts.allStatus')}</SelectItem>
                    <SelectItem value="online">{t('accounts.online')}</SelectItem>
                    <SelectItem value="banned">{t('accounts.banned')}</SelectItem>
                  </SelectContent>
                </Select>
                {(accountSearch || accountFilterRole !== 'all' || accountFilterStatus !== 'all') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white/50"
                    onClick={() => {
                      setAccountSearch('')
                      setAccountFilterRole('all')
                      setAccountFilterStatus('all')
                      setIpLookup(null)
                    }}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    {t('accounts.resetFilters')}
                  </Button>
                )}
              </div>

              {(accountSearch.trim() || accountFilterRole !== 'all' || accountFilterStatus !== 'all') && (
                <p className="text-xs text-white/45">
                  {t('accounts.results', {
                    count: filteredUsers.length,
                    plural: filteredUsers.length > 1 ? 's' : '',
                    total: users.length,
                  })}
                </p>
              )}

              {ipLookupLoading && (
                <p className="text-sm text-white/45">{t('accounts.ipAnalyzing')}</p>
              )}

              {ipLookup && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
                  <p className="font-medium text-amber-100">
                    {t('accounts.ipSummary', {
                      ip: ipLookup.ip,
                      accounts: ipLookup.accounts.length,
                      accountsPlural: ipLookup.accounts.length > 1 ? 's' : '',
                      visitors: ipLookup.visitors.length,
                      visitorsPlural: ipLookup.visitors.length > 1 ? 's' : '',
                    })}
                  </p>
                  {ipLookup.accounts.length > 0 && (
                    <ul className="mt-2 space-y-1 text-white/70">
                      {ipLookup.accounts.map((acc) => (
                        <li key={acc.id}>
                          {acc.displayName}
                          {acc.accountCode && (
                            <span className="font-mono text-amber-200/70"> {acc.accountCode}</span>
                          )}
                          {acc.online && <span className="text-green-300"> · {t('accounts.online').toLowerCase()}</span>}
                          {acc.banned && <span className="text-red-300"> · {t('accounts.banned').toLowerCase()}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {filteredUsers.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/45">
                  {t('accounts.noMatch')}
                </p>
              ) : (
              filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {canEditAccounts && canModifyTarget(user!.role, u.role) ? (
                          <Input
                            className="w-full max-w-full bg-black/30 sm:max-w-[200px]"
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
                        ) : (
                          <span className="font-medium text-white">{u.displayName}</span>
                        )}
                        <AccountCodeBadge code={u.accountCode} />
                        <RoleBadge role={u.role} compact />
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
                      </div>
                      <p className="truncate text-xs text-white/45">{u.email}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/30">
                        <span>
                          {t('accounts.registeredOn', {
                            date: format.dateTime(new Date(u.createdAt), { dateStyle: 'medium' }),
                          })}
                        </span>
                        {u.lastCountry && (
                          <span>
                            · {countryFlag(u.lastCountry)} {countryLabel(u.lastCountry, locale, t('unknownCountry'))}
                          </span>
                        )}
                        {u.lastIp || (u.ips && u.ips.length > 0) ? (
                          <span className="inline-flex items-center gap-1">
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
                        canModifyTarget(user.role, u.role) && (
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
                      )}
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
                              setUnbanDialog({ userId: u.id, displayName: u.displayName })
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
                              onClick={() =>
                                setBanDialog({
                                  userId: u.id,
                                  displayName: u.displayName,
                                  type: 'temporary',
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
                </div>
              )))}
            </CardContent>
          </Card>
        </TabsContent>

        {showBansTab && (
        <TabsContent value="bans">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Ban className="h-5 w-5 text-red-400" />
                {t('bans.currentTitle')}
              </CardTitle>
              <CardDescription>
                {t('bans.currentDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bans.length === 0 ? (
                <p className="text-sm text-white/50">{t('bans.noneActive')}</p>
              ) : (
                bans.map((b) => (
                  <div
                    key={b.id}
                    className="rounded-xl border border-red-500/20 bg-red-500/5 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 font-medium text-white">
                          {b.displayName}
                          <AccountCodeBadge code={b.accountCode} />
                        </p>
                        <p className="text-xs text-white/45">{b.email}</p>
                      </div>
                      <Badge className="border-red-500/30 bg-red-500/15 text-red-200">
                        {b.banType === 'permanent' ? t('bans.permanent') : t('bans.temporary')}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-white/60">
                      {b.bannedAt && (
                        <p>{t('bans.bannedOn', { date: format.dateTime(new Date(b.bannedAt), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
                      )}
                      {b.banType === 'temporary' && b.bannedUntil && (
                        <p>{t('bans.expiresOn', { date: format.dateTime(new Date(b.bannedUntil), { dateStyle: 'medium', timeStyle: 'short' }) })}</p>
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
                          setUnbanDialog({ userId: b.id, displayName: b.displayName })
                        }
                      >
                        {t('bans.unban')}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {canEditAccounts && (
        <TabsContent value="moderation" className="space-y-4">
          <ModerationTermsPanel />
          <NameModerationAttemptsPanel />
        </TabsContent>
        )}

        {showFeedbackTab && (
        <TabsContent value="feedback" className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MessageSquarePlus className="h-5 w-5 text-violet-400" />
                {t('feedback.activeTitle')}
              </CardTitle>
              <CardDescription>{t('feedback.activeDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeedbackSearchBar
                value={feedbackSearch}
                onChange={setFeedbackSearch}
                placeholder={t('feedback.searchActive')}
                resultCount={activeFeedbackItems.length}
                totalCount={activeFeedbackTotal}
              />
              <FeedbackListSection
                items={activeFeedbackItems}
                emptyMessage={
                  feedbackSearch.trim()
                    ? t('feedback.noActiveSearch')
                    : t('feedback.noActive')
                }
                onSelect={setSelectedFeedback}
              />
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {showFeedbackTab && (
        <TabsContent value="feedback-resolved" className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MessageSquarePlus className="h-5 w-5 text-emerald-400" />
                {t('feedback.resolvedTitle')}
              </CardTitle>
              <CardDescription>{t('feedback.resolvedDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeedbackSearchBar
                value={feedbackSearch}
                onChange={setFeedbackSearch}
                placeholder={t('feedback.searchResolved')}
                resultCount={resolvedFeedbackItems.length}
                totalCount={resolvedFeedbackTotal}
              />
              <FeedbackListSection
                items={resolvedFeedbackItems}
                emptyMessage={
                  feedbackSearch.trim()
                    ? t('feedback.noResolvedSearch')
                    : t('feedback.noResolved')
                }
                onSelect={setSelectedFeedback}
              />
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent className="border-red-500/30 bg-[#0c0b12] text-white">
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
        <DialogContent className="border-white/10 bg-[#0c0b12] text-white">
          <DialogHeader>
            <DialogTitle>{t('dialogs.unbanTitle')}</DialogTitle>
            <DialogDescription className="text-white/50">
              {t('dialogs.unbanAccountLabel')}{' '}
              <strong className="text-white">{unbanDialog?.displayName}</strong>
            </DialogDescription>
          </DialogHeader>
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
        <DialogContent className="border-white/10 bg-[#0c0b12] text-white">
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

      <Dialog
        open={!!historyUserId}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryUserId(null)
            setHistoryDetail(null)
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#0c0b12] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('history.title')}</DialogTitle>
            <DialogDescription asChild className="text-white/50">
              <div className="flex flex-wrap items-center gap-2">
                {historyDetail ? (
                  <>
                    {historyDetail.user.displayName}
                    <AccountCodeBadge code={historyDetail.user.accountCode} />
                  </>
                ) : (
                  <span>{t('loading')}</span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {historyLoading || !historyDetail ? (
            <p className="py-8 text-center text-white/50">{t('loading')}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">{t('geo.localPlayersLabel')}</p>
                  <p className="text-xl font-bold">{historyDetail.user.localPlayerCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">{t('history.partiesStats')}</p>
                  <p className="text-xl font-bold">{historyDetail.user.statsCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">{t('history.achievements')}</p>
                  <p className="text-xl font-bold">{historyDetail.user.achievementsCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">{t('history.sessions')}</p>
                  <p className="text-xl font-bold">{historyDetail.user.sessionsCount}</p>
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

              <div className="text-sm text-white/60">
                <p>{t('history.mode', { mode: historyDetail.user.playMode })}</p>
                <p>{t('history.country', { country: countryLabel(historyDetail.user.lastCountry, locale, t('unknownCountry')) })}</p>
                {historyDetail.user.lastIp && (
                  <p className="flex flex-wrap items-center gap-2">
                    {t('history.ip')}{' '}
                    <span className="font-mono text-amber-200/80">{historyDetail.user.lastIp}</span>
                    <DeviceBadge device={historyDetail.user.lastDevice} compact />
                  </p>
                )}
                {historyDetail.user.lastSeenAt && (
                  <p>
                    {t('history.lastActivity', {
                      date: format.dateTime(new Date(historyDetail.user.lastSeenAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
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
        <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0c0b12] text-white sm:max-w-lg">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{selectedFeedback.typeLabel}</DialogTitle>
                  <Badge variant="secondary">{selectedFeedback.statusLabel}</Badge>
                </div>
                <DialogDescription className="text-white/50">
                  {selectedFeedback.authorName} ·{' '}
                  {format.dateTime(new Date(selectedFeedback.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="whitespace-pre-wrap text-sm text-white/80">{selectedFeedback.message}</p>
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
                {selectedFeedback.screenshots.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-white/50">{t('feedback.screenshotsTitle')}</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedFeedback.screenshots.map((src, i) => (
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
                {selectedFeedback.status === 'open' && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'read')}
                  >
                    {t('feedback.markRead')}
                  </Button>
                )}
                {selectedFeedback.status !== 'resolved' && (
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
        <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#0c0b12] text-white sm:max-w-lg">
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
            <div className="space-y-2">
              {countryVisitors.map((row) => {
                const ips =
                  row.ips.length > 0
                    ? row.ips
                    : row.primaryIp
                      ? [{ ip: row.primaryIp, country: row.country, lastSeenAt: row.lastSeenAt }]
                      : []
                return (
                  <div
                    key={row.subjectKey}
                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {row.displayName ? (
                        <>
                          <span className="font-medium text-white">{row.displayName}</span>
                          <AccountCodeBadge code={row.accountCode} />
                          {row.role && <RoleBadge role={row.role} />}
                        </>
                      ) : (
                        <span className="text-white/50">{t('geo.anonymousVisitor')}</span>
                      )}
                      {row.online && (
                        <Badge className="border-green-500/30 bg-green-500/10 text-green-300">
                          {t('accounts.online')}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2">
                      <IpAddressDisplay ips={ips} device={row.lastDevice} onIpClick={handleIpClick} compact />
                    </div>
                    <div className="mt-2">
                      <LocalPlayersSection row={row} />
                    </div>
                    {row.email && <p className="mt-1 text-xs text-white/45">{row.email}</p>}
                    <p className="mt-1 text-[10px] text-white/30">
                      {format.dateTime(new Date(row.lastSeenAt), { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                )
              })}
            </div>
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
      </div>
    </div>
  )
}
