"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  RefreshCw,
  Shield,
  ShieldCheck,
  UserX,
  Users,
  Gamepad2,
  Trash2,
  MessageSquarePlus,
} from 'lucide-react'
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

type CountryRow = { country: string | null; count: number }

type ConnectedAccount = {
  id: string
  displayName: string
  email: string | null
  accountCode: string | null
  country: string | null
  ip: string | null
  lastSeenAt: string | null
  role: string
  online: boolean
}

type VisitorIpRow = {
  visitorId: string
  userId: string | null
  ip: string | null
  country: string | null
  displayName: string | null
  email: string | null
  accountCode: string | null
  role: string | null
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-white/80">{label}</CardTitle>
        <Icon className="h-4 w-4 text-amber-400/80" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-white">{value}</div>
        <p className="mt-1 text-xs text-white/45">{hint}</p>
      </CardContent>
    </Card>
  )
}

function AccountCodeBadge({ code }: { code: string | null | undefined }) {
  if (!code) return null
  return (
    <Badge
      variant="outline"
      className="font-mono text-[11px] tracking-wide text-amber-200/90"
      title="Code compte unique"
    >
      {code}
    </Badge>
  )
}

function matchesAccountSearch(
  user: { displayName: string; email: string | null; accountCode: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const codeQ = q.replace(/^lp-/, '')
  if (user.displayName.toLowerCase().includes(q)) return true
  if (user.email?.toLowerCase().includes(q)) return true
  if (user.accountCode?.toLowerCase().includes(codeQ)) return true
  return false
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
              {new Date(item.createdAt).toLocaleString('fr-FR')}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-white">{item.authorName}</p>
          <p className="mt-1 text-sm text-white/60">{item.messagePreview}</p>
          {item.screenshots.length > 0 && (
            <p className="mt-1 text-xs text-white/35">
              {item.screenshots.length} capture{item.screenshots.length > 1 ? 's' : ''}
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
        <p className="text-xs text-white/45">
          {resultCount} résultat{resultCount > 1 ? 's' : ''} sur {totalCount}
        </p>
      )}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'fondateur') {
    return (
      <Badge className="border-yellow-400/50 bg-gradient-to-r from-amber-500/25 to-yellow-400/20 text-yellow-100">
        <Crown className="mr-1 h-3 w-3" />
        Fondateur
      </Badge>
    )
  }
  if (role === 'superadmin') {
    return (
      <Badge className="border-rose-500/40 bg-rose-500/15 text-rose-100">
        <Crown className="mr-1 h-3 w-3" />
        Super admin
      </Badge>
    )
  }
  if (role === 'admin') {
    return (
      <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-200">
        <Crown className="mr-1 h-3 w-3" />
        Admin
      </Badge>
    )
  }
  if (role === 'moderator') {
    return (
      <Badge className="border-violet-500/30 bg-violet-500/15 text-violet-200">
        <ShieldCheck className="mr-1 h-3 w-3" />
        Modérateur
      </Badge>
    )
  }
  return <Badge variant="secondary">Joueur</Badge>
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
  return (
    <div className={compact ? 'space-y-0.5 text-[11px] text-white/35' : 'space-y-1 text-sm text-white/60'}>
      <p>
        Dernière connexion :{' '}
        {lastLoginAt
          ? new Date(lastLoginAt).toLocaleString('fr-FR')
          : 'Jamais enregistrée'}
      </p>
      <p>
        Temps sur le site : {formatPresenceDuration(totalPresenceSeconds)}
        {!compact && (
          <span className="text-xs text-white/35"> (estimé via activité)</span>
        )}
      </p>
    </div>
  )
}

function actionLabel(action: string): string {
  switch (action) {
    case 'ban_permanent':
      return 'Bannissement permanent'
    case 'ban_temporary':
      return 'Bannissement temporaire'
    case 'unban':
      return 'Débannissement'
    default:
      return action
  }
}

function CountryList({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: CountryRow[]
}) {
  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Globe className="h-5 w-5 text-amber-400" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-white/45">Aucune donnée pour le moment.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.country ?? 'unknown'}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-white">
                  <span>{countryFlag(row.country)}</span>
                  {countryLabel(row.country)}
                  {row.country && row.country !== '??' && (
                    <span className="text-xs text-white/35">({row.country})</span>
                  )}
                </span>
                <Badge variant="secondary">{row.count}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function IpVisitorList({ rows }: { rows: VisitorIpRow[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      if (row.ip?.toLowerCase().includes(q)) return true
      if (row.displayName?.toLowerCase().includes(q)) return true
      if (row.email?.toLowerCase().includes(q)) return true
      if (row.accountCode?.toLowerCase().includes(q)) return true
      if (countryLabel(row.country).toLowerCase().includes(q)) return true
      if (row.country?.toLowerCase().includes(q)) return true
      return false
    })
  }, [rows, query])

  return (
    <Card className="border-white/10 bg-white/[0.03] md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Network className="h-5 w-5 text-amber-400" />
          Adresses IP et pays
        </CardTitle>
        <CardDescription>
          Dernières connexions détectées (200 visiteurs max). Le pays est déduit de l&apos;IP si l&apos;hébergeur ne le fournit pas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <Input
            className="bg-black/30 pl-9"
            placeholder="Filtrer par IP, pseudo, email ou pays…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-white/45">
            {rows.length === 0
              ? 'Aucune IP enregistrée pour le moment. Les données apparaîtront après la prochaine visite.'
              : 'Aucun résultat pour cette recherche.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-black/30 text-xs uppercase tracking-wider text-white/45">
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Pays</th>
                  <th className="px-3 py-2 font-medium">Joueur</th>
                  <th className="px-3 py-2 font-medium">Dernière activité</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.visitorId}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-amber-200/90">
                      {row.ip ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-white/80">
                      <span className="inline-flex items-center gap-1.5">
                        {countryFlag(row.country)}
                        {countryLabel(row.country)}
                        {row.country && row.country !== '??' && (
                          <span className="text-xs text-white/35">({row.country})</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.displayName ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-white">{row.displayName}</span>
                          <AccountCodeBadge code={row.accountCode} />
                          {row.role && <RoleBadge role={row.role} />}
                          {row.online && (
                            <Badge className="border-green-500/30 bg-green-500/10 text-green-300">
                              En ligne
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-white/40">Visiteur anonyme</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-white/45">
                      {new Date(row.lastSeenAt).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function SupervisionPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [bans, setBans] = useState<ActiveBan[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingNames, setEditingNames] = useState<Record<string, string>>({})
  const [accountSearch, setAccountSearch] = useState('')

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

  const filteredUsers = useMemo(() => {
    return users.filter((u) => matchesAccountSearch(u, accountSearch))
  }, [users, accountSearch])

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

  const loadAll = useCallback(async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const analytics = canViewSupervisionAnalytics(user.role)
      const bansAllowed = canViewSupervisionBans(user.role)
      const feedbackAllowed = canViewUserFeedback(user.role)

      const usersRes = await fetch('/api/admin/users', { credentials: 'include' })
      if (usersRes.status === 403) {
        router.replace('/compte')
        return
      }
      if (!usersRes.ok) throw new Error('Impossible de charger les comptes')

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
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }, [router, user])

  const loadUserHistory = useCallback(async (userId: string) => {
    setHistoryLoading(true)
    setHistoryDetail(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Historique indisponible')
      const data = await res.json()
      setHistoryDetail(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user || !canAccessSupervision(user.role)) {
      router.replace('/compte')
      return
    }
    loadAll()
  }, [user, loading, router, loadAll])

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
      if (!res.ok) throw new Error(data.error ?? 'Modification refusée')
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
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
      if (!res.ok) throw new Error(data.error ?? 'Bannissement refusé')
      setBanDialog(null)
      setBanComment('')
      setBanDays('7')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
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
      if (!res.ok) throw new Error(data.error ?? 'Suppression refusée')
      setDeleteDialog(null)
      if (historyUserId === deleteDialog.userId) {
        setHistoryUserId(null)
        setHistoryDetail(null)
      }
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const submitUnban = async (userId: string) => {
    const comment = window.prompt('Commentaire de débannissement (optionnel) :') ?? ''
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId, comment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Débannissement refusé')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
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
      if (!res.ok) throw new Error(data.error ?? 'Modification refusée')
      setFeedbackItems((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status,
                statusLabel: status === 'read' ? 'Lu' : 'Résolu',
              }
            : f
        )
      )
      setSelectedFeedback((prev) =>
        prev?.id === id
          ? { ...prev, status, statusLabel: status === 'read' ? 'Lu' : 'Résolu' }
          : prev
      )
      if (status === 'resolved') {
        setSelectedFeedback(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  if (loading || !user || !canAccessSupervision(user.role)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-white/60">
        Chargement…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-6 w-6 text-amber-400" />
            <h1 className="text-2xl font-bold text-white">Supervision</h1>
            <RoleBadge role={user.role} />
          </div>
          <p className="text-sm text-white/50">
            {showAnalytics
              ? 'Tableau de bord complet — stats, jeux, visiteurs et comptes.'
              : showBansTab
                ? 'Gestion des comptes et des bannissements.'
                : 'Consultation et modération des comptes joueurs.'}
          </p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={busy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      <Alert className="border-amber-500/25 bg-amber-500/5">
        <Info className="h-4 w-4 text-amber-400" />
        <AlertTitle className="text-amber-100">Rôles et permissions</AlertTitle>
        <AlertDescription className="mt-2 space-y-2 text-sm text-white/70">
          <p>
            <strong className="text-yellow-200">Fondateur</strong> — {ROLE_DESCRIPTIONS.fondateur}
          </p>
          <p>
            <strong className="text-rose-200">Super administrateur</strong> — {ROLE_DESCRIPTIONS.superadmin}
          </p>
          <p>
            <strong className="text-amber-200">Administrateur</strong> — {ROLE_DESCRIPTIONS.admin}
          </p>
          <p>
            <strong className="text-violet-200">Modérateur</strong> — {ROLE_DESCRIPTIONS.moderator}
          </p>
          <p>
            <strong className="text-white/80">Joueur</strong> — {ROLE_DESCRIPTIONS.user}
          </p>
          <p className="text-xs text-white/40">
            Hiérarchie : joueur &lt; modérateur &lt; admin &lt; super admin &lt; fondateur — seul un grade supérieur peut sanctionner ou modifier un compte (jamais un pair). Les modérateurs : ban temporaire uniquement.
          </p>
        </AlertDescription>
      </Alert>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap bg-white/5">
          {showAnalytics && (
            <>
              <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
              <TabsTrigger value="geo">Pays / IP</TabsTrigger>
            </>
          )}
          <TabsTrigger value="accounts">
            Comptes ({users.length || stats?.accounts.total || '…'})
          </TabsTrigger>
          {showBansTab && (
            <TabsTrigger value="bans">Bannis ({bans.length})</TabsTrigger>
          )}
          {showFeedbackTab && (
            <>
              <TabsTrigger value="feedback">
                Retours ({activeFeedbackTotal})
              </TabsTrigger>
              <TabsTrigger value="feedback-resolved">
                Résolus ({resolvedFeedbackTotal})
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {showAnalytics && (
        <>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="En ligne maintenant"
              value={stats?.visitors.onlineNow ?? 0}
              hint="Visiteurs actifs (5 dernières min.)"
              icon={Activity}
            />
            <StatCard
              label="Aujourd'hui"
              value={stats?.visitors.today ?? 0}
              hint="Visiteurs uniques (jour)"
              icon={Calendar}
            />
            <StatCard
              label="7 jours"
              value={stats?.visitors.week ?? 0}
              hint="Visiteurs uniques (semaine)"
              icon={CalendarDays}
            />
            <StatCard
              label="30 jours"
              value={stats?.visitors.month ?? 0}
              hint="Visiteurs uniques (mois)"
              icon={CalendarRange}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Users className="h-5 w-5 text-amber-400" />
                  Comptes enregistrés
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-5">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-2xl font-bold text-white">{stats?.accounts.total ?? 0}</p>
                  <p className="text-xs text-white/45">Total</p>
                </div>
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                  <p className="text-2xl font-bold text-violet-200">
                    {stats?.accounts.byRole.moderator ?? 0}
                  </p>
                  <p className="text-xs text-white/45">Modérateurs</p>
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-2xl font-bold text-amber-200">
                    {stats?.accounts.byRole.admin ?? 0}
                  </p>
                  <p className="text-xs text-white/45">Admins</p>
                </div>
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                  <p className="text-2xl font-bold text-rose-200">
                    {stats?.accounts.byRole.superadmin ?? 0}
                  </p>
                  <p className="text-xs text-white/45">Super admins</p>
                </div>
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <p className="text-2xl font-bold text-yellow-200">
                    {stats?.accounts.byRole.fondateur ?? 0}
                  </p>
                  <p className="text-xs text-white/45">Fondateurs</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-white">Bannissements actifs</CardTitle>
                <CardDescription>{bans.length} compte(s) suspendu(s)</CardDescription>
              </CardHeader>
              <CardContent>
                {bans.length === 0 ? (
                  <p className="text-sm text-white/45">Aucun bannissement en cours.</p>
                ) : (
                  <ul className="space-y-2">
                    {bans.slice(0, 5).map((b) => (
                      <li key={b.id} className="text-sm text-white/70">
                        <span className="font-medium text-white">{b.displayName}</span>
                        {b.accountCode && (
                          <span className="font-mono text-amber-200/70"> {b.accountCode}</span>
                        )}
                        {' — '}
                        {b.banType === 'permanent' ? 'permanent' : `jusqu'au ${b.bannedUntil ? new Date(b.bannedUntil).toLocaleDateString('fr-FR') : '?'}`}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Globe className="h-5 w-5 text-amber-400" />
                Comptes connectés récemment
              </CardTitle>
              <CardDescription>
                Joueurs identifiés avec leur IP et pays
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(stats?.connectedAccounts ?? []).length === 0 ? (
                <p className="text-sm text-white/45">Aucun compte connecté récemment.</p>
              ) : (
                <ul className="space-y-2">
                  {stats?.connectedAccounts.map((acc) => (
                    <li
                      key={acc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span>{countryFlag(acc.country)}</span>
                        <span className="font-medium text-white">{acc.displayName}</span>
                        <AccountCodeBadge code={acc.accountCode} />
                        <RoleBadge role={acc.role} />
                        {acc.online && (
                          <Badge className="border-green-500/30 bg-green-500/10 text-green-300">
                            En ligne
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-white/45">
                        {acc.ip && (
                          <span className="font-mono text-amber-200/70">{acc.ip}</span>
                        )}
                        {acc.ip && acc.country && <> · </>}
                        {countryLabel(acc.country)}
                        {acc.lastSeenAt && (
                          <> · {new Date(acc.lastSeenAt).toLocaleString('fr-FR')}</>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Gamepad2 className="h-5 w-5 text-amber-400" />
                Parties jouées par jeu
              </CardTitle>
              <CardDescription>
                Agrégat cloud des comptes synchronisés
                {stats?.games?.totalParties != null && (
                  <> — {stats.games.totalParties} partie{stats.games.totalParties > 1 ? 's' : ''} au total</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(stats?.games?.games ?? []).length === 0 ? (
                <p className="text-sm text-white/45">Aucune partie enregistrée pour le moment.</p>
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
                        {game.partiesPlayed} partie{game.partiesPlayed > 1 ? 's' : ''}
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
            title="En ligne par pays"
            description="Visiteurs actifs ces 5 dernières minutes"
            rows={stats?.visitors.onlineByCountry ?? []}
          />
          <CountryList
            title="Connectés aujourd'hui par pays"
            description="Visiteurs ayant été actifs dans les dernières 24 h"
            rows={stats?.visitors.visitorsTodayByCountry ?? []}
          />
          <IpVisitorList rows={stats?.visitorIpList ?? []} />
        </TabsContent>
        </>
        )}

        <TabsContent value="accounts">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-white">Administration des comptes</CardTitle>
              <CardDescription>
                Recherche par pseudo, email ou code unique (ex. LP-ABC123).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <Input
                  className="bg-black/30 pl-9"
                  placeholder="Rechercher un compte…"
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                />
              </div>
              {accountSearch.trim() && (
                <p className="text-xs text-white/45">
                  {filteredUsers.length} résultat{filteredUsers.length > 1 ? 's' : ''} sur {users.length}
                </p>
              )}
              {filteredUsers.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/45">
                  Aucun compte ne correspond à cette recherche.
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
                            className="max-w-[200px] bg-black/30"
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
                        <RoleBadge role={u.role} />
                        {u.ban.banned && (
                          <Badge className="border-red-500/30 bg-red-500/15 text-red-200">
                            <Ban className="mr-1 h-3 w-3" />
                            Banni
                          </Badge>
                        )}
                        {u.id === user.id && (
                          <Badge variant="outline" className="text-xs">
                            Toi
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-white/45">{u.email}</p>
                      <p className="flex flex-wrap items-center gap-2 text-[11px] text-white/30">
                        <span>Inscrit le {new Date(u.createdAt).toLocaleDateString('fr-FR')}</span>
                        {u.lastCountry && (
                          <span>
                            · {countryFlag(u.lastCountry)} {countryLabel(u.lastCountry)}
                          </span>
                        )}
                        {u.lastIp && (
                          <span className="font-mono text-amber-200/60">· {u.lastIp}</span>
                        )}
                        {u.lastSeenAt && (
                          <span>· Vu le {new Date(u.lastSeenAt).toLocaleString('fr-FR')}</span>
                        )}
                      </p>
                      {showAccountActivity && (
                        <UserActivityLines
                          compact
                          lastLoginAt={u.lastLoginAt}
                          totalPresenceSeconds={u.totalPresenceSeconds}
                        />
                      )}
                      {u.ban.banned && u.ban.banComment && (
                        <p className="text-xs text-red-300/80">Motif : {u.ban.banComment}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setHistoryUserId(u.id)}
                      >
                        <History className="mr-1 h-3.5 w-3.5" />
                        Historique
                      </Button>

                      {canAssignRoles(user.role) &&
                        u.id !== user.id &&
                        canModifyTarget(user.role, u.role) && (
                        <Select
                          value={u.role}
                          onValueChange={(role) => updateUser(u.id, { role })}
                          disabled={busy}
                        >
                          <SelectTrigger className="w-[180px] bg-black/30">
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
                            onClick={() => submitUnban(u.id)}
                          >
                            Lever le ban
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
                              Ban permanent
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
                              Ban temporaire
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
                          Supprimer le compte
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
                Bannissements en cours
              </CardTitle>
              <CardDescription>
                Comptes suspendus (permanent ou temporaire non expiré)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bans.length === 0 ? (
                <p className="text-sm text-white/50">Aucun bannissement actif.</p>
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
                        {b.banType === 'permanent' ? 'Permanent' : 'Temporaire'}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-sm text-white/60">
                      {b.bannedAt && (
                        <p>Banni le {new Date(b.bannedAt).toLocaleString('fr-FR')}</p>
                      )}
                      {b.banType === 'temporary' && b.bannedUntil && (
                        <p>Expire le {new Date(b.bannedUntil).toLocaleString('fr-FR')}</p>
                      )}
                      {b.bannedByName && <p>Par : {b.bannedByName}</p>}
                      {b.banComment && (
                        <p className="text-red-200/80">Commentaire : {b.banComment}</p>
                      )}
                    </div>
                    {canTemporaryBanTarget(user.role, b.role) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        disabled={busy}
                        onClick={() => submitUnban(b.id)}
                      >
                        Débannir
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {showFeedbackTab && (
        <TabsContent value="feedback" className="space-y-4">
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <MessageSquarePlus className="h-5 w-5 text-violet-400" />
                Retours en cours
              </CardTitle>
              <CardDescription>
                Bugs, suggestions et commentaires à traiter. Une fois résolu, le retour passe dans l&apos;onglet Résolus.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeedbackSearchBar
                value={feedbackSearch}
                onChange={setFeedbackSearch}
                placeholder="Rechercher un bug, auteur, message…"
                resultCount={activeFeedbackItems.length}
                totalCount={activeFeedbackTotal}
              />
              <FeedbackListSection
                items={activeFeedbackItems}
                emptyMessage={
                  feedbackSearch.trim()
                    ? 'Aucun retour en cours ne correspond à votre recherche.'
                    : 'Aucun retour en cours.'
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
                Retours résolus
              </CardTitle>
              <CardDescription>
                Historique des retours marqués comme résolus.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeedbackSearchBar
                value={feedbackSearch}
                onChange={setFeedbackSearch}
                placeholder="Rechercher dans les retours résolus…"
                resultCount={resolvedFeedbackItems.length}
                totalCount={resolvedFeedbackTotal}
              />
              <FeedbackListSection
                items={resolvedFeedbackItems}
                emptyMessage={
                  feedbackSearch.trim()
                    ? 'Aucun retour résolu ne correspond à votre recherche.'
                    : 'Aucun retour résolu pour le moment.'
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
            <DialogTitle>Supprimer définitivement ce compte ?</DialogTitle>
            <DialogDescription className="text-white/50">
              Compte : <strong className="text-white">{deleteDialog?.displayName}</strong>
              <br />
              Cette action est irréversible : email, joueurs cloud, stats et sessions seront effacés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Annuler
            </Button>
            <Button variant="destructive" disabled={busy} onClick={deleteAccount}>
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!banDialog} onOpenChange={(open) => !open && setBanDialog(null)}>
        <DialogContent className="border-white/10 bg-[#0c0b12] text-white">
          <DialogHeader>
            <DialogTitle>
              {banDialog?.type === 'permanent' ? 'Bannissement permanent' : 'Bannissement temporaire'}
            </DialogTitle>
            <DialogDescription className="text-white/50">
              Compte : <strong className="text-white">{banDialog?.displayName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {banDialog?.type === 'temporary' && (
              <div>
                <label className="mb-1 block text-xs text-white/50">Durée (jours)</label>
                <Select value={banDays} onValueChange={setBanDays}>
                  <SelectTrigger className="bg-black/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 jour</SelectItem>
                    <SelectItem value="3">3 jours</SelectItem>
                    <SelectItem value="7">7 jours</SelectItem>
                    <SelectItem value="14">14 jours</SelectItem>
                    <SelectItem value="30">30 jours</SelectItem>
                    <SelectItem value="90">90 jours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-white/50">
                Commentaire / motif (visible en interne)
              </label>
              <textarea
                className="min-h-[80px] w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
                placeholder="Ex. : spam, comportement toxique…"
                value={banComment}
                onChange={(e) => setBanComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialog(null)}>
              Annuler
            </Button>
            <Button variant="destructive" disabled={busy} onClick={submitBan}>
              Confirmer le ban
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
            <DialogTitle>Historique du compte</DialogTitle>
            <DialogDescription className="text-white/50">
              {historyDetail ? (
                <span className="flex flex-wrap items-center gap-2">
                  {historyDetail.user.displayName}
                  <AccountCodeBadge code={historyDetail.user.accountCode} />
                </span>
              ) : (
                'Chargement…'
              )}
            </DialogDescription>
          </DialogHeader>
          {historyLoading || !historyDetail ? (
            <p className="py-8 text-center text-white/50">Chargement…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">Joueurs locaux</p>
                  <p className="text-xl font-bold">{historyDetail.user.localPlayerCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">Parties (stats)</p>
                  <p className="text-xl font-bold">{historyDetail.user.statsCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">Succès</p>
                  <p className="text-xl font-bold">{historyDetail.user.achievementsCount}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs text-white/45">Sessions</p>
                  <p className="text-xl font-bold">{historyDetail.user.sessionsCount}</p>
                </div>
              </div>

              {historyDetail.user.localPlayerNames.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/50">Noms des joueurs locaux</p>
                  <p className="text-sm text-white/80">
                    {historyDetail.user.localPlayerNames.join(', ')}
                  </p>
                </div>
              )}

              <div className="text-sm text-white/60">
                <p>Mode : {historyDetail.user.playMode}</p>
                <p>Pays : {countryLabel(historyDetail.user.lastCountry)}</p>
                {historyDetail.user.lastIp && (
                  <p>IP : <span className="font-mono text-amber-200/80">{historyDetail.user.lastIp}</span></p>
                )}
                {historyDetail.user.lastSeenAt && (
                  <p>Dernière activité : {new Date(historyDetail.user.lastSeenAt).toLocaleString('fr-FR')}</p>
                )}
              </div>

              {showAccountActivity && (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                    Activité du joueur
                  </p>
                  <UserActivityLines
                    lastLoginAt={historyDetail.user.lastLoginAt}
                    totalPresenceSeconds={historyDetail.user.totalPresenceSeconds}
                  />
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-white/50">Jeux joués</p>
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
                              {g.partiesPlayed} partie{g.partiesPlayed > 1 ? 's' : ''}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-white/45">Aucune partie enregistrée.</p>
                    )}
                  </div>
                </div>
              )}

              {historyDetail.user.ban.banned && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  Compte actuellement banni
                  {historyDetail.user.ban.banComment && (
                    <> — {historyDetail.user.ban.banComment}</>
                  )}
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                  Historique modération
                </p>
                {historyDetail.banHistory.length === 0 ? (
                  <p className="text-sm text-white/45">Aucun événement.</p>
                ) : (
                  <ul className="space-y-2">
                    {historyDetail.banHistory.map((ev) => (
                      <li
                        key={ev.id}
                        className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-white">{actionLabel(ev.action)}</p>
                        <p className="text-xs text-white/45">
                          {new Date(ev.createdAt).toLocaleString('fr-FR')} · par {ev.actorName}
                        </p>
                        {ev.comment && (
                          <p className="mt-1 text-white/70">{ev.comment}</p>
                        )}
                        {ev.bannedUntil && (
                          <p className="text-xs text-white/45">
                            Jusqu&apos;au {new Date(ev.bannedUntil).toLocaleString('fr-FR')}
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
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {selectedFeedback.typeLabel}
                  <Badge variant="secondary">{selectedFeedback.statusLabel}</Badge>
                </DialogTitle>
                <DialogDescription className="text-white/50">
                  {selectedFeedback.authorName} ·{' '}
                  {new Date(selectedFeedback.createdAt).toLocaleString('fr-FR')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="whitespace-pre-wrap text-sm text-white/80">{selectedFeedback.message}</p>
                {selectedFeedback.contactEmail && (
                  <p className="text-sm text-white/50">
                    Contact :{' '}
                    <a
                      href={`mailto:${selectedFeedback.contactEmail}`}
                      className="text-amber-300 hover:underline"
                    >
                      {selectedFeedback.contactEmail}
                    </a>
                  </p>
                )}
                {selectedFeedback.pageUrl && (
                  <p className="text-xs text-white/40">Page : {selectedFeedback.pageUrl}</p>
                )}
                {selectedFeedback.screenshots.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-white/50">Captures d&apos;écran</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedFeedback.screenshots.map((src, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLightboxImage(src)}
                          className="h-24 w-24 overflow-hidden rounded-lg border border-white/10"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`Capture ${i + 1}`} className="h-full w-full object-cover" />
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
                    Marquer lu
                  </Button>
                )}
                {selectedFeedback.status !== 'resolved' && (
                  <Button
                    disabled={busy}
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                    onClick={() => updateFeedbackStatus(selectedFeedback.id, 'resolved')}
                  >
                    Résolu
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!lightboxImage} onOpenChange={(open) => !open && setLightboxImage(null)}>
        <DialogContent className="max-w-4xl border-white/10 bg-black/95 p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Capture d&apos;écran agrandie</DialogTitle>
          </DialogHeader>
          {lightboxImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={lightboxImage} alt="Capture agrandie" className="max-h-[85vh] w-full object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
