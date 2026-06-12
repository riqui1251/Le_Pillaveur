"use client"

import { useState, useMemo } from 'react'
import { usePlayers } from '@/hooks/usePlayers'
import { Trophy, Star, ChevronDown } from 'lucide-react'
import { Player } from '@/lib/players'
import { GAMES } from '@/lib/games'
import { getMetricsForGame } from '@/lib/gameMetrics'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { cn } from '@/lib/utils'

const MEDALS = ['🥇', '🥈', '🥉']

function PlayerRow({ player, index, metric }: { player: Player; index: number; metric: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 transition-colors hover:bg-white/[0.06]">
      <span className="w-6 shrink-0 text-center text-base">
        {index < 3 ? MEDALS[index] : <span className="text-sm text-white/40 font-medium">{index + 1}</span>}
      </span>
      <PlayerIcon player={player} size="md" />
      <span className="flex-1 truncate text-sm font-medium">
        <PlayerName player={player} />
      </span>
      <span className="shrink-0 text-sm font-semibold text-amber-300">{metric}</span>
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        <span className="text-amber-300">{icon}</span>
        <h2 className="text-sm font-semibold text-white/80">{title}</h2>
      </div>
      <div className="space-y-1.5 p-3">{children}</div>
    </div>
  )
}

export default function ClassementPage() {
  const { players, topPlayers, mostActivePlayers } = usePlayers()
  const [activeTab, setActiveTab] = useState<'global' | 'jeu'>('global')
  const [selectedGame, setSelectedGame] = useState(GAMES[0].id)
  const [selectedMetricByGame, setSelectedMetricByGame] = useState<Record<string, string>>({})
  const [gamePickerOpen, setGamePickerOpen] = useState(false)

  const totalGamesPlayedAll = players.reduce((s, p) => s + (p.stats.gamesPlayed || 0), 0)

  const currentGame = GAMES.find(g => g.id === selectedGame)!
  const metrics = useMemo(() => getMetricsForGame(selectedGame), [selectedGame])
  const currentMetricId = selectedMetricByGame[selectedGame] || metrics[0]?.id || ''
  const currentMetric = metrics.find(m => m.id === currentMetricId) || metrics[0]

  const gameRanking = useMemo(() => {
    if (!currentMetric) return []
    return [...players]
      .filter(p => (currentMetric.getValue(p) ?? 0) > 0)
      .sort((a, b) => currentMetric.getValue(b) - currentMetric.getValue(a))
      .slice(0, 10)
  }, [players, currentMetric])

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07060b] text-white">
      {/* Halos */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-amber-500/20 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-violet-600/25 blur-[110px]" />
        <div
          className="absolute inset-0 opacity-[0.3]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
      </div>

      <div className="relative container mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        {/* Header */}
        <header className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/70">Le Pillaveur</p>
          <h1 className="mt-1 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">
            Classement
          </h1>
          <p className="mt-2 text-sm text-white/50">
            {players.length} joueurs · {totalGamesPlayedAll} parties · {GAMES.length} jeux
          </p>
        </header>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          <button
            onClick={() => setActiveTab('global')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-all',
              activeTab === 'global'
                ? 'bg-amber-500/20 text-amber-100 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.25)]'
                : 'text-white/50 hover:text-white/80'
            )}
          >
            <Trophy className="h-4 w-4" />
            Global
          </button>
          <button
            onClick={() => setActiveTab('jeu')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-all',
              activeTab === 'jeu'
                ? 'bg-amber-500/20 text-amber-100 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.25)]'
                : 'text-white/50 hover:text-white/80'
            )}
          >
            <Star className="h-4 w-4" />
            Par jeu
          </button>
        </div>

        {/* Vue Global */}
        {activeTab === 'global' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Section icon={<Trophy className="h-4 w-4" />} title="Top victoires">
              {topPlayers.slice(0, 10).length === 0 ? (
                <p className="py-6 text-center text-sm text-white/30">Aucune donnée</p>
              ) : topPlayers.slice(0, 10).map((player, i) => (
                <PlayerRow key={player.id} player={player} index={i} metric={`${player.stats.wins || 0} vic.`} />
              ))}
            </Section>
            <Section icon={<Star className="h-4 w-4" />} title="Plus actifs">
              {mostActivePlayers.slice(0, 10).length === 0 ? (
                <p className="py-6 text-center text-sm text-white/30">Aucune donnée</p>
              ) : mostActivePlayers.slice(0, 10).map((player, i) => (
                <PlayerRow key={player.id} player={player} index={i} metric={`${player.stats.gamesPlayed || 0} parties`} />
              ))}
            </Section>
          </div>
        )}

        {/* Vue par jeu */}
        {activeTab === 'jeu' && (
          <div className="space-y-4">
            {/* Sélecteur de jeu */}
            <div className="relative">
              <button
                onClick={() => setGamePickerOpen(o => !o)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.07]"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `linear-gradient(135deg, ${currentGame.colorFrom}, ${currentGame.colorTo})` }}
                >
                  <span className="text-lg">{currentGame.emoji}</span>
                </span>
                <span className="flex-1 text-left font-semibold text-white">{currentGame.title}</span>
                <ChevronDown className={cn('h-4 w-4 text-white/40 transition-transform', gamePickerOpen && 'rotate-180')} />
              </button>

              {gamePickerOpen && (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#0e0d17] shadow-2xl">
                  {GAMES.map(g => (
                    <button
                      key={g.id}
                      onClick={() => { setSelectedGame(g.id); setGamePickerOpen(false) }}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.06]',
                        g.id === selectedGame ? 'text-amber-200' : 'text-white/70'
                      )}
                    >
                      <span>{g.emoji}</span>
                      {g.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Sélecteur de métrique */}
            {metrics.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {metrics.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMetricByGame(prev => ({ ...prev, [selectedGame]: m.id }))}
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-xs font-medium transition-all',
                      (currentMetricId === m.id)
                        ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                        : 'border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white/80'
                    )}
                  >
                    {m.icon ?? '📈'} {m.title}
                  </button>
                ))}
              </div>
            )}

            {/* Résultats */}
            <Section icon={<span>{currentGame.emoji}</span>} title={currentMetric?.title ?? 'Classement'}>
              {gameRanking.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/30">Aucune donnée pour ce jeu</p>
              ) : gameRanking.map((player, i) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  index={i}
                  metric={currentMetric?.format
                    ? currentMetric.format(currentMetric.getValue(player))
                    : String(currentMetric?.getValue(player) ?? 0)
                  }
                />
              ))}
            </Section>
          </div>
        )}
      </div>
    </main>
  )
}
