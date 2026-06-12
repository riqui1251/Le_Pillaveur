"use client"



import { useState, useEffect } from 'react'

import Game from '@/app/games/monsieur-3/components/game'

import { usePlayers } from '@/hooks/usePlayers'

import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'

import { useRouter } from 'next/navigation'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { getColorFromClass } from '@/lib/playerUtils'

import Link from 'next/link'

import { ArrowLeft } from 'lucide-react'

import { useIsOnlineMode } from '@/components/online/OnlineGameGate'

import { OnlineLobbyPanel } from '@/components/online/OnlineLobbyPanel'

import { useOnlineGameSync } from '@/hooks/useOnlineGameSync'

import type { Monsieur3SyncedState } from '@/lib/online-game-state'



export default function Monsieur3Page() {

  const { players } = usePlayers()

  const { selectedIds } = useSelectedPlayers()

  const router = useRouter()

  const isOnline = useIsOnlineMode()

  const [gameStarted, setGameStarted] = useState(false)



  const {

    isPlayingOnline,

    onlinePlayers,

    onlineSync,

    handleLeaveToMenu,

  } = useOnlineGameSync<Monsieur3SyncedState>({ gameId: 'monsieur-3' })



  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const activePlayers = isOnline ? onlinePlayers : selectedPlayers

  const canStart = activePlayers.length >= 2



  useEffect(() => {

    if (isPlayingOnline && !gameStarted) setGameStarted(true)

    if (!isPlayingOnline && gameStarted && isOnline) setGameStarted(false)

  }, [isPlayingOnline, gameStarted, isOnline])



  if (gameStarted && (canStart || isPlayingOnline)) {

    return (

      <Game

        key={onlineSync ? `${onlineSync.roomId}-${onlineSync.stateVersion}` : 'local'}

        players={activePlayers}

        onGameEnd={() => {

          if (isOnline) void handleLeaveToMenu()

          else router.push('/jeux')

        }}

        onlineSync={onlineSync}

      />

    )

  }



  if (selectedPlayers.length >= 2 && !isOnline) {

    return <Game players={selectedPlayers} onGameEnd={() => router.push('/jeux')} />

  }



  return (

    <div className="min-h-screen bg-[#07060b] text-white">

      <div className="pointer-events-none fixed inset-0 -z-10">

        <div className="absolute inset-0 bg-[#07060b]" />

        <div className="absolute -top-32 left-1/4 h-[28rem] w-[28rem] rounded-full bg-red-600/12 blur-[120px]" />

        <div className="absolute bottom-0 right-1/4 h-[24rem] w-[24rem] rounded-full bg-indigo-600/10 blur-[100px]" />

      </div>



      <div className="mx-auto max-w-md px-4 py-8 space-y-5">

        <div className="flex items-center gap-4">

          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-red-600 to-rose-700 text-3xl shadow-xl">

            🎲

          </div>

          <div>

            <h1 className="text-2xl font-black tracking-tight text-white">Monsieur 3</h1>

            <p className="text-sm text-white/40">Jeu de dés · 2+ joueurs</p>

          </div>

          <Link

            href="/jeux"

            className="ml-auto rounded-xl border border-white/10 bg-white/[0.05] p-2.5 text-white/50 transition hover:bg-white/10 hover:text-white"

            aria-label="Retour aux jeux"

          >

            <ArrowLeft className="h-4 w-4" />

          </Link>

        </div>



        {isOnline && <OnlineLobbyPanel gameId="monsieur-3" />}



        {!isOnline && (

          <>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">

              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">

                Joueurs — {selectedPlayers.length}

              </p>

              {selectedPlayers.length === 0 ? (

                <p className="text-sm italic text-white/30">Aucun joueur sélectionné</p>

              ) : (

                <div className="flex flex-wrap gap-2">

                  {selectedPlayers.map(p => {

                    const bg = getColorFromClass(p.preferences?.color ?? '')

                    return (

                      <div key={p.id} className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1.5">

                        <Avatar className="h-6 w-6 border border-white/20" style={{ backgroundColor: bg }}>

                          <AvatarFallback className="text-[10px] font-bold text-white" style={{ backgroundColor: bg }}>

                            {p.preferences?.icon || p.name.charAt(0).toUpperCase()}

                          </AvatarFallback>

                          {p.preferences?.avatar && <AvatarImage src={p.preferences.avatar} alt={p.name} />}

                        </Avatar>

                        <span className="text-sm font-medium text-white/80">{p.name}</span>

                      </div>

                    )

                  })}

                </div>

              )}

            </div>



            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-2.5 text-sm text-white/55">

              <p className="text-[11px] font-semibold uppercase tracking-widest text-red-400/70 mb-3">Règles</p>

              <p>🎲 Le premier joueur qui fait un <strong className="text-white/80">3</strong> devient <strong className="text-red-400">Monsieur 3</strong>.</p>

              <p>🍺 Monsieur 3 boit si un dé ou la somme vaut <strong className="text-white/80">3</strong>.</p>

              <p>🤸 Somme = <strong className="text-white/80">5</strong> : bras en croix + &ldquo;Whoo !&rdquo; — le dernier boit.</p>

              <p>👆 Somme = <strong className="text-white/80">8</strong> : pouce sur le front — le dernier boit.</p>

              <p>⚔️ <strong className="text-white/80">Double</strong> : le joueur choisit un adversaire pour un duel.</p>

              <p>🔄 Un joueur qui déclenche une règle <strong className="text-white/80">rejoue</strong>.</p>

              <p>🏁 La partie se termine quand Monsieur 3 fait un tour sans déclencher de règle.</p>

            </div>



            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-center text-sm text-red-200/80">

              Sélectionnez au moins 2 joueurs sur la page Joueurs.

            </div>

            <Link

              href="/joueurs"

              className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"

            >

              <ArrowLeft className="h-4 w-4" />

              Sélectionner des joueurs

            </Link>

          </>

        )}



        {isOnline && (

          <p className="text-center text-sm text-white/40">

            Rejoignez le lobby, déclarez-vous prêt, puis l&apos;hôte lance la partie.

          </p>

        )}

      </div>

    </div>

  )

}

