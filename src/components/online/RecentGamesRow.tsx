"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { RotateCcw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useLocalizedGames } from '@/lib/games-i18n'
import { GameIconById } from '@/components/hub/GameIconById'

type HistoryEntry = {
  gameId: string
  lastPlayedAt: string
  playCount: number
  softModeReady: boolean
}

/**
 * « Vos dernières tables » : les 3-5 derniers jeux joués en ligne, avec un
 * bouton Rejouer qui recrée une table privée. Strictement « rejouer » — la
 * reprise d'une partie en cours reste l'affaire de RejoinBanner.
 */
export function RecentGamesRow() {
  const { user } = useAuth()
  const { room, createRoom, loading } = useOnlineRoom()
  const t = useTranslations('hub.jeuxOnline.recent')
  const router = useRouter()
  const games = useLocalizedGames()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [replayingId, setReplayingId] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!user || user.playMode !== 'online' || fetchedRef.current) return
    fetchedRef.current = true
    void (async () => {
      try {
        const res = await fetch('/api/online/history', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setHistory(Array.isArray(data?.history) ? data.history : [])
        }
      } catch {
        // pas d'historique, pas de rangée — jamais bloquant
      }
    })()
  }, [user?.id, user?.playMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Une table active se gère via RejoinBanner / le lobby du jeu.
  if (!user || user.playMode !== 'online' || room) return null

  const soft = user.ambianceMode === 'soft'
  const entries = history
    .filter((h) => (soft ? h.softModeReady : true))
    .map((h) => ({ entry: h, game: games.find((g) => g.id === h.gameId) }))
    .filter((x): x is { entry: HistoryEntry; game: NonNullable<typeof x.game> } => Boolean(x.game))

  if (entries.length === 0) return null

  const handleReplay = async (gameId: string, path: string) => {
    if (loading || replayingId) return
    setReplayingId(gameId)
    try {
      const created = await createRoom(gameId, { visibility: 'private' })
      if (created) router.push(path)
    } finally {
      setReplayingId(null)
    }
  }

  return (
    <div className="mb-4">
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">
        {t('title')}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map(({ entry, game }) => (
          <button
            key={entry.gameId}
            type="button"
            disabled={loading || replayingId !== null}
            onClick={() => void handleReplay(game.id, game.path)}
            className="group flex shrink-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] py-2 pl-2.5 pr-3 text-left backdrop-blur-md transition-all duration-200 hover:border-amber-400/35 hover:bg-amber-500/10 active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-amber-200">
              <GameIconById id={game.id} className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block max-w-[9rem] truncate text-xs font-semibold text-white">
                {game.title}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-amber-300/80">
                {replayingId === entry.gameId ? (
                  t('replaying')
                ) : (
                  <>
                    <RotateCcw className="h-2.5 w-2.5" />
                    {t('replay')}
                  </>
                )}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
