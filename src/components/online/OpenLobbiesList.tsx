"use client"

import { useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, Crown, Globe, Lock, Users } from 'lucide-react'
import { useLocalizedGames } from '@/lib/games-i18n'
import type { LiveGameItem } from '@/lib/online-room'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { Button } from '@/components/ui/button'
import { GameIconById } from '@/components/hub/GameIconById'
import { RecentLaunchesPanel } from '@/components/online/RecentLaunchesPanel'
import { cn } from '@/lib/utils'

/** Pastille « ça joue en ce moment » — rouge d'enseigne, discrète mais vivante. */
export function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full rounded-full bg-suit-red/60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-suit-red" />
    </span>
  )
}

/**
 * Parties EN COURS, regroupées par jeu. Purement informatif : une partie
 * lancée ne se rejoint pas (le serveur répond `game_already_started`), donc
 * ni bouton « Rejoindre », ni code de table ici.
 * Chaque table dit son jeu, son effectif et son âge — jamais qui y joue :
 * le serveur n'envoie plus aucun pseudo de partie en cours, publique comprise
 * (cf. summarizeLiveGames). Une table fermée porte en plus un cadenas.
 */
export function LiveGamesPanel({ games, total }: { games: LiveGameItem[]; total: number }) {
  const t = useTranslations('onlineLobby')
  const catalog = useLocalizedGames()

  const byGame = useMemo(() => {
    const map = new Map<string, LiveGameItem[]>()
    for (const item of games) {
      const list = map.get(item.gameId) ?? []
      list.push(item)
      map.set(item.gameId, list)
    }
    // Le jeu le plus animé en tête.
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [games])

  // Honnêteté : ce que le plafond d'affichage laisse de côté reste compté,
  // mais annoncé comme tel.
  const hidden = Math.max(0, total - games.length)

  if (total <= 0) return null

  return (
    <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <LiveDot />
        <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          {t('live.title', { count: total })}
        </p>
        <span aria-hidden className="h-px flex-1 bg-gold/20" />
      </div>

      {byGame.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {byGame.map(([gameId, items]) => {
            const game = catalog.find((g) => g.id === gameId)
            const playerCount = items.reduce((sum, item) => sum + item.playerCount, 0)
            // Au moins une table fermée dans ce groupe : le cadenas dit
            // pourquoi ses joueurs ne sont pas nommés.
            const hasPrivate = items.some((item) => item.isPrivate)
            const freshest = items.reduce(
              (min, item) => Math.min(min, item.openedAgoMinutes),
              Number.MAX_SAFE_INTEGER
            )
            return (
              <li
                key={gameId}
                className="flex items-center gap-3 rounded-xl border border-gold/20 bg-felt/40 px-3 py-2.5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-felt-deep">
                  <GameIconById id={gameId} surface="felt" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-cream">
                    <span className="truncate">{game?.title ?? gameId}</span>
                    {hasPrivate && (
                      <Lock
                        className="h-3.5 w-3.5 shrink-0 text-cream/60"
                        aria-label={t('recentLaunches.privateTable')}
                      />
                    )}
                    {items.length > 1 && (
                      <span className="shrink-0 rounded-full border border-gold/20 bg-gold/10 px-1.5 py-px text-xs font-medium text-gold">
                        {t('live.tables', { count: items.length })}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-cream/70">
                    {playerCount > 0 && `${t('playersCount', { count: playerCount })} · `}
                    {freshest < 1 ? t('live.justOpened') : t('live.openedAgo', { minutes: freshest })}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {hidden > 0 && (
        <p className="mt-2 text-xs text-cream/70">{t('live.more', { count: hidden })}</p>
      )}
      <p className="mt-2 text-xs text-cream/60">{t('live.notJoinable')}</p>
    </section>
  )
}

/**
 * Tables ouvertes, parties en cours et derniers lancements, sur le hub EN
 * LIGNE : UNE ligne « Rejoindre » au-dessus de la grille, qui se déplie sur
 * le détail. Les trois panneaux posés en entier repoussaient la première
 * carte de jeu sous la ligne de flottaison ; la ligne dit l'essentiel (qui
 * attend, ce qui tourne) et le reste est à un toucher.
 */
export function OpenLobbiesList() {
  const router = useRouter()
  const t = useTranslations('onlineLobby')
  const { lobbies, liveGames, liveGamesTotal, recentLaunches, loading } = useOpenLobbies()
  const { joinRoom, loading: joining, error } = useOnlineRoom()
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const catalog = useLocalizedGames()

  const byGame = useMemo(() => {
    const map = new Map<string, typeof lobbies>()
    for (const lobby of lobbies) {
      const list = map.get(lobby.gameId) ?? []
      list.push(lobby)
      map.set(lobby.gameId, list)
    }
    return map
  }, [lobbies])

  const handleJoin = async (roomId: string, gameId: string) => {
    const room = await joinRoom({ roomId })
    if (room) {
      const game = catalog.find((g) => g.id === gameId)
      if (game) router.push(game.path)
    }
  }

  // Même hauteur que la ligne : rien ne saute à l'arrivée de la réponse.
  if (loading && lobbies.length === 0 && liveGamesTotal === 0 && recentLaunches.length === 0) {
    return (
      <div
        aria-busy="true"
        className="mb-3 min-h-[48px] rounded-2xl border border-gold/20 bg-felt-deep/70 motion-safe:animate-pulse"
      />
    )
  }

  // Personne n'attend ET personne ne joue : la ligne le dit sobrement (surtout
  // pas un « 0 partie en cours » qui souligne le vide), et se déplie quand
  // même sur les derniers lancements — c'est précisément l'écran vide qu'ils
  // sont là pour démentir.
  const summary = [
    lobbies.length > 0 ? t('compact.waiting', { count: lobbies.length }) : null,
    liveGamesTotal > 0 ? t('compact.live', { count: liveGamesTotal }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const hasDetail = lobbies.length > 0 || liveGamesTotal > 0 || recentLaunches.length > 0
  const lineContent = (
    <>
      {liveGamesTotal > 0 ? <LiveDot /> : <Globe className="h-4 w-4 shrink-0 text-gold" aria-hidden />}
      <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-cream">
        {summary || t('compact.empty')}
      </span>
    </>
  )
  const lineClass =
    'flex min-h-[48px] w-full items-center gap-2.5 rounded-2xl border border-gold/20 bg-felt-deep/70 px-3 py-2 text-left'

  return (
    <div className="mb-3">
      {hasDetail ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={cn(lineClass, 'transition-colors hover:border-gold/40 active:bg-gold/10')}
        >
          {lineContent}
          {lobbies.length > 0 && (
            <span className="shrink-0 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-[#24201A]">
              {t('join')}
            </span>
          )}
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-cream/70 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      ) : (
        <p className={lineClass}>{lineContent}</p>
      )}

      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

      {hasDetail && open && (
        <div id={detailId} className="mt-3 space-y-4">
          <LiveGamesPanel games={liveGames} total={liveGamesTotal} />

          {lobbies.length === 0 ? (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gold/20 px-4 py-2.5 text-xs text-cream/70">
              <Globe className="h-4 w-4 shrink-0 text-gold" aria-hidden />
              {t('list.empty')}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold text-gold">
                <Globe className="h-4 w-4" aria-hidden />
                {t('list.title', { count: lobbies.length })}
              </div>

              {Array.from(byGame.entries()).map(([gameId, gameLobbies]) => {
                const game = catalog.find((g) => g.id === gameId)
                return (
                  <div key={gameId} className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <GameIconById id={gameId} surface="felt" className="h-5 w-5 shrink-0" />
                      <p className="text-xs font-semibold uppercase tracking-widest text-gold">
                        {game?.title ?? gameId}
                      </p>
                    </div>
                    <ul className="space-y-2">
                      {gameLobbies.map((lobby) => {
                        const readyCount = lobby.members.filter((m) => m.isReady).length
                        return (
                          <li
                            key={lobby.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/20 bg-felt/40 px-4 py-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/20 bg-gold/10">
                                <Crown className="h-4 w-4 text-gold" aria-hidden />
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-bold tracking-wider text-cream">
                                    {lobby.code}
                                  </span>
                                  <span className="truncate text-sm text-cream/80">{lobby.hostName}</span>
                                </div>
                                <p className="mt-1 flex items-center gap-2 text-xs text-cream/70">
                                  <Users className="h-3.5 w-3.5" aria-hidden />
                                  {t('playersCount', { count: lobby.memberCount })}
                                  <span aria-hidden>·</span>
                                  {t('readyCount', { ready: readyCount, total: lobby.memberCount })}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              size="game"
                              disabled={joining}
                              onClick={() => handleJoin(lobby.id, lobby.gameId)}
                              className="shrink-0"
                            >
                              {t('join')}
                            </Button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </>
          )}

          <RecentLaunchesPanel items={recentLaunches} />
        </div>
      )}
    </div>
  )
}
