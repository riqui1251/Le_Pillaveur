"use client"

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Play } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { Button } from '@/components/ui/button'
import { GameIconById } from '@/components/hub/GameIconById'

const POLL_MS = 5000

type Rejoinable = {
  roomId: string
  code: string
  gameId: string
  graceLeftMs: number
}

interface RejoinBannerProps {
  onJoin: (roomId: string) => void
  joining?: boolean
}

/** Bannière « partie en cours » : le joueur parti peut reprendre sa place avant d'être remplacé par un bot. */
export function RejoinBanner({ onJoin, joining }: RejoinBannerProps) {
  const { user } = useAuth()
  const t = useTranslations('onlineLobby.rejoin')
  const [rejoinable, setRejoinable] = useState<Rejoinable | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!user || user.playMode !== 'online') {
      setRejoinable(null)
      return
    }
    const fetchRejoinable = async () => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const res = await fetch('/api/online/rooms/rejoinable', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setRejoinable(data?.rejoinable ?? null)
        }
      } finally {
        inFlightRef.current = false
      }
    }
    void fetchRejoinable()
    const timer = setInterval(fetchRejoinable, POLL_MS)
    return () => clearInterval(timer)
  }, [user?.id, user?.playMode]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rejoinable) return null

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-full bg-emerald-500/20">
          <GameIconById id={rejoinable.gameId} className="h-4 w-4 text-emerald-200" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-100">{t('title')}</p>
          <p className="text-[11px] text-emerald-200/60">
            {t('botCountdown', { seconds: Math.ceil(rejoinable.graceLeftMs / 1000) })}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        disabled={joining}
        onClick={() => onJoin(rejoinable.roomId)}
        className="shrink-0 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
      >
        <Play className="mr-1 h-3.5 w-3.5" />
        {t('cta')}
      </Button>
    </div>
  )
}
