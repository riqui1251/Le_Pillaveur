"use client"

import { Smartphone, Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/components/providers/AuthProvider'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

type PlayMode = 'local' | 'online'

const MODES: { id: PlayMode; icon: typeof Smartphone }[] = [
  { id: 'local', icon: Smartphone },
  { id: 'online', icon: Globe },
]

export function PlayModeToggle({ className }: { className?: string }) {
  const t = useTranslations('hub.playMode')
  const { user, setPlayMode, loading } = useAuth()
  const router = useRouter()

  // Le visiteur sans compte ne voyait aucune bascule : il ignorait donc que le
  // mode local existe. On l'affiche pour lui, positionnée sur « local » — c'est
  // déjà l'état réel de la vitrine (isOnline se déduit de user.playMode).
  const isVisitor = !user

  if (loading) return null

  const activeMode: PlayMode = user ? user.playMode : 'local'

  // Le mode en ligne réclame une session (PUT /api/auth/mode répond 401 sans
  // compte) : pour un visiteur, la bascule mène à la page compte au lieu de
  // rater silencieusement. « Local » se pose, lui, via le cookie dédié — même
  // porte d'entrée que le bouton « jouer en local » du formulaire de compte.
  const selectMode = (mode: PlayMode) => {
    if (!isVisitor) {
      if (mode !== activeMode) void setPlayMode(mode)
      return
    }
    if (mode === 'online') {
      router.push('/compte?redirect=/jeux')
      return
    }
    void fetch('/api/auth/local-play', { method: 'POST', credentials: 'include' })
      .then(() => router.refresh())
      .catch(() => {
        // Cookie non posé : le visiteur passera par /compte au premier lien
        // protégé, le parcours reste praticable.
      })
  }

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
        const active = activeMode === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            title={isVisitor && id === 'online' ? t('onlineNeedsAccount') : undefined}
            onClick={() => selectMode(id)}
            className={cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-sm font-semibold transition-all',
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
