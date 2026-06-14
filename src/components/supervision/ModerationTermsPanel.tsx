'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { locales } from '@/i18n/routing'
import { Trash2 } from 'lucide-react'

type ModerationTermRow = {
  id: string
  term: string
  locale: string | null
  note: string | null
  createdAt: string
}

type ModerationStats = {
  baseCounts: { fr: number; en: number; es: number; it: number }
  fileExtraCount: number
  dbExtraCount: number
  dbTerms: ModerationTermRow[]
}

export function ModerationTermsPanel() {
  const t = useTranslations('supervision.moderation')
  const [stats, setStats] = useState<ModerationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [term, setTerm] = useState('')
  const [locale, setLocale] = useState<string>('all')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/moderation-terms', { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('loadError'))
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  const addTerm = async () => {
    const trimmed = term.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/moderation-terms', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: trimmed,
          locale: locale === 'all' ? null : locale,
          note: note.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('saveError'))
      setTerm('')
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const removeTerm = async (id: string) => {
    setError(null)
    try {
      const res = await fetch('/api/admin/moderation-terms', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('deleteError'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteError'))
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="text-white">{t('title')}</CardTitle>
          <CardDescription className="text-white/55">{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-white/50">{t('loading')}</p>
          ) : stats ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs text-white/45">{t('baseLists')}</p>
                <p className="mt-1 text-sm text-white">
                  FR {stats.baseCounts.fr} · EN {stats.baseCounts.en} · ES {stats.baseCounts.es} · IT {stats.baseCounts.it}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs text-white/45">{t('fileExtra')}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{stats.fileExtraCount}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs text-white/45">{t('dbExtra')}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{stats.dbExtraCount}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-xs text-white/45">{t('fileHintTitle')}</p>
                <p className="mt-1 text-xs text-white/60">{t('fileHint')}</p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[1fr_160px_1fr_auto] md:items-end">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/55">{t('termLabel')}</label>
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={t('termPlaceholder')}
                className="border-white/15 bg-white/[0.06] text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/55">{t('localeLabel')}</label>
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger className="border-white/15 bg-white/[0.06] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('localeAll')}</SelectItem>
                  {locales.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/55">{t('noteLabel')}</label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('notePlaceholder')}
                className="border-white/15 bg-white/[0.06] text-white"
              />
            </div>
            <Button onClick={addTerm} disabled={saving || !term.trim()} className="md:mb-0.5">
              {saving ? t('saving') : t('addTerm')}
            </Button>
          </div>

          {error && <p className="text-sm text-orange-400">{error}</p>}

          {stats && stats.dbTerms.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-white">{t('recentTerms')}</p>
              <ul className="space-y-2">
                {stats.dbTerms.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{row.term}</p>
                      <p className="text-xs text-white/45">
                        {row.locale?.toUpperCase() ?? t('localeAll')}
                        {row.note ? ` · ${row.note}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTerm(row.id)}
                      className="shrink-0 text-white/50 hover:text-red-400"
                      aria-label={t('deleteTerm')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
