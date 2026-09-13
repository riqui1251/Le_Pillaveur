'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  Gamepad2,
  Gavel,
  History,
  Inbox,
  Laptop,
  Lock,
  Monitor,
  Network,
  Smartphone,
  Tablet,
  Unplug,
  UserRound,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { Badge } from '@/components/ui/badge'
import { AccountKindBadge } from '@/components/supervision/AccountKindBadge'
import {
  DurationReliabilityBadge,
  DurationReliabilityLegend,
  tableDurationLabel,
} from '@/components/supervision/GameSessionsPanel'
import {
  EmptyState,
  ErrorState,
  SectionCard,
  SkeletonRows,
  SupervisionHeader,
  SupervisionShell,
} from '@/components/supervision/SupervisionLayout'
import { GameIconById } from '@/components/hub/GameIconById'
import { isGuestProbablyLost, isGuestPurgeOverdue } from '@/lib/account-kind'
import type { AccountActivity, AccountPlayTotals } from '@/lib/account-activity-server'
import type { AccountDescription } from '@/lib/account-kind-server'
import { countryFlag, countryLabel } from '@/lib/country-display'
import { formatPresenceDuration, type DurationUnits } from '@/lib/format-presence'
import { GAMES } from '@/lib/games'
import { PARIS_TIME_ZONE, parisDayOffset, parisDayString } from '@/lib/paris-time'
import { isOnline } from '@/lib/presence'
import { normalizeRole } from '@/lib/roles'
import { cn } from '@/lib/utils'

/**
 * FICHE COMPTE en pleine page (lot 4) — composant AUTONOME, sur le modèle de
 * GameSessionsPanel : ses routes, son état, rien de la page Supervision.
 *
 * Deux sources, chargées ensemble à l'ouverture et sur « Actualiser », jamais
 * en boucle :
 *  - GET /api/admin/users/[userId] — identité et modération, tout le staff ;
 *  - GET /api/admin/users/[userId]/activity — parties, séances, jeux, réseaux
 *    et navigateurs, admins et plus. Un 403 n'est pas une erreur : les blocs
 *    d'activité sont simplement remplacés par une mention.
 * Toute erreur s'affiche DANS la page (le dialogue Historique restait bloqué
 * sur « Chargement… »).
 *
 * Les durées sont des DURÉES DE TABLE (du lancement à la fin de la partie,
 * pour toute la table), jamais présentées comme le temps de jeu du joueur.
 * Toutes les dates sont à l'heure de Paris, quel que soit le fuseau du
 * navigateur.
 */

/**
 * Réponse de GET /api/admin/users/[userId], réduite aux champs lus ici. La
 * route construit sa réponse en ligne, sans type exporté : ce sous-ensemble
 * reprend ses noms à l'identique.
 */
type AccountDetail = {
  user: AccountDescription & {
    id: string
    displayName: string
    accountCode: string | null
    role: string
    lastSeenAt: string | null
    /** Null aussi quand le rôle du lecteur ne permet pas de la voir. */
    lastLoginAt: string | null
    /**
     * Cumul hérité (60 s par requête, onglets cachés compris) : surestimé,
     * jamais un temps de jeu. 0 aussi quand le rôle du lecteur ne le voit pas.
     */
    totalPresenceSeconds: number
    createdAt: string
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

/** Parties affichées dans le bloc « Dernières parties » (la route en sert 20). */
const RECENT_GAMES_SHOWN = 5

const ROLE_BADGE_STYLES: Record<ReturnType<typeof normalizeRole>, string> = {
  fondateur: 'border-yellow-400/50 bg-amber-500/20 text-yellow-100',
  superadmin: 'border-rose-500/40 bg-rose-500/15 text-rose-100',
  admin: 'border-amber-500/30 bg-amber-500/15 text-amber-200',
  moderator: 'border-chip-blue/50 bg-chip-blue/20 text-sky-200',
  user: 'border-white/15 bg-white/[0.06] text-white/70',
}

/** Formats partagés par tous les blocs : Paris, unités traduites. */
function useFileFormat() {
  const format = useFormatter()
  const tUnits = useTranslations('supervision.units')
  const units: DurationUnits = { s: tUnits('s'), min: tUnits('min'), h: tUnits('h'), d: tUnits('d') }
  return {
    units,
    dateTime: (iso: string) =>
      format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short', timeZone: PARIS_TIME_ZONE }),
    day: (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: PARIS_TIME_ZONE }),
    shortDay: (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'short', timeZone: PARIS_TIME_ZONE }),
  }
}

/** Titre traduit d'un jeu ; repli sur le catalogue puis sur l'identifiant. */
function useGameTitle() {
  const t = useTranslations('games.catalog')
  return (gameId: string): string => {
    const key = `${gameId}.title`
    return t.has(key) ? t(key) : (GAMES.find((g) => g.id === gameId)?.title ?? gameId)
  }
}

export function AccountFile({ userId }: { userId: string }) {
  const t = useTranslations('supervision.accountFile')
  const tSup = useTranslations('supervision')
  const [detail, setDetail] = useState<AccountDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [activity, setActivity] = useState<AccountActivity | null>(null)
  const [activityDenied, setActivityDenied] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(async () => {
    setLoading(true)
    setDetailError(null)
    setActivityError(null)
    const base = `/api/admin/users/${encodeURIComponent(userId)}`
    // Les deux requêtes partent ensemble ; allSettled : l'échec de l'une ne
    // prive pas l'exploitant de l'autre.
    const [detailResult, activityResult] = await Promise.allSettled([
      fetch(base, { credentials: 'include' }).then(async (res) => ({ status: res.status, data: await res.json() })),
      fetch(`${base}/activity`, { credentials: 'include' }).then(async (res) => ({
        status: res.status,
        data: await res.json(),
      })),
    ])

    if (detailResult.status === 'fulfilled' && detailResult.value.status === 200) {
      setDetail(detailResult.value.data as AccountDetail)
    } else {
      setDetail(null)
      const notFound = detailResult.status === 'fulfilled' && detailResult.value.status === 404
      setDetailError(tRef.current(notFound ? 'notFound' : 'loadError'))
    }

    if (activityResult.status === 'fulfilled' && activityResult.value.status === 403) {
      setActivityDenied(true)
      setActivity(null)
    } else if (activityResult.status === 'fulfilled' && activityResult.value.status === 200) {
      setActivityDenied(false)
      setActivity(activityResult.value.data as AccountActivity)
    } else {
      setActivityDenied(false)
      setActivity(null)
      setActivityError(tRef.current('activityLoadError'))
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const user = detail?.user ?? null

  return (
    <SupervisionShell>
      <Link
        href="/supervision?tab=accounts"
        className="inline-flex items-center gap-1.5 rounded-lg py-1 text-xs font-medium text-white/55 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('back')}
      </Link>

      <SupervisionHeader
        kicker={t('kicker')}
        // Échec du chargement : le sur-titre, jamais « Chargement… » figé
        // alors que plus rien ne charge.
        title={user?.displayName ?? (detailError ? t('kicker') : tSup('loading'))}
        roleBadge={user ? <HeaderChips user={user} /> : null}
        onlineLabel={user && isOnline(user.lastSeenAt) ? tSup('accounts.online') : undefined}
        onRefresh={() => void load()}
        refreshLabel={tSup('refresh')}
        refreshing={loading}
      />

      {detailError ? (
        <ErrorState
          icon={AlertTriangle}
          message={detailError}
          retryLabel={tSup('states.retry')}
          onRetry={() => void load()}
        />
      ) : !detail || !user ? (
        <SkeletonRows rows={4} />
      ) : (
        <>
          <IdentitySection user={user} />

          {activityDenied ? (
            <p className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-white/50">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
              <span className="min-w-0">{t('activityRestricted')}</span>
            </p>
          ) : activityError ? (
            <SectionCard icon={Clock} title={t('playTitle')}>
              <ErrorState
                icon={AlertTriangle}
                message={activityError}
                retryLabel={tSup('states.retry')}
                onRetry={() => void load()}
              />
            </SectionCard>
          ) : !activity ? (
            <SectionCard icon={Clock} title={t('playTitle')}>
              <SkeletonRows rows={3} />
            </SectionCard>
          ) : (
            <>
              <PlayTotalsSection activity={activity} />
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <SeancesSection activity={activity} />
                <RecentGamesSection activity={activity} userId={userId} />
              </div>
              <GamesSection activity={activity} />
              <NetworksSection activity={activity} />
            </>
          )}

          <ModerationSection detail={detail} />

          {/* Pied de fiche (jusqu'aux visites du lot 6) : l'ancien cumul, dit
              pour ce qu'il est — des onglets ouverts, pas du temps de jeu. */}
          {user.totalPresenceSeconds > 0 && <LegacyPresenceFooter seconds={user.totalPresenceSeconds} />}
        </>
      )}
    </SupervisionShell>
  )
}

/** Code LP, type de compte et rôle, sous le pseudo. */
function HeaderChips({ user }: { user: AccountDetail['user'] }) {
  const tSup = useTranslations('supervision')
  const role = normalizeRole(user.role)
  return (
    <>
      {user.accountCode && (
        <Badge
          variant="outline"
          className="font-mono text-[11px] tracking-wide text-amber-200/90"
          title={tSup('device.accountCodeTitle')}
        >
          {user.accountCode}
        </Badge>
      )}
      <AccountKindBadge
        kind={user.kind}
        lastSeenAt={user.lastSeenAt}
        createdAt={user.createdAt}
        sessionExpiresAt={user.sessionExpiresAt}
      />
      <Badge className={ROLE_BADGE_STYLES[role]}>{tSup(`roles.${role}`)}</Badge>
    </>
  )
}

/** Une donnée d'en-tête : libellé, valeur, précision facultative. */
function Fact({
  label,
  children,
  hint,
  tone = 'default',
}: {
  label: string
  children: ReactNode
  hint?: string
  tone?: 'default' | 'good' | 'warning' | 'muted'
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 break-words text-sm font-semibold',
          tone === 'good' && 'text-emerald-300',
          tone === 'warning' && 'text-amber-200',
          tone === 'muted' && 'text-white/60',
          tone === 'default' && 'text-white'
        )}
      >
        {children}
      </dd>
      {hint && <dd className="mt-1 text-[11px] leading-snug text-white/40">{hint}</dd>}
    </div>
  )
}

function IdentitySection({ user }: { user: AccountDetail['user'] }) {
  const t = useTranslations('supervision.accountFile')
  const tSup = useTranslations('supervision')
  const { dateTime, day } = useFileFormat()

  // Invité inactif depuis plus de GUEST_STALE_DAYS : la session existe en base,
  // rien ne prouve que son cookie aussi — jamais « Connexion active ».
  const guestLost = isGuestProbablyLost({
    kind: user.kind,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    sessionExpiresAt: user.sessionExpiresAt,
  })
  // Date de purge passée : le balayage (au fil du trafic) n'est pas encore
  // passé. On ne l'annonce pas au futur.
  const purgeOverdue = user.guestPurgeAt ? isGuestPurgeOverdue(user.guestPurgeAt) : false

  return (
    <SectionCard icon={UserRound} title={t('identityTitle')} bodyClassName="space-y-3">
      {/* Invité orphelin : personne ne peut rouvrir ce compte, on le dit en premier. */}
      {user.kind === 'guest_orphan' && (
        <p className="flex items-start gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-100">
          <Unplug className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
          <span className="min-w-0">
            {!user.guestPurgeAt
              ? tSup('history.orphanInaccessible')
              : purgeOverdue
                ? tSup('history.orphanPurgePending')
                : tSup('history.orphanPurge', { date: day(user.guestPurgeAt) })}
          </span>
        </p>
      )}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t('createdAt')}>{day(user.createdAt)}</Fact>
        <Fact label={t('lastActivity')} hint={t('lastActivityHint')} tone={user.lastSeenAt ? 'default' : 'muted'}>
          {user.lastSeenAt ? dateTime(user.lastSeenAt) : t('never')}
        </Fact>
        <Fact label={t('lastAuth')} hint={t('lastAuthHint')} tone={user.lastLoginAt ? 'default' : 'muted'}>
          {user.lastLoginAt ? dateTime(user.lastLoginAt) : tSup('activity.neverLoggedIn')}
        </Fact>
        {/* Le JOUR d'échéance seulement (servi ainsi) : l'heure redonnerait celle d'une visite. */}
        <Fact
          label={guestLost ? tSup('history.sessionInDb') : tSup('history.activeConnection')}
          tone={user.hasValidSession && user.sessionExpiresAt ? (guestLost ? 'warning' : 'good') : 'muted'}
        >
          {user.hasValidSession && user.sessionExpiresAt
            ? tSup(guestLost ? 'history.sessionMaybeLost' : 'history.until', { date: day(user.sessionExpiresAt) })
            : tSup('history.noValidSession')}
        </Fact>
        {user.kind === 'guest' && user.guestPurgeAt && (
          <Fact label={t('autoDelete')} tone="warning">
            {purgeOverdue ? t('autoDeletePending') : day(user.guestPurgeAt)}
          </Fact>
        )}
      </dl>
    </SectionCard>
  )
}

/** Petite statistique d'une tuile 7 j / 30 j. */
function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] leading-tight text-white/45">{label}</dt>
      <dd className="mt-0.5 break-words font-display text-xl font-bold tabular-nums text-white">{value}</dd>
    </div>
  )
}

function WindowTiles({ label, totals }: { label: string; totals: AccountPlayTotals }) {
  const t = useTranslations('supervision.accountFile')
  const { units } = useFileFormat()
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-gold/70">{label}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Stat label={t('gamesLaunched')} value={totals.games} />
        <Stat label={t('solo')} value={t('soloValue', { solo: totals.solo, games: totals.games })} />
        <Stat label={t('reliableTime')} value={formatPresenceDuration(totals.reliableSeconds, units)} />
        <Stat
          label={t('estimatedTime')}
          value={
            totals.estimatedSeconds > 0
              ? tableDurationLabel(totals.estimatedSeconds, 'estimated', units)
              : formatPresenceDuration(0, units)
          }
        />
      </dl>
    </div>
  )
}

function PlayTotalsSection({ activity }: { activity: AccountActivity }) {
  const t = useTranslations('supervision.accountFile')
  const tSessions = useTranslations('supervision.gameSessions')
  const format = useFormatter()
  const { shortDay } = useFileFormat()
  // Tant que le journal est plus jeune que la fenêtre, la tuile le dit : « 30
  // derniers jours » promettrait un mois de données qui n'existent pas.
  const sinceDate = format.dateTime(new Date(activity.journalSince), {
    day: '2-digit',
    month: '2-digit',
    timeZone: PARIS_TIME_ZONE,
  })
  const windowLabel = (label: string, days: number) =>
    parisDayOffset(days - 1) < activity.journalSince
      ? tSessions('windowSince', { window: label, date: sinceDate })
      : label
  return (
    <SectionCard
      icon={Clock}
      title={t('playTitle')}
      description={
        <>
          {t('playDesc')} {tSessions('journalSince', { date: shortDay(activity.journalSince) })}
        </>
      }
      bodyClassName="space-y-2"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <WindowTiles label={windowLabel(t('window7'), 7)} totals={activity.totals.d7} />
        <WindowTiles label={windowLabel(t('window30'), 30)} totals={activity.totals.d30} />
      </div>
      <p className="text-[11px] leading-snug text-white/40">{t('windowHint')}</p>
      <DurationReliabilityLegend />
    </SectionCard>
  )
}

function SeancesSection({ activity }: { activity: AccountActivity }) {
  const t = useTranslations('supervision.accountFile')
  const tSessions = useTranslations('supervision.gameSessions')
  const { dateTime, units } = useFileFormat()
  const gameTitle = useGameTitle()
  return (
    <SectionCard icon={CalendarDays} title={t('seancesTitle')} description={t('seancesDesc')}>
      {activity.seances.length === 0 ? (
        <EmptyState icon={Inbox} title={t('seancesEmpty')} />
      ) : (
        <ul className="space-y-2">
          {activity.seances.map((s) => (
            <li key={s.startedAt} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-sm font-medium text-white">{dateTime(s.startedAt)}</span>
                <span
                  className={cn(
                    'text-xs',
                    s.durationSeconds === null ? 'font-medium text-green-300' : 'text-white/60'
                  )}
                >
                  {s.durationSeconds === null
                    ? tSessions('ongoing')
                    : tableDurationLabel(s.durationSeconds, s.reliability, units)}
                </span>
                {s.durationSeconds !== null && <DurationReliabilityBadge reliability={s.reliability} />}
              </div>
              <p className="mt-0.5 min-w-0 break-words text-xs text-white/50">
                {t('seanceGames', { count: s.count, games: s.gameIds.map(gameTitle).join(', ') })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function RecentGamesSection({ activity, userId }: { activity: AccountActivity; userId: string }) {
  const t = useTranslations('supervision.accountFile')
  const tSessions = useTranslations('supervision.gameSessions')
  const { dateTime, units } = useFileFormat()
  const gameTitle = useGameTitle()
  const games = activity.games.slice(0, RECENT_GAMES_SHOWN)
  return (
    <SectionCard
      icon={History}
      title={t('recentTitle')}
      description={t('recentDesc')}
      actions={
        <Link
          href={`/supervision?tab=overview&userId=${encodeURIComponent(userId)}`}
          className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-white/[0.04] px-2.5 text-xs font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        >
          {t('seeInJournal')}
        </Link>
      }
    >
      {games.length === 0 ? (
        <EmptyState icon={Inbox} title={t('recentEmpty')} />
      ) : (
        <ul className="space-y-2">
          {games.map((g) => {
            // Les autres comptes de la table, chacun vers sa fiche (noms
            // résolus à la lecture par le journal).
            const mates = g.participants.filter((p) => p.kind === 'account' && p.userId && p.userId !== userId)
            return (
              <li key={g.id} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                  <GameIconById id={g.gameId} className="h-4 w-4 shrink-0 text-gold" />
                  <span className="min-w-0 text-sm font-medium text-white">{gameTitle(g.gameId)}</span>
                  <span className="text-xs text-white/45">{dateTime(g.startedAt)}</span>
                  <span
                    className={cn(
                      'text-xs',
                      g.durationSeconds === null ? 'font-medium text-green-300' : 'text-white/60'
                    )}
                  >
                    {g.durationSeconds === null
                      ? tSessions('ongoing')
                      : tableDurationLabel(g.durationSeconds, g.durationReliability, units)}
                  </span>
                  {g.endedAt !== null && <DurationReliabilityBadge reliability={g.durationReliability} />}
                </div>
                <p className="mt-0.5 text-xs text-white/50">
                  {tSessions('lineup', { players: g.playerCount, humans: g.humanCount, bots: g.botCount })}
                </p>
                {mates.length > 0 && (
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-white/40">{t('playedWith')}</span>
                    {mates.map((p) => (
                      <Link
                        key={p.id}
                        href={`/supervision/comptes/${p.userId}`}
                        title={tSessions('openAccount')}
                        className="min-w-0 break-words rounded-lg border border-white/15 bg-white/[0.04] px-2 py-0.5 text-xs text-white/85 transition-colors hover:border-amber-400/40 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                      >
                        {p.name}
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

function GamesSection({ activity }: { activity: AccountActivity }) {
  const t = useTranslations('supervision.accountFile')
  const { day, dateTime } = useFileFormat()
  const gameTitle = useGameTitle()

  // Union des lancements (OnlineGameHistory) et des résultats classés : un jeu
  // peut n'avoir que l'un des deux. Le plus récemment lancé d'abord.
  const results = new Map(activity.results.map((r) => [r.gameId, r]))
  const history = new Map(activity.history.map((h) => [h.gameId, h]))
  const gameIds = [
    ...activity.history.map((h) => h.gameId),
    ...activity.results.map((r) => r.gameId).filter((id) => !history.has(id)),
  ]
  const { progression } = activity

  return (
    <SectionCard icon={Gamepad2} title={t('gamesTitle')} description={t('gamesDesc')} bodyClassName="space-y-3">
      {gameIds.length === 0 ? (
        <EmptyState icon={Inbox} title={t('gamesEmpty')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-white/[0.03] text-[11px] uppercase tracking-wide text-white/45">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">{t('colGame')}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t('colLaunches')}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{t('colLastLaunch')}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t('colWins')}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t('colLosses')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {gameIds.map((gameId) => {
                const h = history.get(gameId)
                const r = results.get(gameId)
                return (
                  <tr key={gameId} className="text-white/80">
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <GameIconById id={gameId} className="h-4 w-4 shrink-0 text-gold" />
                        <span className="text-white">{gameTitle(gameId)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{h ? h.playCount : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-white/60">{h ? dateTime(h.lastPlayedAt) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{r ? r.wins : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-300">{r ? r.losses : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* XP et série : des instantanés, pas une mesure d'activité (solo au
          plafond sans XP ni série, jeux coopératifs sans résultat). */}
      <p className="min-w-0 break-words text-xs text-white/60">
        {t('progression', { xp: progression.onlineXp, streak: progression.streakCount })}
        {progression.streakLastDay && ` · ${t('streakLastDay', { date: day(progression.streakLastDay) })}`}
        <span className="block text-[11px] text-white/40">{t('progressionNote')}</span>
      </p>
    </SectionCard>
  )
}

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  mobile: Smartphone,
  tablet: Tablet,
  mac: Laptop,
  pc: Monitor,
}

function NetworksSection({ activity }: { activity: AccountActivity }) {
  const t = useTranslations('supervision.accountFile')
  const tSup = useTranslations('supervision')
  const locale = useLocale()
  const { day, dateTime } = useFileFormat()

  const addressCount = activity.networks.reduce((sum, n) => sum + n.count, 0)
  const countriesLabel = (countries: string[]) =>
    countries.length > 0
      ? countries.map((c) => `${countryFlag(c)} ${countryLabel(c, locale, tSup('unknownCountry'))}`).join(', ')
      : tSup('unknownCountry')

  return (
    <SectionCard icon={Network} title={t('networksTitle')} description={tSup('ipNetwork.help')}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">
            {tSup('visitorCard.accountIps')}
          </h3>
          <p className="text-[11px] leading-snug text-white/40">{tSup('visitorCard.accountIpsHint')}</p>
          {activity.networks.length === 0 ? (
            <p className="text-sm text-white/45">{t('noNetworks')}</p>
          ) : (
            <>
              <p className="text-xs text-white/60">
                {tSup('ipNetwork.summary', { addresses: addressCount, networks: activity.networks.length })}
              </p>
              <ul className="space-y-1.5">
                {activity.networks.map((network) => {
                  const sameDay =
                    parisDayString(new Date(network.firstSeenAt)) === parisDayString(new Date(network.lastSeenAt))
                  return (
                    <li key={network.key} className="min-w-0 rounded-lg border border-white/10 bg-black/20">
                      {/* Détail des adresses replié : le résumé par réseau suffit
                          à lire « même foyer ou lieu ». IPv6 en break-all. */}
                      <details className="group">
                        <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 [&::-webkit-details-marker]:hidden">
                          <ChevronRight className="h-3 w-3 shrink-0 text-white/40 transition-transform group-open:rotate-90" />
                          <span className="min-w-0 break-all font-mono text-[11px] text-amber-200/85">{network.key}</span>
                          <span className="text-[10px] text-white/45">
                            {tSup('ipNetwork.addresses', { count: network.count })}
                          </span>
                          <span className="block w-full min-w-0 break-words text-[10px] text-white/40">
                            {countriesLabel(network.countries)} ·{' '}
                            {sameDay
                              ? tSup('ipNetwork.seenOn', { date: day(network.lastSeenAt) })
                              : tSup('ipNetwork.seenRange', {
                                  first: day(network.firstSeenAt),
                                  last: day(network.lastSeenAt),
                                })}
                          </span>
                        </summary>
                        <ul className="space-y-1 border-t border-white/[0.06] px-2.5 py-2">
                          {network.entries.map((entry) => (
                            <li key={entry.ip} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                              <span className="min-w-0 break-all font-mono text-[11px] text-white/75">{entry.ip}</span>
                              <span className="text-[10px] text-white/35">
                                {countryFlag(entry.country)} {dateTime(entry.lastSeenAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/45">{t('browsersTitle')}</h3>
          <p className="text-[11px] leading-snug text-white/40">{t('browsersHint')}</p>
          {activity.browsers.length === 0 ? (
            <p className="text-sm text-white/45">{t('noBrowsers')}</p>
          ) : (
            <ul className="space-y-1.5">
              {activity.browsers.map((browser, index) => {
                const Icon = (browser.device && DEVICE_ICONS[browser.device]) || Monitor
                const deviceKey = browser.device && DEVICE_ICONS[browser.device] ? browser.device : 'unknown'
                // Ni visitorId ni IP servis : l'ordre (dernière vue) sert de clé.
                return (
                  <li
                    key={`${index}-${browser.lastSeen}`}
                    className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2"
                  >
                    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/80">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-white/50" />
                      <span>{t(`devices.${deviceKey}`)}</span>
                      <span className="text-white/45">
                        {countryFlag(browser.country)} {countryLabel(browser.country, locale, tSup('unknownCountry'))}
                      </span>
                    </p>
                    <p className="mt-0.5 min-w-0 break-words text-[11px] text-white/45">
                      {tSup('visitorCard.browserSeen', { date: dateTime(browser.lastSeen) })} ·{' '}
                      {browser.connectedHere ? t('browserConnected') : t('browserLastAccount')}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  )
}

/** « Cumul hérité : 31 h 41 (surestimé : onglets ouverts) », en pied de fiche. */
function LegacyPresenceFooter({ seconds }: { seconds: number }) {
  const tSup = useTranslations('supervision')
  const { units } = useFileFormat()
  return (
    <p className="min-w-0 break-words px-1 text-[11px] leading-snug text-white/40">
      {tSup('activity.legacyPresence', { duration: formatPresenceDuration(seconds, units) })}
      {tSup('activity.legacyPresenceNote')}
    </p>
  )
}

/** Libellé d'une action de l'historique de modération (même table que la page). */
function useModerationActionLabel() {
  const t = useTranslations('supervision.actions')
  return (action: string): string => {
    switch (action) {
      case 'ban_permanent':
        return t('banPermanent')
      case 'ban_temporary':
        return t('banTemporary')
      case 'unban':
        return t('unban')
      case 'feedback-ack':
        return t('feedbackAck')
      case 'name-flag-ack':
        return t('nameFlagAck')
      case 'role-change':
        return t('roleChange')
      default:
        return action
    }
  }
}

function ModerationSection({ detail }: { detail: AccountDetail }) {
  const t = useTranslations('supervision.accountFile')
  const tSup = useTranslations('supervision')
  const { dateTime } = useFileFormat()
  const actionLabel = useModerationActionLabel()
  const { ban } = detail.user

  return (
    <SectionCard icon={Gavel} title={t('moderationTitle')} bodyClassName="space-y-3">
      {ban.banned ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <p className="font-medium">
            {tSup('history.currentlyBanned')} ·{' '}
            {ban.banType === 'permanent' ? tSup('bans.permanent') : tSup('bans.temporary')}
            {ban.bannedUntil && ` ${tSup('bans.until', { date: dateTime(ban.bannedUntil) })}`}
          </p>
          {ban.banComment && <p className="mt-1 min-w-0 break-words text-red-100/80">{ban.banComment}</p>}
        </div>
      ) : (
        <p className="text-sm text-white/55">{t('notBanned')}</p>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
          {tSup('history.moderationHistory')}
        </h3>
        {detail.banHistory.length === 0 ? (
          <p className="text-sm text-white/45">{tSup('history.noEvents')}</p>
        ) : (
          <ul className="space-y-2">
            {detail.banHistory.map((ev) => (
              <li key={ev.id} className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                <p className="font-medium text-white">{actionLabel(ev.action)}</p>
                <p className="text-xs text-white/45">
                  {tSup('history.by', { date: dateTime(ev.createdAt), name: ev.actorName })}
                </p>
                {ev.comment && <p className="mt-1 min-w-0 break-words text-white/70">{ev.comment}</p>}
                {ev.bannedUntil && (
                  <p className="text-xs text-white/45">{tSup('history.until', { date: dateTime(ev.bannedUntil) })}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}
