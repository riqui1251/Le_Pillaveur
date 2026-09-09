"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, RotateCcw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useLocalizedGames } from '@/lib/games-i18n'
import { GameIconById } from '@/components/hub/GameIconById'

type ReplayMate = { userId: string; displayName: string }

type HistoryEntry = {
  gameId: string
  lastPlayedAt: string
  playCount: number
  softModeReady: boolean
  /** Partenaires humains de la dernière table, encore invitables (voir /api/online/history) */
  mates: ReplayMate[]
}

/** Proposition ouverte au clic « Rejouer » quand la table précédente avait des humains. */
type ReplayProposal = {
  gameId: string
  path: string
  gameTitle: string
  mates: ReplayMate[]
}

/**
 * « Vos dernières tables » : les 3-5 derniers jeux joués en ligne, avec un
 * bouton Rejouer qui recrée une table privée. Strictement « rejouer » — la
 * reprise d'une partie en cours reste l'affaire de RejoinBanner.
 *
 * Rejouer PROPOSE de reconvoquer les partenaires de la dernière table (on ne
 * lance jamais d'invitations dans le dos du joueur : il voit les noms et
 * décide) ; sans partenaire invitable, le clic ouvre directement la table.
 */
export function RecentGamesRow() {
  const { user } = useAuth()
  const { room, createRoom, loading } = useOnlineRoom()
  const t = useTranslations('hub.jeuxOnline.recent')
  const router = useRouter()
  const games = useLocalizedGames()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [replayingId, setReplayingId] = useState<string | null>(null)
  const [proposal, setProposal] = useState<ReplayProposal | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!user || user.playMode !== 'online' || fetchedRef.current) return
    fetchedRef.current = true
    void (async () => {
      try {
        const res = await fetch('/api/online/history', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          const rows: HistoryEntry[] = Array.isArray(data?.history)
            ? data.history.map((h: HistoryEntry) => ({
                ...h,
                mates: Array.isArray(h?.mates) ? h.mates : [],
              }))
            : []
          setHistory(rows)
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

  const startReplay = async (gameId: string, path: string, mateIds: string[]) => {
    setReplayingId(gameId)
    try {
      const created = await createRoom(gameId, { visibility: 'private' })
      if (!created) return
      // Invitations tolérantes : un ami perdu entre-temps, un compte supprimé
      // ou banni fait échouer SON invitation, jamais l'ouverture de la table.
      if (mateIds.length > 0) {
        await Promise.allSettled(
          mateIds.map((friendUserId) =>
            fetch(`/api/online/rooms/${created.id}/invite`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ friendUserId }),
            })
          )
        )
      }
      router.push(path)
    } finally {
      setReplayingId(null)
      setProposal(null)
    }
  }

  const handleReplay = (entry: HistoryEntry, gameId: string, path: string, gameTitle: string) => {
    if (loading || replayingId) return
    if (entry.mates.length === 0) {
      void startReplay(gameId, path, [])
      return
    }
    setProposal({ gameId, path, gameTitle, mates: entry.mates })
    setSelectedIds(entry.mates.map((m) => m.userId))
  }

  const toggleMate = (userId: string) => {
    setSelectedIds((ids) =>
      ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]
    )
  }

  const busy = loading || replayingId !== null

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
            disabled={busy}
            onClick={() => handleReplay(entry, game.id, game.path, game.title)}
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

      {proposal && (
        <div className="mt-2 rounded-2xl border border-amber-400/25 bg-white/[0.05] p-3 backdrop-blur-md">
          <p className="text-xs font-semibold text-white">
            {t('inviteTitle', { game: proposal.gameTitle })}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">{t('inviteHint')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {proposal.mates.map((mate) => {
              const on = selectedIds.includes(mate.userId)
              return (
                <button
                  key={mate.userId}
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => toggleMate(mate.userId)}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-60 ${
                    on
                      ? 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                      : 'border-white/10 bg-white/[0.03] text-white/45'
                  }`}
                >
                  {on && <Check className="h-2.5 w-2.5" />}
                  <span className="max-w-[8rem] truncate">{mate.displayName}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void startReplay(proposal.gameId, proposal.path, selectedIds)}
              className="rounded-xl bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-amber-400 disabled:opacity-60"
            >
              {replayingId
                ? t('replaying')
                : selectedIds.length > 0
                  ? t('inviteConfirm', { count: selectedIds.length })
                  : t('createAlone')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setProposal(null)}
              className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:text-white disabled:opacity-60"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
