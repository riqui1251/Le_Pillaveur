"use client"

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SOIREE_VOTE_COMMENT_MAX, type SoireeVoteTarget } from '@/lib/soiree-feedback'
import { VoteIcon } from './vote-icons'

const RATINGS = [1, 2, 3, 4, 5] as const

type SendOutcome = 'ok' | 'tooMany' | 'network'

/** Envoie le vote — jamais d'exception : l'entracte et l'addition ne doivent pas casser. */
async function postSoireeVote(target: SoireeVoteTarget, rating: number, comment: string): Promise<SendOutcome> {
  try {
    const res = await fetch('/api/feedback/soiree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      // « Manche suivante » juste après le vote ne doit pas l'annuler.
      keepalive: true,
      body: JSON.stringify({ ...target, rating, comment: comment || undefined, pageUrl: window.location.pathname }),
    })
    if (res.ok) return 'ok'
    return res.status === 429 ? 'tooMany' : 'network'
  } catch {
    return 'network'
  }
}

/**
 * Le vote de la table en cinq icônes : des verres avec alcool, des jetons en
 * Sans alcool (src/components/soiree/vote-icons.tsx). Pour une manche, un
 * toucher suffit : le vote part aussitôt. Pour la soirée entière, l'icône
 * ouvre un commentaire facultatif, envoyé avec la note. Une fois envoyé, le
 * vote est retenu dans la soirée (`value`) : on ne redemande pas.
 */
export function SoireeVote({
  target,
  soft,
  value,
  onVoted,
  className,
}: {
  target: SoireeVoteTarget
  soft: boolean
  value?: number
  onVoted: (rating: number) => void
  className?: string
}) {
  const iconSet = soft ? 'jetons' : 'verres'
  const t = useTranslations('soiree.vote')
  const [picked, setPicked] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<'tooMany' | 'network' | null>(null)
  const questionId = useId()
  const commentId = useId()
  const withComment = target.scope === 'soiree'

  const send = async (rating: number) => {
    setSending(true)
    setError(null)
    const outcome = await postSoireeVote(target, rating, comment.trim())
    setSending(false)
    if (outcome === 'ok') onVoted(rating)
    else setError(outcome)
  }

  const choose = (rating: number) => {
    if (sending) return
    setPicked(rating)
    setError(null)
    if (!withComment) void send(rating)
  }

  if (value !== undefined) {
    return (
      <p role="status" className={cn('flex items-center gap-2.5 text-sm font-semibold text-emerald-200', className)}>
        <VoteIcon set={iconSet} rating={value} className="h-8 w-8 shrink-0" />
        <Check aria-hidden className="h-4 w-4 shrink-0" />
        {t('thanks')}
      </p>
    )
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      <p id={questionId} className="font-semibold text-cream">{t(withComment ? 'soiree' : 'round')}</p>
      <div role="group" aria-labelledby={questionId} className="flex justify-between gap-1.5 sm:justify-start sm:gap-2">
        {RATINGS.map((rating) => {
          const active = picked === rating
          return (
            <button
              key={rating}
              type="button"
              onClick={() => choose(rating)}
              disabled={sending}
              aria-pressed={active}
              aria-label={t(`faces.${rating}`)}
              className={cn(
                'grid h-[52px] w-[52px] place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-wait',
                active
                  ? 'scale-110 border-gold bg-gold/20 shadow-[0_0_0_3px_rgba(217,164,65,0.28)]'
                  : 'border-gold/25 bg-black/20 hover:bg-gold/10',
                sending && !active && 'opacity-40'
              )}
            >
              {sending && active && !withComment ? (
                <Loader2 aria-hidden className="h-5 w-5 animate-spin text-gold" />
              ) : (
                <VoteIcon set={iconSet} rating={rating} className="h-10 w-10" />
              )}
            </button>
          )
        })}
      </div>

      {withComment && picked !== null && (
        <div className="space-y-2">
          <label htmlFor={commentId} className="block text-sm font-semibold text-cream/70">
            {t('commentLabel')}
          </label>
          <textarea
            id={commentId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={SOIREE_VOTE_COMMENT_MAX}
            rows={3}
            placeholder={t('commentPlaceholder')}
            className="w-full resize-none rounded-xl border border-gold/30 bg-black/20 px-3 py-2.5 text-cream placeholder:text-cream/40 focus:border-gold focus:outline-none"
          />
          <Button variant="primary" size="game" className="w-full" onClick={() => void send(picked)} disabled={sending}>
            {sending ? <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" /> : <Send aria-hidden className="mr-1.5 h-4 w-4" />}
            {t('send')}
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-300">
          {t(error === 'tooMany' ? 'tooMany' : 'error')}
        </p>
      )}
      <p className="text-xs text-cream/50">{t('note')}</p>
    </div>
  )
}
