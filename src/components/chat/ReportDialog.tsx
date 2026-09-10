"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Flag, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Boîte de signalement — le seul chemin par lequel une victime peut faire
 * remonter un abus. Volontairement courte : un motif, une précision
 * facultative, envoyer. Le contexte du canal est ajouté côté serveur, le
 * signalant n'a rien à copier-coller.
 */

/** Doit rester aligné sur REPORT_REASONS (src/lib/moderation/reports.ts). */
const REASONS = ['harassment', 'hate', 'sexual', 'threat', 'spam', 'cheating', 'other'] as const
type Reason = (typeof REASONS)[number]

export type ReportTarget = {
  /** Message précis visé, ou null pour signaler le joueur en général. */
  messageId: string | null
  reportedUserId: string
  displayName: string
  /** Canal d'origine, repris tel quel dans la requête (mêmes droits qu'une lecture). */
  scope: 'room' | 'friend'
  friendUserId?: string
}

type Props = {
  target: ReportTarget
  onClose: () => void
}

export function ReportDialog({ target, onClose }: Props) {
  const t = useTranslations('chat')
  const tCommon = useTranslations('common')
  const [reason, setReason] = useState<Reason>('harassment')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'sent' | 'already' | 'failed' | null>(null)

  const submit = async () => {
    if (sending) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/chat/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          scope: target.scope,
          friendUserId: target.friendUserId,
          messageId: target.messageId,
          reportedUserId: target.messageId ? undefined : target.reportedUserId,
          reason,
          comment: comment.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setResult('failed')
        return
      }
      setResult(data?.status === 'already-reported' ? 'already' : 'sent')
    } catch {
      setResult('failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-10 flex flex-col bg-[#0c0b12]/98 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={target.messageId ? t('reportTitle') : t('reportPlayerTitle')}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Flag className="h-4 w-4 shrink-0 text-red-300" />
          <h3 className="truncate text-sm font-bold text-white">
            {target.messageId ? t('reportTitle') : t('reportPlayerTitle')}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('cancel')}
          className="touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-xs text-white/50">{target.displayName}</p>

        {result === 'sent' || result === 'already' ? (
          <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {result === 'sent' ? t('reportSent') : t('reportAlready')}
          </p>
        ) : (
          <>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/40">
                {t('reportReason')}
              </legend>
              {REASONS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                    reason === value
                      ? 'border-violet-400/50 bg-violet-500/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="h-3.5 w-3.5 accent-violet-500"
                  />
                  {t(`reportReasons.${value}`)}
                </label>
              ))}
            </fieldset>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/40">
                {t('reportComment')}
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
              />
            </label>

            {result === 'failed' && (
              <p role="status" className="text-[11px] text-red-300">
                {t('reportFailed')}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2 border-t border-white/10 p-2.5">
        {result === 'sent' || result === 'already' ? (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/15"
          >
            {t('back')}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/15 bg-white/5 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2 text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
              {t('reportSubmit')}
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}
