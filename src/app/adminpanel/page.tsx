"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  getStoredPlayers,
  updatePlayerAdminBoost,
  type Player,
  type AdminBoost,
} from "@/lib/players"
import { GAMES } from "@/lib/games"
import { BarChart3, Shield, Trophy, Users } from "lucide-react"

const BOOST_GAMES: { id: keyof AdminBoost; label: string; desc: string }[] = [
  { id: "pmu", label: "PMU", desc: "+ chance de victoire" },
  { id: "purple", label: "Purple", desc: "+ chance paris gagnant" },
  { id: "petit-buveur", label: "Petit Buveur", desc: "- cases négatives, + avancer loin" },
  { id: "plinko", label: "Plinko", desc: "+ chance de donner des gorgées" },
  { id: "monsieur-3", label: "Monsieur 3", desc: "- chance d'être M3, + faire boire M3" },
]

export default function AdminPanelPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("")
  const [boostValues, setBoostValues] = useState<Record<string, number>>({})

  const loadPlayers = useCallback(() => {
    setPlayers(getStoredPlayers())
  }, [])

  useEffect(() => {
    loadPlayers()
  }, [loadPlayers])

  useEffect(() => {
    const p = players.find((x) => x.id === selectedPlayerId)
    const b = p?.preferences?.adminBoost || {}
    setBoostValues({
      pmu: (b.pmu ?? 0),
      purple: (b.purple ?? 0),
      "petit-buveur": (b["petit-buveur"] ?? 0),
      plinko: (b.plinko ?? 0),
      "monsieur-3": (b["monsieur-3"] ?? 0),
    })
  }, [selectedPlayerId, players])

  // Stats globales
  const totalPlayers = players.length
  const totalGamesPlayed = players.reduce((sum, p) => sum + (p.stats?.gamesPlayed || 0), 0)
  const totalWins = players.reduce((sum, p) => sum + (p.stats?.wins || 0), 0)

  // Parties par jeu
  const gamesByType: Record<string, number> = {}
  players.forEach((p) => {
    if (p.stats?.gameStats) {
      Object.entries(p.stats.gameStats).forEach(([gameId, stats]) => {
        gamesByType[gameId] = (gamesByType[gameId] || 0) + (stats.gamesPlayed || 0)
      })
    }
  })

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId)

  const handleApplyBoost = () => {
    if (!selectedPlayerId) return
    const newBoost: AdminBoost = {
      pmu: Math.max(0, Math.min(100, boostValues.pmu ?? 0)),
      purple: Math.max(0, Math.min(100, boostValues.purple ?? 0)),
      "petit-buveur": Math.max(0, Math.min(100, boostValues["petit-buveur"] ?? 0)),
      plinko: Math.max(0, Math.min(100, boostValues.plinko ?? 0)),
      "monsieur-3": Math.max(0, Math.min(100, boostValues["monsieur-3"] ?? 0)),
    }
    updatePlayerAdminBoost(selectedPlayerId, newBoost)
    loadPlayers()
  }

  const handleResetBoost = () => {
    if (!selectedPlayerId) return
    updatePlayerAdminBoost(selectedPlayerId, {})
    setBoostValues({
      pmu: 0,
      purple: 0,
      "petit-buveur": 0,
      plinko: 0,
      "monsieur-3": 0,
    })
    loadPlayers()
  }

  const setBoost = (gameId: string, v: number) => {
    setBoostValues((prev) => ({ ...prev, [gameId]: Math.max(0, Math.min(100, v)) }))
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
          <Shield className="h-8 w-8 text-amber-600 dark:text-amber-500" />
          Panneau Admin
        </h1>
        <p className="text-stone-600 dark:text-stone-400 mt-1">
          Statistiques et boost secret des joueurs (modifie les probabilités en jeu)
        </p>
      </div>

      {/* Statistiques globales */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <Card className="border border-stone-300 shadow-md bg-stone-200 dark:bg-stone-800 dark:border-stone-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-stone-800 dark:text-stone-200">Parties jouées</CardTitle>
            <BarChart3 className="h-4 w-4 text-stone-600 dark:text-stone-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{totalGamesPlayed}</div>
          </CardContent>
        </Card>
        <Card className="border border-stone-300 shadow-md bg-stone-200 dark:bg-stone-800 dark:border-stone-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-stone-800 dark:text-stone-200">Joueurs</CardTitle>
            <Users className="h-4 w-4 text-stone-600 dark:text-stone-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{totalPlayers}</div>
          </CardContent>
        </Card>
        <Card className="border border-stone-300 shadow-md bg-stone-200 dark:bg-stone-800 dark:border-stone-600">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-stone-800 dark:text-stone-200">Victoires totales</CardTitle>
            <Trophy className="h-4 w-4 text-stone-600 dark:text-stone-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-stone-900 dark:text-stone-100">{totalWins}</div>
          </CardContent>
        </Card>
      </div>

      {/* Parties par jeu */}
      <Card className="border border-stone-300 shadow-md bg-stone-200 dark:bg-stone-800 dark:border-stone-600 mb-8">
        <CardHeader>
          <CardTitle className="text-stone-800 dark:text-stone-200">Parties par jeu</CardTitle>
          <CardDescription className="text-stone-600 dark:text-stone-400">Nombre de parties jouées par type de jeu</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {Object.entries(gamesByType)
              .sort(([, a], [, b]) => b - a)
              .map(([gameId, count]) => {
                const game = GAMES.find((g) => g.id === gameId)
                return (
                  <div
                    key={gameId}
                    className="flex items-center justify-between py-2 border-b border-stone-300 dark:border-stone-600 last:border-0"
                  >
                    <span className="font-medium text-stone-800 dark:text-stone-200">
                      {game?.emoji} {game?.title ?? gameId}
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">{count}</span>
                  </div>
                )
              })}
            {Object.keys(gamesByType).length === 0 && (
              <p className="text-center text-stone-500 dark:text-stone-400 py-4">Aucune donnée</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Boost secret */}
      <Card className="border border-amber-300 shadow-md bg-amber-100 dark:bg-amber-900/40 dark:border-amber-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <Shield className="h-5 w-5" />
            Boost secret (% chance supplémentaire)
          </CardTitle>
          <CardDescription className="text-amber-800 dark:text-amber-300">
            Modifie les probabilités en jeu pour favoriser le joueur. Les autres jeux ne sont pas affectés.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
              Joueur à booster
            </label>
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full h-10 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm"
            >
              <option value="">-- Choisir un joueur --</option>
              {players.map((p) => {
                const hasBoost = p.preferences?.adminBoost && Object.values(p.preferences.adminBoost).some((v) => (v ?? 0) > 0)
                return (
                  <option key={p.id} value={p.id}>
                    {p.preferences?.icon} {p.name}
                    {hasBoost && " • boost actif"}
                  </option>
                )
              })}
            </select>
          </div>

          {selectedPlayer && (
            <>
              <div className="space-y-4">
                {BOOST_GAMES.map(({ id, label, desc }) => (
                  <div key={id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1">
                      <span className="font-medium text-stone-800 dark:text-stone-200">{label}</span>
                      <span className="text-xs text-stone-500 dark:text-stone-400 ml-2">({desc})</span>
                    </div>
                    <div className="flex items-center gap-2 sm:w-48">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={boostValues[id] ?? 0}
                        onChange={(e) => setBoost(id, parseInt(e.target.value, 10))}
                        className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-stone-300 dark:bg-stone-600"
                      />
                      <span className="text-sm font-mono w-10 text-stone-700 dark:text-stone-300">
                        {boostValues[id] ?? 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  onClick={handleApplyBoost}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Appliquer le boost
                </Button>
                <Button variant="outline" onClick={handleResetBoost}>
                  Réinitialiser tout
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
