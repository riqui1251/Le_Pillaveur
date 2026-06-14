"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { usePathname } from '@/i18n/navigation'
import { Bug, Lightbulb, MessageCircle, ImagePlus, X, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  compressImageFile,
  MAX_FEEDBACK_MESSAGE,
  MAX_SCREENSHOTS,
  type FeedbackType,
} from '@/lib/feedback'
import { cn } from '@/lib/utils'

const FEEDBACK_TYPES: FeedbackType[] = ['bug', 'improvement', 'comment']

const TYPE_ICONS: Record<FeedbackType, React.ComponentType<{ className?: string }>> = {
  bug: Bug,
  improvement: Lightbulb,
  comment: MessageCircle,
}

type FeedbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const t = useTranslations('feedback')
  const tAuth = useTranslations('auth')
  const tCommon = useTranslations('common')
  const { user } = useAuth()
  const pathname = usePathname()

  const [type, setType] = useState<FeedbackType>('comment')
  const [message, setMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const resetForm = () => {
    setType('comment')
    setMessage('')
    setContactEmail(user?.email ?? '')
    setScreenshots([])
    setError(null)
    setSuccess(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setContactEmail(user?.email ?? '')
    } else {
      resetForm()
    }
    onOpenChange(next)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setError(null)
    const remaining = MAX_SCREENSHOTS - screenshots.length
    const toProcess = files.slice(0, remaining)

    try {
      const compressed = await Promise.all(toProcess.map((f) => compressImageFile(f)))
      setScreenshots((prev) => [...prev, ...compressed].slice(0, MAX_SCREENSHOTS))
    } catch {
      setError(t('imageError'))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!message.trim()) {
      setError(t('emptyMessage'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          type,
          message: message.trim(),
          contactEmail: contactEmail.trim() || undefined,
          screenshots: type === 'bug' ? screenshots : [],
          pageUrl: pathname,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? tCommon('error'))
      setSuccess(true)
      setTimeout(() => handleOpenChange(false), 1800)
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0c0b12] text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription className="text-white/50">
            {t('dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <p className="rounded-lg bg-emerald-500/15 px-4 py-3 text-sm text-emerald-300">
            {t('success')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {FEEDBACK_TYPES.map((value) => {
                const Icon = TYPE_ICONS[value]
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-colors',
                      type === value
                        ? 'border-amber-400/40 bg-amber-500/15 text-amber-100'
                        : 'border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{t(`types.${value}.label`)}</span>
                    <span className="hidden text-[10px] opacity-60 sm:block">
                      {t(`types.${value}.description`)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">{t('messageLabel')}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t(`placeholders.${type}`)}
                required
                maxLength={MAX_FEEDBACK_MESSAGE}
                rows={4}
                className="w-full resize-none rounded-md border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/50"
              />
              <p className="mt-1 text-right text-[10px] text-white/30">
                {message.length}/{MAX_FEEDBACK_MESSAGE}
              </p>
            </div>

            {type === 'bug' && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-white/60">
                  {t('screenshots', { max: MAX_SCREENSHOTS })}
                </label>
                <div className="flex flex-wrap gap-2">
                  {screenshots.map((src, i) => (
                    <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Capture ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setScreenshots((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute right-0.5 top-0.5 rounded bg-black/60 p-0.5 text-white"
                        aria-label={t('removeScreenshot')}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {screenshots.length < MAX_SCREENSHOTS && (
                    <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/[0.03] text-white/40 hover:bg-white/[0.06]">
                      <ImagePlus className="h-5 w-5" />
                      <span className="mt-1 text-[9px]">{t('addScreenshot')}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">
                {t('contactEmail')}
              </label>
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder={tAuth('emailPlaceholder')}
                className="border-white/10 bg-white/[0.05] text-white"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
            )}

            <DialogFooter>
              <Button
                type="submit"
                disabled={loading}
                className="bg-amber-500 text-black hover:bg-amber-400"
              >
                <Send className="mr-2 h-4 w-4" />
                {loading ? t('sending') : t('send')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function FeedbackMenuButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('feedback')

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
        <MessageCircle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-none">{t('menuTitle')}</p>
        <p className="mt-0.5 truncate text-[11px] opacity-50">{t('menuSubtitle')}</p>
      </div>
    </button>
  )
}
