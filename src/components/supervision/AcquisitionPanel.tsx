'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { AlertTriangle, Compass, Inbox } from 'lucide-react'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import { BarList, type BarListRow } from '@/components/supervision/charts'
import {
  ACQUISITION_DAILY_ROW_CAP,
  ACQUISITION_OVERFLOW,
  isAcquisitionChannel,
  type AcquisitionChannel,
} from '@/lib/acquisition'
import { PARIS_TIME_ZONE } from '@/lib/paris-time'
import { parisDayToDate } from '@/lib/supervision/paris-day'
import { STATS_PERIODS, measureSpan, type StatsPeriod } from '@/lib/supervision/stats-period'

/**
 * Provenance des visites (GET /api/admin/acquisition) : arrivées par canal,
 * pages d'arrivée, campagnes utm, sites et applis non classés, sur la période
 * de l'onglet. Panneau AUTONOME, hors de la boucle de 15 s de la page : des
 * compteurs par jour n'ont pas à être relus aussi souvent.
 */

type AcquisitionResponse = {
  computedAt: string
  since: string | null
  total: number
  /** Arrivées des lignes de repli (plafond du jour atteint), incluses dans `total`. */
  overflow: number
  channels: Array<{ channel: AcquisitionChannel; visits: number }>
  landings: Array<{ path: string; visits: number }>
  campaigns: Array<{ source: string; medium: string; campaign: string; visits: number }>
  hosts: Array<{ channel: 'autre' | 'app'; host: string; visits: number }>
}

const PERIOD_LABEL_KEY = { d1: 'stats.today', d7: 'stats.week', d30: 'stats.month' } as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isText = (value: unknown): value is string => typeof value === 'string'

/** Réponse d'un serveur antérieur à la route ou page d'erreur du proxy : null, jamais un panneau vide. */
function parseResponse(body: unknown): AcquisitionResponse | null {
  if (!isRecord(body) || !isText(body.computedAt) || !isCount(body.total)) return null
  const { channels, landings, campaigns, hosts } = body
  if (![channels, landings, campaigns, hosts].every(Array.isArray)) return null
  const rows = (list: unknown) => (list as unknown[]).filter(isRecord).filter((row) => isCount(row.visits))
  return {
    computedAt: body.computedAt,
    since: isText(body.since) ? body.since : null,
    total: body.total,
    overflow: isCount(body.overflow) ? body.overflow : 0,
    channels: rows(channels)
      .filter((row) => isAcquisitionChannel(row.channel))
      .map((row) => ({ channel: row.channel as AcquisitionChannel, visits: row.visits as number })),
    landings: rows(landings)
      .filter((row) => isText(row.path))
      .map((row) => ({ path: row.path as string, visits: row.visits as number })),
    campaigns: rows(campaigns)
      .filter((row) => isText(row.source) && isText(row.medium) && isText(row.campaign))
      .map((row) => ({
        source: row.source as string,
        medium: row.medium as string,
        campaign: row.campaign as string,
        visits: row.visits as number,
      })),
    hosts: rows(hosts)
      .filter((row) => isText(row.host) && (row.channel === 'autre' || row.channel === 'app'))
      .map((row) => ({ channel: row.channel as 'autre' | 'app', host: row.host as string, visits: row.visits as number })),
  }
}

function SubList({ title, rows, category }: { title: string; rows: BarListRow[]; category: string }) {
  const t = useTranslations('supervision')
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cream/80">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-white/60">{t('acquisition.emptyList')}</p>
      ) : (
        <BarList
          ariaLabel={title}
          rows={rows}
          limit={5}
          emptyLabel={t('charts.noData')}
          showAllLabel={(count) => t('charts.showAll', { count })}
          collapseLabel={t('charts.collapse')}
          shareLabel={t('charts.share')}
          categoryLabel={category}
          primaryLabel={t('acquisition.arrivals')}
        />
      )}
    </div>
  )
}

export function AcquisitionPanel({ period }: { period: StatsPeriod }) {
  const t = useTranslations('supervision')
  const format = useFormatter()
  const [data, setData] = useState<AcquisitionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tRef = useRef(t)
  tRef.current = t
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/acquisition?period=${period}`, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(tRef.current(res.status === 403 ? 'acquisition.forbidden' : 'acquisition.loadError'))
      const parsed = parseResponse(body)
      if (!parsed) throw new Error(tRef.current('acquisition.loadError'))
      setData(parsed)
      setError(null)
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error && e.name !== 'TypeError' ? e.message : tRef.current('acquisition.loadError'))
    } finally {
      if (abortRef.current === controller) setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
    return () => {
      const pending = abortRef.current
      abortRef.current = null
      pending?.abort()
    }
  }, [load])

  const span = measureSpan(period, STATS_PERIODS, {
    computedAt: new Date(data?.computedAt ?? Date.now()),
    since: data?.since ?? null,
  })
  const windowLabel = span.since
    ? t('gameSessions.windowSince', {
        window: t(PERIOD_LABEL_KEY[span.key]),
        date: format.dateTime(parisDayToDate(span.since), { day: '2-digit', month: '2-digit', timeZone: PARIS_TIME_ZONE }),
      })
    : t(PERIOD_LABEL_KEY[span.key])
  const title = t('method.windowed', { label: t('acquisition.title'), window: windowLabel })

  const channelRows: BarListRow[] = (data?.channels ?? []).map((row) => ({
    key: row.channel,
    label: t(`acquisition.channels.${row.channel}`),
    value: row.visits,
  }))
  const overflowLabel = <span className="italic text-cream/80">{t('acquisition.overflow')}</span>
  const landingRows: BarListRow[] = (data?.landings ?? []).map((row) => ({
    key: row.path,
    label:
      row.path === ACQUISITION_OVERFLOW ? overflowLabel : <span className="break-all font-mono text-[12px]">{row.path}</span>,
    value: row.visits,
  }))
  const unset = t('acquisition.unset')
  const campaignRows: BarListRow[] = (data?.campaigns ?? []).map((row) => ({
    key: `${row.source}|${row.medium}|${row.campaign}`,
    label: <span className="break-all">{row.campaign || unset}</span>,
    hint: t('acquisition.campaignHint', { source: row.source || unset, medium: row.medium || unset }),
    value: row.visits,
  }))
  const hostRows: BarListRow[] = (data?.hosts ?? []).map((row) => ({
    key: `${row.channel}|${row.host}`,
    label: row.host === ACQUISITION_OVERFLOW ? overflowLabel : <span className="break-all">{row.host}</span>,
    hint: row.channel === 'app' ? t('acquisition.appHint') : undefined,
    value: row.visits,
  }))

  return (
    <section className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4" aria-busy={loading}>
      <div className="mb-3 min-w-0">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cream/80">
          <Compass className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          {title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-white/70">{t('acquisition.description')}</p>
      </div>

      {error ? (
        <ErrorState icon={AlertTriangle} message={error} retryLabel={t('acquisition.retry')} onRetry={() => void load()} />
      ) : !data ? (
        <SkeletonRows rows={3} />
      ) : data.total === 0 ? (
        <EmptyState icon={Inbox} title={t('acquisition.empty')} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-cream/90">{t('acquisition.total', { count: data.total })}</p>
          <BarList
            ariaLabel={t('acquisition.channelsTitle')}
            rows={channelRows}
            total={data.total}
            showShare
            limit={8}
            emptyLabel={t('charts.noData')}
            showAllLabel={(count) => t('charts.showAll', { count })}
            collapseLabel={t('charts.collapse')}
            shareLabel={t('charts.share')}
            categoryLabel={t('acquisition.channel')}
            primaryLabel={t('acquisition.arrivals')}
          />
          <div className="grid gap-3 md:grid-cols-3">
            <SubList title={t('acquisition.landingsTitle')} rows={landingRows} category={t('acquisition.page')} />
            <SubList title={t('acquisition.campaignsTitle')} rows={campaignRows} category={t('acquisition.campaign')} />
            <SubList title={t('acquisition.hostsTitle')} rows={hostRows} category={t('acquisition.site')} />
          </div>
          {data.overflow > 0 && (
            <p className="text-[11px] leading-relaxed text-amber-200/90">
              {t('acquisition.overflowNote', { count: data.overflow, cap: ACQUISITION_DAILY_ROW_CAP })}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-white/60">{t('acquisition.directNote')}</p>
        </div>
      )}
    </section>
  )
}
