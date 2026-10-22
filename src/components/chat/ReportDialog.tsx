"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Flag, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
      className="absolute inset-0 z-10 flex flex-col bg-felt-deep text-cream"
      role="dialog"
      aria-modal="true"
      aria-label={target.messageId ? t('reportTitle') : t('reportPlayerTitle')}
    >
      <div className="flex items-center justify-between gap-2 border-b border-gold/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Flag className="h-4 w-4 shrink-0 text-red-300" />
          <h3 className="truncate text-sm font-bold text-cream">
            {target.messageId ? t('reportTitle') : t('reportPlayerTitle')}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('cancel')}
          className="touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-xs text-cream/70">{target.displayName}</p>

        {result === 'sent' || result === 'already' ? (
          <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
            {result === 'sent' ? t('reportSent') : t('reportAlready')}
          </p>
        ) : (
          <>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-cream/60">
                {t('reportReason')}
              </legend>
              {REASONS.map((value) => (
                <label
                  key={value}
                  className={cn(
                    'flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                    reason === value
                      ? 'border-gold/60 bg-gold/[0.15] text-cream'
                      : 'border-gold/20 bg-white/[0.03] text-cream/80 hover:bg-white/[0.07]'
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="h-4 w-4 accent-amber-500"
                  />
                  {t(`reportReasons.${value}`)}
                </label>
              ))}
            </fieldset>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-cream/60">
                {t('reportComment')}
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full rounded-xl border border-gold/20 bg-black/20 px-3 py-2 text-sm text-cream placeholder:text-cream/50 focus:border-gold/60 focus:outline-none"
              />
            </label>

            {result === 'failed' && (
              <p role="status" className="text-xs text-red-300">
                {t('reportFailed')}
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex gap-2 border-t border-gold/20 p-2.5">
        {result === 'sent' || result === 'already' ? (
          <Button type="button" variant="quiet" size="game" onClick={onClose} className="flex-1">
            {t('back')}
          </Button>
        ) : (
          <>
            <Button type="button" variant="quiet" size="game" onClick={onClose} className="flex-1">
              {tCommon('cancel')}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="game"
              onClick={() => void submit()}
              disabled={sending}
              className="flex-1 gap-1.5"
            >
              {sending ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <Flag className="h-4 w-4" />}
              {t('reportSubmit')}
            </Button>
          </>
        )}
      </div>
    </motion.div>
  )
}
