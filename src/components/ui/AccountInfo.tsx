/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect } from 'react'
import { Trash2, User, BarChart3, Gamepad2, Calendar, LogOut, Users } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { isSpecialPlayer, getSpecialEffectClass, getColorFromClass } from '@/lib/playerUtils'
import { getSafeStorage } from '@/lib/storage'
import { GAMES } from '@/lib/games'
import { cn } from '@/lib/utils'

interface AccountInfoProps {
  onLogout: () => void
}

const GAME_NAMES: Record<string, string> = Object.fromEntries(
  GAMES.map((g) => [g.id, g.title])
)

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
      <span className={cn('text-3xl font-bold tabular-nums', color)}>{value}</span>
      <span className="mt-1 text-xs text-white/50">{label}</span>
    </div>
  )
}

export function AccountInfo({ onLogout }: AccountInfoProps) {
  const { players, loading, removePlayer } = usePlayers()
  const [totalGames, setTotalGames] = useState(0)
  const [totalDrinks, setTotalDrinks] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    const storage = getSafeStorage()
    const storedGames = storage?.getItem('games') ?? null
    const games = storedGames ? JSON.parse(storedGames) : []

    if (games.length === 0 && players.length > 0) {
      setTotalGames(players.reduce((t, p) => t + (p.stats.gamesPlayed || 0), 0))
    } else {
      setTotalGames(games.length)
    }
    setTotalDrinks(players.reduce((t, p) => t + (p.stats.totalDrinks || 0), 0))
  }, [players])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/70">
            Le Pillaveur
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Gestion du compte</h1>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>

      {/* Stats globales */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
          <BarChart3 className="h-4 w-4 text-amber-300" />
          Statistiques globales
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Joueurs" value={players.length} color="text-amber-300" />
          <StatCard label="Parties" value={totalGames} color="text-violet-300" />
          <StatCard label="Gorgées" value={totalDrinks} color="text-rose-300" />
        </div>
      </section>

      {/* Liste joueurs */}
      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/70">
          <Users className="h-4 w-4 text-amber-300" />
          Joueurs enregistrés
        </div>

        {players.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-10 text-center">
            <User className="mb-2 h-7 w-7 text-white/20" />
            <p className="text-sm text-white/40">Aucun joueur enregistré</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((player) => {
              const bg = getColorFromClass(player.preferences.color)
              const isConfirming = confirmDelete === player.id
              return (
                <li
                  key={player.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all"
                >
                  {/* Avatar */}
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow"
                    style={{ backgroundColor: bg }}
                  >
                    {player.preferences.icon || player.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Infos */}
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-semibold', isSpecialPlayer(player) ? getSpecialEffectClass(player) : 'text-white')}>
                      {player.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45">
                      <span>{player.stats.gamesPlayed} parties</span>
                      <span>·</span>
                      <span>{player.stats.wins} victoires</span>
                      {player.stats.favoriteGame && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Gamepad2 className="h-2.5 w-2.5" />
                            {GAME_NAMES[player.stats.favoriteGame] ?? player.stats.favoriteGame}
                          </span>
                        </>
                      )}
                      {player.stats.lastPlayed ? (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-2.5 w-2.5" />
                            {new Date(player.stats.lastPlayed).toLocaleDateString('fr-FR')}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {/* Supprimer */}
                  {isConfirming ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => { removePlayer(player.id); setConfirmDelete(null) }}
                        className="rounded-lg bg-red-500/20 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30"
                      >
                        Confirmer
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(player.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-red-500/15 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Infos stockage */}
      <section>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-sm text-white/40">
          Les données sont stockées localement sur cet appareil. La synchronisation multi-appareils n'est pas encore disponible.
        </div>
      </section>
    </div>
  )
}
