"use client"

import { Smartphone, Globe } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { cn } from '@/lib/utils'

export function PlayModeSelector() {
  const { user, setPlayMode, loading } = useAuth()

  if (loading || !user) return null

  const modes = [
    {
      id: 'local' as const,
      label: 'Mode local',
      desc: 'Vos joueurs sont sauvegardés sur votre compte et suivent sur tous vos appareils.',
      icon: Smartphone,
    },
    {
      id: 'online' as const,
      label: 'Mode en ligne',
      desc: 'Rejoignez une salle et jouez avec d\'autres personnes connectées.',
      icon: Globe,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {modes.map(({ id, label, desc, icon: Icon }) => {
        const active = user.playMode === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setPlayMode(id)}
            className={cn(
              'rounded-2xl border p-4 text-left transition-all',
              active
                ? 'border-amber-400/50 bg-amber-500/15 shadow-[0_0_24px_rgba(245,158,11,0.15)]'
                : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <Icon className={cn('h-5 w-5', active ? 'text-amber-300' : 'text-white/50')} />
              <span className={cn('font-semibold', active ? 'text-amber-100' : 'text-white/80')}>
                {label}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-white/50">{desc}</p>
          </button>
        )
      })}
    </div>
  )
}
