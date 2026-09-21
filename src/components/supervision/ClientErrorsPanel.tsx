'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { AlertTriangle, Bug, CheckCheck, Monitor, Smartphone, Tablet } from 'lucide-react'
import { EmptyState, ErrorState, SectionCard, SkeletonRows } from '@/components/supervision/SupervisionLayout'
import type { ClientErrorsSummary } from '@/lib/client-errors-server'
import { PARIS_TIME_ZONE } from '@/lib/paris-time'

/**
 * « Plantages côté joueur » : ce que les écrans d'erreur React ont attrapé
 * dans les navigateurs, tel que POST /api/client-error l'a enregistré.
 *
 * Panneau AUTONOME, hors de la boucle de rafraîchissement de 15 s (F40),
 * comme le journal des parties : il se charge à l'ouverture de l'onglet, et
 * l'exploitant le recharge à la main. Un plantage d'il y a une heure n'a pas
 * besoin d'être relu toutes les 15 secondes.
 *
 * Les colonnes sont exactement ce que la table porte — nom, message tronqué,
 * page, occurrences, dernière série, version, appareil. Rien à masquer ici :
 * la route n'enregistre déjà aucune donnée personnelle.
 */

/** Longueur du message affiché dans la cellule ; le texte complet est dans `title`. */
const MESSAGE_PREVIEW_LENGTH = 120

const DEVICE_ICONS = { mobile: Smartphone, tablet: Tablet, desktop: Monitor } as const

type DeviceFamily = keyof typeof DEVICE_ICONS

function isDeviceFamily(value: string): value is DeviceFamily {
  return value in DEVICE_ICONS
}

export function ClientErrorsPanel() {
  const t = useTranslations('supervision.clientErrors')
  const tStates = useTranslations('supervision.states')
  const format = useFormatter()
  const [summary, setSummary] = useState<ClientErrorsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/client-errors', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tRef.current('loadError'))
      setSummary({ total24h: data.total24h ?? 0, groups: data.groups ?? [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : tRef.current('loadError'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Langue de la Supervision et heure de Paris, comme le reste de la page.
  const formatDate = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'short', timeStyle: 'short', timeZone: PARIS_TIME_ZONE })

  return (
    <SectionCard
      icon={Bug}
      title={t('title')}
      description={
        <>
          {t('desc')}
          {summary && (
            <span className="mt-0.5 block font-medium text-amber-200/80">
              {t('last24h', { count: summary.total24h })}
            </span>
          )}
        </>
      }
    >
      {error ? (
        <ErrorState icon={AlertTriangle} message={error} retryLabel={tStates('retry')} onRetry={() => void load()} />
      ) : !summary ? (
        <SkeletonRows rows={3} />
      ) : summary.groups.length === 0 ? (
        <EmptyState icon={CheckCheck} title={t('empty')} hint={t('emptyHint')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-white/45">
              <tr>
                <th className="px-3 py-2">{t('colError')}</th>
                <th className="px-3 py-2">{t('colPage')}</th>
                <th className="px-3 py-2 text-right">{t('colCount')}</th>
                <th className="px-3 py-2" title={t('lastSeenHint')}>
                  {t('colLastSeen')}
                </th>
                <th className="px-3 py-2">{t('colBuild')}</th>
                <th className="px-3 py-2">{t('colDevice')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.groups.map((group) => {
                const DeviceIcon = isDeviceFamily(group.device) ? DEVICE_ICONS[group.device] : Monitor
                const preview =
                  group.message.length > MESSAGE_PREVIEW_LENGTH
                    ? `${group.message.slice(0, MESSAGE_PREVIEW_LENGTH)}…`
                    : group.message
                return (
                  <tr
                    key={`${group.name}|${group.message}|${group.path}|${group.buildSha ?? ''}|${group.device}`}
                    className="border-b border-white/5 align-top text-white/85"
                  >
                    <td className="max-w-md px-3 py-2">
                      <span className="font-mono text-xs text-amber-200">{group.name}</span>
                      {/* Message complet au survol : la cellule n'en montre que le début. */}
                      <p className="mt-0.5 break-words text-xs text-white/65" title={group.message}>
                        {preview || '—'}
                      </p>
                    </td>
                    <td className="max-w-[16rem] break-all px-3 py-2 font-mono text-xs text-white/70">{group.path}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">×{group.count}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-white/55">{formatDate(group.lastSeenAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-white/55">{group.buildSha ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-white/55">
                      <span className="inline-flex items-center gap-1.5">
                        <DeviceIcon className="h-3.5 w-3.5 shrink-0 text-white/40" />
                        {isDeviceFamily(group.device) ? t(`device.${group.device}`) : group.device}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}
