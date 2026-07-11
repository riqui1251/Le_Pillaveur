"use client"

import { Smartphone, Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/components/providers/AuthProvider'
import { cn } from '@/lib/utils'

type PlayMode = 'local' | 'online'

const MODES: { id: PlayMode; icon: typeof Smartphone }[] = [
  { id: 'local', icon: Smartphone },
  { id: 'online', icon: Globe },
]

export function PlayModeToggle({ className }: { className?: string }) {
  const t = useTranslations('hub.playMode')
  const { user, setPlayMode, loading } = useAuth()

  if (loading || !user) return null

  return (
    <div
      role="radiogroup"
      aria-label={t('label')}
      className={cn(
        'inline-flex w-full max-w-md rounded-full border border-white/10 bg-black/30 p-1 shadow-inner',
        className
      )}
    >
      {MODES.map(({ id, icon: Icon }) => {
        const active = user.playMode === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (!active) void setPlayMode(id)
            }}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07060b]',
              active
                ? id === 'online'
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-[0_0_18px_rgba(217,164,65,0.35)]'
                  : 'bg-amber-400 text-black shadow-[0_0_18px_rgba(245,158,11,0.35)]'
                : 'text-white/65 hover:bg-white/[0.06] hover:text-white'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t(id)}</span>
          </button>
        )
      })}
    </div>
  )
}
