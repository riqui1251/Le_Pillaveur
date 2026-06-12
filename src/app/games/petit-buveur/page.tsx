"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { usePlayers } from '@/hooks/usePlayers'
import Game from './components/game'
import type { OnlineGameSync } from './components/game'
import { Home, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'
import { motion, AnimatePresence } from 'framer-motion'
import { getSafeStorage } from '@/lib/storage'
import { useIsOnlineMode } from '@/components/online/OnlineGameGate'
import { OnlineLobbyPanel } from '@/components/online/OnlineLobbyPanel'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { membersToPlayers } from '@/lib/online-players'
import { parsePetitBuveurState } from '@/lib/online-game-state'
import type { Player } from '@/lib/players'

type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

const difficultyOptions: { value: Difficulty; label: string; desc: string; active: string }[] = [
  { value: 'facile',    label: '🌱 Facile',   desc: 'Moins de gorgées, idéal pour débuter',   active: 'from-emerald-500 to-green-600 shadow-emerald-500/30' },
  { value: 'normal',   label: '🌟 Normal',   desc: 'Équilibré pour une soirée agréable',      active: 'from-amber-500 to-yellow-600 shadow-amber-500/30' },
  { value: 'difficile',label: '🔥 Difficile',desc: 'Plus de défis et de gorgées',            active: 'from-orange-500 to-red-600 shadow-orange-500/30' },
  { value: 'extreme',  label: '💀 Extrême',  desc: 'Cul sec possible — réservé aux experts', active: 'from-red-600 to-rose-700 shadow-red-500/30' },
]

function PetitBuveurMenu({
  selectedPlayers,
  gameStarted,
  setGameStarted,
  initialMode,
  setInitialMode,
  difficulty,
  setDifficulty,
  showRules,
  setShowRules,
  hasActiveSave,
  launchGame,
  handleGameEnd,
  isOnline,
  isHost,
  canEditDifficulty,
  onlineSync,
}: {
  selectedPlayers: Player[]
  gameStarted: boolean
  setGameStarted: (v: boolean) => void
  initialMode: 'new' | 'resume'
  setInitialMode: (m: 'new' | 'resume') => void
  difficulty: Difficulty
  setDifficulty: (d: Difficulty) => void
  showRules: boolean
  setShowRules: React.Dispatch<React.SetStateAction<boolean>>
  hasActiveSave: boolean
  launchGame: (mode: 'new' | 'resume') => void
  handleGameEnd: () => void
  isOnline?: boolean
  isHost?: boolean
  canEditDifficulty?: boolean
  onlineSync?: OnlineGameSync
}) {
  if (gameStarted) {
    return (
      <Game
        key={onlineSync ? `${onlineSync.roomId}-${onlineSync.stateVersion}` : 'local'}
        players={selectedPlayers}
        onGameEnd={handleGameEnd}
        difficulty={difficulty}
        initialMode={initialMode}
        onlineSync={onlineSync}
      />
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-950 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/20 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-orange-600/15 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/15 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-4 py-8 pb-12">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/jeux"
            className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/80 backdrop-blur-md transition-all hover:bg-white/20 hover:text-white"
          >
            <Home className="h-4 w-4" />
            Retour
          </Link>
          <span className="text-xs font-medium text-white/30">🍺 Jeu de plateau</span>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-4xl shadow-lg shadow-amber-500/30">
            🍺
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Le Petit Buveur</h1>
          <p className="text-sm text-white/50">Avance sur le plateau sans être trop saoul !</p>
        </div>

        {isOnline && <OnlineLobbyPanel gameId="petit-buveur" />}

        {!isOnline && (
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
              Joueurs sélectionnés
            </p>
            {selectedPlayers.length === 0 ? (
              <p className="text-center text-sm text-white/35">
                Aucun joueur — rendez-vous sur la page Joueurs.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedPlayers.map(p => (
                  <span
                    key={p.id}
                    className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-medium"
                  >
                    <span>{p.preferences?.icon ?? '👤'}</span>
                    <span>{p.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-amber-400/70">
            Difficulté
          </p>
          {isOnline && !canEditDifficulty && (
            <p className="mb-2 text-xs text-white/40">Choix du créateur du lobby</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {difficultyOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => canEditDifficulty !== false && setDifficulty(opt.value)}
                disabled={canEditDifficulty === false}
                className={`rounded-xl border px-3 py-3 text-left transition-all ${
                  difficulty === opt.value
                    ? `border-transparent bg-gradient-to-r ${opt.active} text-white shadow-lg`
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                } ${canEditDifficulty === false ? 'cursor-default opacity-80' : ''}`}
              >
                <span className="block text-sm font-bold">{opt.label}</span>
                <span className={`mt-0.5 block text-xs ${difficulty === opt.value ? 'text-white/80' : 'text-white/35'}`}>
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>
          {isOnline && isHost && (
            <p className="mt-2 text-center text-[11px] text-violet-300/70">
              Vous êtes l&apos;hôte — la difficulté s&apos;applique à tous les joueurs
            </p>
          )}
        </div>

        <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
          <button
            onClick={() => setShowRules(v => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:text-white"
            aria-expanded={showRules}
          >
            <span>Règles du jeu</span>
            {showRules ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <AnimatePresence>
            {showRules && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5 border-t border-white/10 px-4 py-3 text-sm text-white/55">
                  <p>🎲 Lance le dé à ton tour et avance du nombre de cases.</p>
                  <p>🍺 Selon la case atterrie, bois des gorgées ou relève un défi.</p>
                  <p>⚡ Les cases spéciales déclenchent des effets : échanges, malédictions, protections...</p>
                  <p>🏆 Le premier à atteindre la case 30 gagne la partie !</p>
                  <p className="pt-1 text-xs text-white/30">⚠️ À consommer avec modération.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!isOnline && (
          <>
            {selectedPlayers.length < 2 && (
              <p className="mb-3 text-center text-sm text-white/40">
                Sélectionne au moins 2 joueurs pour commencer.
              </p>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => launchGame('new')}
                disabled={selectedPlayers.length < 2}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-4 text-lg font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Commencer la partie
              </button>
              {hasActiveSave && (
                <button
                  onClick={() => launchGame('resume')}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reprendre la partie en cours
                </button>
              )}
            </div>
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

export default function PetitBuveurPage() {
  const router = useRouter()
  const [gameStarted, setGameStarted] = useState(false)
  const [initialMode, setInitialMode] = useState<'new' | 'resume'>('new')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [showRules, setShowRules] = useState(false)
  const [hasActiveSave, setHasActiveSave] = useState(false)
  const { players } = usePlayers()
  const { selectedIds } = useSelectedPlayers()
  const isOnline = useIsOnlineMode()
  const { user } = useAuth()
  const { room, updateSettings, pushGameState, voteRematch, leaveRoom } = useOnlineRoom()
  const selectedPlayers = players.filter(p => selectedIds.includes(p.id))

  const isHost = room?.hostUserId === user?.id
  const inPetitBuveurRoom = room?.gameId === 'petit-buveur'

  const onlinePlayers = useMemo(
    () => (inPetitBuveurRoom && room ? membersToPlayers(room.members) : []),
    [inPetitBuveurRoom, room]
  )

  const remoteState = useMemo(
    () => parsePetitBuveurState(room?.gameStateJson),
    [room?.gameStateJson, room?.stateVersion]
  )

  /** Ne lance le jeu qu'une fois l'état serveur reçu (évite l'écran « Chargement… ») */
  const isPlayingOnline =
    isOnline &&
    inPetitBuveurRoom &&
    room?.status === 'playing' &&
    Boolean(remoteState?.gameStarted)

  const canInteract = Boolean(user?.id && room?.currentTurnUserId === user.id)

  const handlePushState = useCallback(
    async (stateJson: string) => {
      if (!room) return false
      return pushGameState(stateJson, room.stateVersion)
    },
    [room, pushGameState]
  )

  const handleLeaveToMenu = useCallback(async () => {
    await leaveRoom()
    router.push('/jeux')
  }, [leaveRoom, router])

  const onlineSync: OnlineGameSync | undefined = isPlayingOnline && room && user
    ? {
        roomId: room.id,
        myUserId: user.id,
        memberUserIds: room.members.map(m => m.userId),
        canInteract,
        stateVersion: room.stateVersion,
        remoteState,
        pushState: handlePushState,
        voteRematch,
        leaveToMenu: handleLeaveToMenu,
        rematchVotes: remoteState?.rematchVotes ?? [],
        activePlayerName: room.members.find(m => m.userId === room.currentTurnUserId)?.displayName,
      }
    : undefined

  useEffect(() => {
    if (!isOnline || !inPetitBuveurRoom || isHost) return
    const roomDifficulty = room?.settings?.difficulty
    if (roomDifficulty && roomDifficulty !== difficulty) {
      setDifficulty(roomDifficulty as Difficulty)
    }
  }, [isOnline, inPetitBuveurRoom, isHost, room?.settings?.difficulty, difficulty])

  useEffect(() => {
    if (isPlayingOnline && !gameStarted) {
      setInitialMode('new')
      setGameStarted(true)
    }
    if (!isPlayingOnline && gameStarted && isOnline) {
      setGameStarted(false)
    }
  }, [isPlayingOnline, gameStarted, isOnline])

  const handleDifficultyChange = useCallback(
    (d: Difficulty) => {
      setDifficulty(d)
      if (isOnline && isHost && room?.status === 'waiting') {
        updateSettings({ difficulty: d })
      }
    },
    [isOnline, isHost, room?.status, updateSettings]
  )

  useEffect(() => {
    if (isOnline) return
    const storage = getSafeStorage()
    setHasActiveSave(!!storage?.getItem('petit-buveur-save'))
  }, [gameStarted, isOnline])

  const handleGameEnd = () => {
    if (isOnline) {
      void handleLeaveToMenu()
      return
    }
    setGameStarted(false)
    setInitialMode('new')
  }

  const launchGame = (mode: 'new' | 'resume') => {
    setInitialMode(mode)
    setGameStarted(true)
  }

  return (
    <PetitBuveurMenu
      selectedPlayers={isOnline ? onlinePlayers : selectedPlayers}
      gameStarted={gameStarted}
      setGameStarted={setGameStarted}
      initialMode={initialMode}
      setInitialMode={setInitialMode}
      difficulty={difficulty}
      setDifficulty={handleDifficultyChange}
      showRules={showRules}
      setShowRules={setShowRules}
      hasActiveSave={hasActiveSave}
      launchGame={launchGame}
      handleGameEnd={handleGameEnd}
      isOnline={isOnline}
      isHost={isHost}
      canEditDifficulty={!isOnline || isHost}
      onlineSync={onlineSync}
    />
  )
}
