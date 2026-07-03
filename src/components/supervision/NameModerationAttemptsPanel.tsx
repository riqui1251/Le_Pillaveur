'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { UserSearch } from 'lucide-react'
import { SectionCard } from '@/components/supervision/SupervisionLayout'
import { AlertTriangle } from 'lucide-react'

type AttemptRow = {
  id: string
  attemptedName: string
  reason: string
  context: string
  visitorId: string | null
  createdAt: string
  user: {
    id: string
    displayName: string | null
    email: string | null
    accountCode: string | null
    warnedAt: string | null
  } | null
}

type FlaggedUser = {
  user: {
    id: string
    displayName: string | null
    email: string | null
    accountCode: string | null
    nameModerationWarnedAt: string | null
  }
  profanityAttemptCount: number
  showWarning: boolean
}

export function NameModerationAttemptsPanel() {
  const t = useTranslations('supervision.moderation')
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [flaggedUsers, setFlaggedUsers] = useState<FlaggedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const tRef = useRef(t)
  tRef.current = t

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/name-moderation-attempts', {
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tRef.current('attemptsLoadError'))
      setAttempts(data.attempts ?? [])
      setFlaggedUsers(data.flaggedUsers ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : tRef.current('attemptsLoadError'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    })

  return (
    <SectionCard icon={UserSearch} title={t('attemptsTitle')} description={t('attemptsDescription')} bodyClassName="space-y-6">
        {loading ? (
          <p className="text-sm text-white/50">{t('loading')}</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : (
          <>
            {flaggedUsers.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/80">
                  {t('flaggedUsersTitle')}
                </p>
                <div className="space-y-2">
                  {flaggedUsers.map(({ user, profanityAttemptCount }) => (
                    <div
                      key={user.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                      <span className="font-medium">
                        {user.displayName ?? user.email ?? user.accountCode ?? user.id}
                      </span>
                      {user.accountCode && (
                        <span className="font-mono text-xs text-amber-200/70">{user.accountCode}</span>
                      )}
                      <span className="text-xs text-amber-200/80">
                        {t('attemptCount', { count: profanityAttemptCount })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {attempts.length === 0 ? (
              <p className="text-sm text-white/50">{t('attemptsEmpty')}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.04] text-xs uppercase tracking-wide text-white/45">
                    <tr>
                      <th className="px-3 py-2">{t('attemptsColDate')}</th>
                      <th className="px-3 py-2">{t('attemptsColName')}</th>
                      <th className="px-3 py-2">{t('attemptsColUser')}</th>
                      <th className="px-3 py-2">{t('attemptsColContext')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((row) => (
                      <tr key={row.id} className="border-b border-white/5 text-white/85">
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-white/55">
                          {formatDate(row.createdAt)}
                        </td>
                        <td className="px-3 py-2 font-mono text-amber-200">{row.attemptedName}</td>
                        <td className="px-3 py-2">
                          {row.user ? (
                            <span>
                              {row.user.displayName ?? row.user.email ?? '—'}
                              {row.user.warnedAt && (
                                <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-400" />
                              )}
                            </span>
                          ) : (
                            <span className="text-white/45">{t('attemptsAnonymous')}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-white/55">{row.context}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
    </SectionCard>
  )
}
