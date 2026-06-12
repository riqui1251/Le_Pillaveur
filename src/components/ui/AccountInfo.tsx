/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Trash2, User, BarChart3, Gamepad2, Calendar, LogOut, Users, Mail, Cloud, Shield, Copy, Check, Hash, Pencil } from 'lucide-react'
import { usePlayers } from '@/hooks/usePlayers'
import { useAuth } from '@/hooks/useAuth'
import { canAccessSupervision } from '@/lib/roles'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerCustomizer } from '@/components/ui/PlayerCustomizer'
import { Player } from '@/lib/players'
import { getSafeStorage } from '@/lib/storage'
import { GAMES } from '@/lib/games'
import { cn } from '@/lib/utils'

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

export function AccountInfo() {
  const { user, logout } = useAuth()
  const { players, loading, removePlayer, updatePlayerPreferences } = usePlayers()
  const [totalGames, setTotalGames] = useState(0)
  const [totalDrinks, setTotalDrinks] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [customizingPlayer, setCustomizingPlayer] = useState<Player | null>(null)

  const copyAccountCode = async () => {
    if (!user?.accountCode) return
    try {
      await navigator.clipboard.writeText(user.accountCode)
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

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
      <>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
        </div>
        <PlayerCustomizer
          player={customizingPlayer}
          open={customizingPlayer !== null}
          onOpenChange={(open) => { if (!open) setCustomizingPlayer(null) }}
          onSave={updatePlayerPreferences}
        />
      </>
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
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
            {user?.displayName ?? 'Mon compte'}
          </h1>
          {user?.accountCode && (
            <button
              type="button"
              onClick={copyAccountCode}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-mono text-xs text-amber-200 transition-colors hover:bg-amber-500/20"
              title="Copier le code compte"
            >
              <Hash className="h-3 w-3" />
              {user.accountCode}
              {codeCopied ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy className="h-3 w-3 opacity-60" />
              )}
            </button>
          )}
          {user?.email && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/45">
              <Mail className="h-3 w-3" />
              {user.email}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {user && canAccessSupervision(user.role) && (
            <Link
              href="/supervision"
              className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 transition-colors hover:bg-amber-500/20"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Supervision</span>
            </Link>
          )}
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
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
              const isConfirming = confirmDelete === player.id
              return (
                <li
                  key={player.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-all"
                >
                  <PlayerIcon player={player} size="md" className="h-10 w-10 text-xl" />

                  {/* Infos */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      <PlayerName player={player} />
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

                  {/* Actions */}
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
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setCustomizingPlayer(player)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-amber-500/15 hover:text-amber-300"
                        title="Personnaliser"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(player.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-red-500/15 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <PlayerCustomizer
        player={customizingPlayer}
        open={customizingPlayer !== null}
        onOpenChange={(open) => { if (!open) setCustomizingPlayer(null) }}
        onSave={updatePlayerPreferences}
      />

      {/* Sync */}
      <section>
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/80">
          <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <p>
            Vos joueurs sont sauvegardés sur votre compte et se synchronisent automatiquement
            sur tous vos appareils connectés.
          </p>
        </div>
      </section>
    </div>
  )
}
