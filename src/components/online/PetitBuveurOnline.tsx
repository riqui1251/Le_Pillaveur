"use client"

import { useState } from 'react'
import { Dice5, Crown, LogOut, RotateCcw, Beer } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EngineState } from '@/lib/petit-buveur/engine'

/**
 * Écran de jeu Petit Buveur EN LIGNE (serveur-autoritaire).
 *
 * Version fonctionnelle minimale : affiche l'état poussé par le serveur (via SSE
 * + polling de `useOnlineRoom`) et envoie des actions à `POST /.../action`. Le
 * moteur tourne côté serveur ; le client ne fait qu'afficher + demander. La
 * refonte visuelle complète (parité avec le mode local) viendra avec le rewire
 * de `game.tsx`.
 */

const BOARD_SIZE = 30

/** Vue client de l'état moteur (rngState absent de la réponse serveur). */
type EngineView = Omit<EngineState, 'rngState'>

function parseView(json: string | null | undefined): EngineView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as EngineView
    return Array.isArray(v.players) ? v : null
  } catch {
    return null
  }
}

export function PetitBuveurOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const [busy, setBusy] = useState(false)

  const inGame = room?.gameId === 'petit-buveur' && room.status === 'playing'

  // Tant que la partie n'est pas lancée : le lobby existant gère création/join/prêt/lancer.
  if (!inGame) {
    return <GameOnlineLobby gameId="petit-buveur" />
  }

  const view = parseView(room.gameStateJson)
  if (!view || !user) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      </div>
    )
  }

  const active = view.players[view.currentPlayer]
  const isMyTurn = active?.id === user.id
  const finished = view.phase === 'finished' || Boolean(view.winner)
  const winner = view.winner ? view.players.find((p) => p.id === view.winner) : null
  const rematchVotes = (view as { rematchVotes?: string[] }).rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)

  const sendAction = async (action: 'roll' | 'resolve') => {
    if (!room || busy) return
    setBusy(true)
    try {
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, expectedVersion: room.stateVersion }),
      })
      // Le serveur diffuse le nouvel état (SSE) → useOnlineRoom rafraîchit la vue.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
      <div className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-300/70">Petit Buveur — En ligne</p>
          <p className="text-sm text-white/60">Tour {view.turnCount}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => leaveRoom()}
          className="text-white/50 hover:text-red-300"
        >
          <LogOut className="mr-1 h-4 w-4" />
          Quitter
        </Button>
      </div>

      {/* Joueurs */}
      <div className="space-y-2">
        {view.players.map((p, i) => {
          const isActive = i === view.currentPlayer && !finished
          const isSelf = p.id === user.id
          return (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                isActive
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-white/10 bg-white/[0.03]'
              )}
            >
              <span className="text-lg">{winner?.id === p.id ? '🏆' : isActive ? '🎯' : '🎮'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-white">
                  {p.name}
                  {isSelf && <span className="ml-1 text-xs text-white/40">(vous)</span>}
                </p>
                <p className="text-xs text-white/45">
                  Case {p.position + 1}/{BOARD_SIZE}
                  {p.protected && ' · 🛡️'}
                  {p.cursed > 0 && ` · ☠️${p.cursed}`}
                  {p.skipNextTurn && ' · ⏭️'}
                  {p.anchored && ' · ⚓'}
                </p>
              </div>
              <span className="flex items-center gap-1 text-sm text-amber-200">
                <Beer className="h-4 w-4" />
                {p.drinks}
              </span>
            </div>
          )
        })}
      </div>

      {/* Dernier évènement */}
      {view.lastDice != null && (
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center text-sm text-white/60">
          Dé : <span className="font-bold text-white">{view.lastDice}</span>
          {view.lastCase && (
            <> · Case : <span className="font-medium text-amber-200">{view.lastCase.type}</span></>
          )}
        </div>
      )}

      {/* Zone d'action */}
      <div className="mt-auto space-y-3">
        {finished ? (
          <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-center">
            <p className="flex items-center justify-center gap-2 text-lg font-bold text-white">
              <Crown className="h-5 w-5 text-amber-400" />
              {winner ? `${winner.name} a gagné !` : 'Partie terminée'}
            </p>
            <Button
              onClick={() => voteRematch()}
              disabled={iVotedRematch}
              className="w-full bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {iVotedRematch
                ? `En attente… (${rematchVotes.length}/${view.players.length})`
                : 'Rejouer'}
            </Button>
          </div>
        ) : isMyTurn ? (
          view.pending ? (
            <Button
              onClick={() => sendAction('resolve')}
              disabled={busy}
              className="w-full bg-violet-600 py-6 text-lg font-bold text-white hover:bg-violet-500"
            >
              {busy ? '…' : `Continuer (${view.pending.caseType})`}
            </Button>
          ) : (
            <Button
              onClick={() => sendAction('roll')}
              disabled={busy}
              className="w-full bg-amber-500 py-6 text-lg font-bold text-black hover:bg-amber-400"
            >
              <Dice5 className="mr-2 h-6 w-6" />
              {busy ? '…' : 'Lancer le dé'}
            </Button>
          )
        ) : (
          <p className="py-4 text-center text-sm text-white/50">
            En attente de <span className="font-medium text-white/80">{active?.name}</span>…
          </p>
        )}
      </div>
    </div>
  )
}
