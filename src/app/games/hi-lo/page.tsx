"use client"



import { useState, useEffect, useCallback } from 'react'

import { usePlayers } from '@/hooks/usePlayers'

import { Card } from '@/components/ui/card'

import { Button } from '@/components/ui/button'

import { Home } from 'lucide-react'

import Link from 'next/link'

import Game from './components/game'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'

import { SelectedPlayersDisplay } from '@/components/SelectedPlayersDisplay'

import { useIsOnlineMode } from '@/components/online/OnlineGameGate'

import { OnlineLobbyPanel } from '@/components/online/OnlineLobbyPanel'

import { useOnlineGameSync } from '@/hooks/useOnlineGameSync'

import { useAuth } from '@/components/providers/AuthProvider'

import { useOnlineRoom } from '@/hooks/useOnlineRoom'

import type { HiLoSyncedState } from '@/lib/online-game-state'



export type GameMode = 'standard' | 'traversee'



export default function HiLoPage() {

  const { players, updatePlayerStats } = usePlayers()

  const { selectedIds } = useSelectedPlayers()

  const isOnline = useIsOnlineMode()

  const { user } = useAuth()

  const { room, updateSettings } = useOnlineRoom()

  const [gameStarted, setGameStarted] = useState(false)

  const [gameMode, setGameMode] = useState<GameMode>('standard')



  const {

    isPlayingOnline,

    onlinePlayers,

    onlineSync,

    remoteState,

    handleLeaveToMenu,

  } = useOnlineGameSync<HiLoSyncedState>({ gameId: 'hi-lo' })



  const isHost = room?.hostUserId === user?.id

  const inHiLoRoom = room?.gameId === 'hi-lo'

  const canEditMode = !isOnline || isHost



  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const activePlayers = isOnline ? onlinePlayers : selectedPlayers

  const canStart = activePlayers.length >= 2

  const effectiveGameMode =

    isPlayingOnline && remoteState?.gameMode ? remoteState.gameMode : gameMode



  useEffect(() => {

    if (!isOnline || !inHiLoRoom || isHost) return

    const m = room?.settings?.hiLoMode

    if (m && m !== gameMode) setGameMode(m)

  }, [isOnline, inHiLoRoom, isHost, room?.settings?.hiLoMode, gameMode])



  useEffect(() => {

    if (isPlayingOnline && !gameStarted) setGameStarted(true)

    if (!isPlayingOnline && gameStarted && isOnline) setGameStarted(false)

  }, [isPlayingOnline, gameStarted, isOnline])



  const handleGameModeChange = useCallback(

    (value: GameMode) => {

      setGameMode(value)

      if (isOnline && isHost && room?.status === 'waiting') {

        void updateSettings({ hiLoMode: value })

      }

    },

    [isOnline, isHost, room?.status, updateSettings]

  )



  if (gameStarted && (canStart || isPlayingOnline)) {

    return (

      <Game

        key={onlineSync ? `${onlineSync.roomId}-${onlineSync.stateVersion}` : 'local'}

        players={activePlayers}

        onGameEnd={() => {

          if (isOnline) void handleLeaveToMenu()

          else setGameStarted(false)

        }}

        updatePlayerStats={updatePlayerStats}

        gameMode={effectiveGameMode}

        onlineSync={onlineSync}

      />

    )

  }



  if (isOnline) {

    return (

      <div className="space-y-4">

        <div className="flex justify-between items-center">

          <h1 className="pl-12 text-2xl font-bold sm:pl-0 sm:text-3xl">Hi/Lo</h1>

          <Link href="/jeux">

            <Button variant="outline" size="icon" aria-label="Retour aux jeux">

              <Home className="h-4 w-4" />

            </Button>

          </Link>

        </div>



        <OnlineLobbyPanel gameId="hi-lo" />



        {inHiLoRoom && room?.status === 'waiting' && (

          <Card className="p-4">

            <h3 className="text-lg font-semibold mb-2">Mode de jeu</h3>

            <Select

              value={gameMode}

              onValueChange={handleGameModeChange}

              disabled={!canEditMode}

            >

              <SelectTrigger className="w-full">

                <SelectValue placeholder="Sélectionner un mode" />

              </SelectTrigger>

              <SelectContent>

                <SelectItem value="standard">Standard</SelectItem>

                <SelectItem value="traversee">Traversée</SelectItem>

              </SelectContent>

            </Select>

            {!canEditMode && (

              <p className="mt-2 text-xs text-muted-foreground">

                Seul l&apos;hôte peut modifier le mode.

              </p>

            )}

          </Card>

        )}



        <p className="text-center text-sm text-muted-foreground">

          Rejoignez le lobby, déclarez-vous prêt, puis l&apos;hôte lance la partie.

        </p>

      </div>

    )

  }



  return (

    <div className="space-y-4">

      <div className="flex justify-between items-center">

        <h1 className="pl-12 text-2xl font-bold sm:pl-0 sm:text-3xl">Hi/Lo</h1>

        <Link href="/jeux">

          <Button variant="outline" size="icon" aria-label="Retour aux jeux">

            <Home className="h-4 w-4" />

          </Button>

        </Link>

      </div>



      <SelectedPlayersDisplay players={selectedPlayers} />



      <Card className="p-4">

        <h3 className="text-lg font-semibold mb-2">Mode de jeu</h3>

        <Select value={gameMode} onValueChange={handleGameModeChange}>

          <SelectTrigger className="w-full">

            <SelectValue placeholder="Sélectionner un mode" />

          </SelectTrigger>

          <SelectContent>

            <SelectItem value="standard">Standard</SelectItem>

            <SelectItem value="traversee">Traversée</SelectItem>

          </SelectContent>

        </Select>

        <Button className="mt-4 w-full" disabled={selectedPlayers.length < 2} onClick={() => setGameStarted(true)}>

          Commencer la partie

        </Button>

      </Card>

    </div>

  )

}


