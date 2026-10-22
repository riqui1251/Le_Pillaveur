"use client"

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, RotateCcw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useLocalizedGames } from '@/lib/games-i18n'
import { GameIconById } from '@/components/hub/GameIconById'
import { Button } from '@/components/ui/button'

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
  const titleId = useId()

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
    // Le titre de la rangée est lu au lecteur d'écran seulement : chaque
    // puce dit déjà « Rejouer », et sa ligne de 24 px repoussait la grille.
    <section aria-labelledby={titleId} className="mb-3">
      <h2 id={titleId} className="sr-only">
        {t('title')}
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map(({ entry, game }) => (
          <button
            key={entry.gameId}
            type="button"
            disabled={busy}
            onClick={() => handleReplay(entry, game.id, game.path, game.title)}
            className="group flex min-h-[48px] shrink-0 items-center gap-2.5 rounded-2xl border border-gold/20 bg-felt-deep/70 py-1.5 pl-2 pr-3 text-left transition-all duration-200 hover:border-gold/40 hover:bg-gold/10 active:scale-[0.98] disabled:opacity-60"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-felt">
              <GameIconById id={game.id} surface="felt" className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block max-w-[9rem] truncate text-xs font-semibold text-cream">
                {game.title}
              </span>
              <span className="flex items-center gap-1 text-xs text-gold">
                {replayingId === entry.gameId ? (
                  t('replaying')
                ) : (
                  <>
                    <RotateCcw className="h-3 w-3" aria-hidden />
                    {t('replay')}
                  </>
                )}
              </span>
            </span>
          </button>
        ))}
      </div>

      {proposal && (
        <div className="mt-2 rounded-2xl border border-gold/30 bg-felt-deep/90 p-3">
          <p className="text-sm font-semibold text-cream">
            {t('inviteTitle', { game: proposal.gameTitle })}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-cream/70">{t('inviteHint')}</p>
          {/* Puces de 36 px, 44 au doigt (.touch-target) : les 8 px d'écart
              font se rejoindre les zones invisibles sans qu'elles se
              chevauchent d'une rangée à l'autre. */}
          <div className="mt-2 flex flex-wrap gap-2">
            {proposal.mates.map((mate) => {
              const on = selectedIds.includes(mate.userId)
              return (
                <button
                  key={mate.userId}
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => toggleMate(mate.userId)}
                  className={`touch-target flex h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors disabled:opacity-60 ${
                    on
                      ? 'border-amber-400/50 bg-amber-500/[0.15] text-amber-100'
                      : 'border-gold/20 bg-white/[0.03] text-cream/70 line-through decoration-cream/50'
                  }`}
                >
                  {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                  <span className="max-w-[8rem] truncate">{mate.displayName}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="game"
              disabled={busy}
              onClick={() => void startReplay(proposal.gameId, proposal.path, selectedIds)}
            >
              {replayingId
                ? t('replaying')
                : selectedIds.length > 0
                  ? t('inviteConfirm', { count: selectedIds.length })
                  : t('createAlone')}
            </Button>
            <Button type="button" variant="quiet" size="game" disabled={busy} onClick={() => setProposal(null)}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
