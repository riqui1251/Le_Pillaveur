/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, ArrowLeft } from 'lucide-react'
import confetti from 'canvas-confetti'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Player as BasePlayer, PlayerPreferences, getPlayerGameBoost } from '@/lib/players'
import { PlayerName } from '@/components/ui/PlayerName'
import { getColorFromClass, isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'
import type { Monsieur3SyncedState } from '@/lib/online-game-state'
import type { OnlineGameSync } from '@/lib/online-sync-types'
import { useSyncedOnlineGame } from '@/hooks/useSyncedOnlineGame'
import { createSeededRng, randomIntWithRng, randomSeed } from '@/lib/online-rng'

// ── Types ────────────────────────────────────────────────────────────────────

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
  onlineSync?: OnlineGameSync<Monsieur3SyncedState>
}

interface Player {
  name: string
  isMonsieur3: boolean
  score: number
  preferences?: PlayerPreferences
  id: string
}

interface DiceRoll { dice1: number; dice2: number }

type RollHistoryEntry = { player: string; dice: DiceRoll; message: string }

// ── Composant Dé ─────────────────────────────────────────────────────────────

const DOT_POSITIONS: Record<number, string[]> = {
  1: ['center'],
  2: ['top-left', 'bottom-right'],
  3: ['top-left', 'center', 'bottom-right'],
  4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
  6: ['top-left', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-right'],
}

const DOT_CLASS: Record<string, string> = {
  'center':       'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
  'top-left':     'absolute top-[18%] left-[18%]',
  'top-right':    'absolute top-[18%] right-[18%]',
  'mid-left':     'absolute top-1/2 left-[18%] -translate-y-1/2',
  'mid-right':    'absolute top-1/2 right-[18%] -translate-y-1/2',
  'bottom-left':  'absolute bottom-[18%] left-[18%]',
  'bottom-right': 'absolute bottom-[18%] right-[18%]',
}

function Die({ value, rolling, highlight }: { value: number; rolling: boolean; highlight?: boolean }) {
  return (
    <motion.div
      animate={rolling ? { rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.08, 0.95, 1.05, 1] } : {}}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      className={cn(
        'relative h-20 w-20 rounded-2xl border-2 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-all duration-300',
        highlight ? 'border-red-400 shadow-[0_0_24px_rgba(239,68,68,0.5)]' : 'border-white/80',
        rolling && 'shadow-[0_0_32px_rgba(239,68,68,0.35)]'
      )}
    >
      {(DOT_POSITIONS[value] || []).map((pos, i) => (
        <div key={i} className={DOT_CLASS[pos]}>
          <div className={cn(
            'h-3.5 w-3.5 rounded-full',
            value === 3 ? 'bg-red-600' : 'bg-gray-800'
          )} />
        </div>
      ))}
    </motion.div>
  )
}

function toSyncedPlayers(players: Player[]) {
  return players.map(p => ({
    id: p.id,
    name: p.name,
    isMonsieur3: p.isMonsieur3,
    score: p.score,
  }))
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function Game({ players: initialBasePlayers, onGameEnd, onlineSync }: GameProps) {
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [dice, setDice] = useState<DiceRoll>({ dice1: 1, dice2: 1 })
  const [rolling, setRolling] = useState(false)
  const [gamePhase, setGamePhase] = useState<'setup' | 'play' | 'end'>('setup')
  const [message, setMessage] = useState('')
  const [rollHistory, setRollHistory] = useState<RollHistoryEntry[]>([])
  const [specialMessage, setSpecialMessage] = useState<string | null>(null)
  const [canRoll, setCanRoll] = useState(false)
  const [setupRolls, setSetupRolls] = useState<{ playerName: string; roll: number }[]>([])
  const [monsieur3Found, setMonsieur3Found] = useState(false)
  const [gameEnded, setGameEnded] = useState(false)
  const [monsieur3Index, setMonsieur3Index] = useState(-1)
  const [victoryScreen, setVictoryScreen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const confettiRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef({
    players, currentPlayerIndex, dice, rolling, gamePhase, message, rollHistory,
    specialMessage, canRoll, setupRolls, monsieur3Found, gameEnded, monsieur3Index, victoryScreen,
  })

  useEffect(() => {
    stateRef.current = {
      players, currentPlayerIndex, dice, rolling, gamePhase, message, rollHistory,
      specialMessage, canRoll, setupRolls, monsieur3Found, gameEnded, monsieur3Index, victoryScreen,
    }
  }, [
    players, currentPlayerIndex, dice, rolling, gamePhase, message, rollHistory,
    specialMessage, canRoll, setupRolls, monsieur3Found, gameEnded, monsieur3Index, victoryScreen,
  ])

  const mergePlayersFromSync = useCallback((synced: Monsieur3SyncedState['players']): Player[] => {
    return synced.map(sp => {
      const base = initialBasePlayers.find(p => p.id === sp.id)
      return {
        id: sp.id,
        name: sp.name,
        isMonsieur3: sp.isMonsieur3,
        score: sp.score,
        preferences: base?.preferences,
      }
    })
  }, [initialBasePlayers])

  const applyFromServer = useCallback((s: Monsieur3SyncedState) => {
    setPlayers(mergePlayersFromSync(s.players))
    setCurrentPlayerIndex(s.currentPlayer)
    setDice(s.dice)
    setRolling(s.rolling)
    setGamePhase(s.gamePhase)
    setMessage(s.message)
    setRollHistory(s.rollHistory)
    setSpecialMessage(s.specialMessage)
    setCanRoll(s.canRoll)
    setSetupRolls(s.setupRolls)
    setMonsieur3Found(s.monsieur3Found)
    setGameEnded(s.gameEnded)
    setMonsieur3Index(s.monsieur3Index)
    setVictoryScreen(s.victoryScreen)
  }, [mergePlayersFromSync])

  const buildSyncedState = useCallback((extra?: Partial<Monsieur3SyncedState>): Monsieur3SyncedState | null => {
    if (!onlineSync) return null
    const c = stateRef.current
    return {
      version: onlineSync.stateVersion + 1,
      memberUserIds: onlineSync.memberUserIds,
      gameStarted: true,
      currentPlayer: extra?.currentPlayer ?? c.currentPlayerIndex,
      gamePhase: extra?.gamePhase ?? c.gamePhase,
      players: extra?.players ?? toSyncedPlayers(c.players),
      dice: extra?.dice ?? c.dice,
      rolling: extra?.rolling ?? c.rolling,
      message: extra?.message ?? c.message,
      rollHistory: extra?.rollHistory ?? c.rollHistory,
      specialMessage: extra?.specialMessage !== undefined ? extra.specialMessage : c.specialMessage,
      canRoll: extra?.canRoll ?? c.canRoll,
      setupRolls: extra?.setupRolls ?? c.setupRolls,
      monsieur3Found: extra?.monsieur3Found ?? c.monsieur3Found,
      gameEnded: extra?.gameEnded ?? c.gameEnded,
      monsieur3Index: extra?.monsieur3Index ?? c.monsieur3Index,
      victoryScreen: extra?.victoryScreen ?? c.victoryScreen,
      rematchVotes: onlineSync.remoteState?.rematchVotes ?? [],
    }
  }, [onlineSync])

  const { isOnline, isMyTurn, pushState } = useSyncedOnlineGame({
    onlineSync,
    applyRemoteState: applyFromServer,
    buildState: buildSyncedState,
    isBlockingRemote: () => rolling && Boolean(onlineSync?.canInteract),
  })

  const launchConfetti = () => {
    if (!confettiRef.current) return
    const rect = confettiRef.current.getBoundingClientRect()
    const origin = {
      x: rect.left / window.innerWidth + rect.width / window.innerWidth / 2,
      y: rect.top / window.innerHeight + 0.1,
    }
    confetti({ particleCount: 60, spread: 80, origin, colors: ['#ef4444', '#f97316', '#facc15', '#a78bfa'] })
    setTimeout(() => confetti({ particleCount: 40, angle: 60, spread: 55, origin, colors: ['#ef4444', '#f97316'] }), 300)
    setTimeout(() => confetti({ particleCount: 40, angle: 120, spread: 55, origin, colors: ['#facc15', '#a78bfa'] }), 500)
  }

  const rollDie = () => Math.floor(Math.random() * 6) + 1

  useEffect(() => {
    if (isOnline) return
    if (!initialBasePlayers?.length) { setPlayers([]); return }
    setPlayers(initialBasePlayers.map(p => ({
      name: p?.name || 'Joueur',
      isMonsieur3: false,
      score: 0,
      preferences: p?.preferences || {},
      id: p?.id || crypto.randomUUID(),
    })))
    setGamePhase('setup')
    setMessage('Lancez le dé — le premier à faire un 3 devient Monsieur 3 !')
    setCurrentPlayerIndex(0)
    setCanRoll(true)
    setMonsieur3Index(-1)
    setVictoryScreen(false)
    setSetupRolls([])
    setRollHistory([])
    setMonsieur3Found(false)
    setGameEnded(false)
  }, [initialBasePlayers, isOnline])

  const handleSetupRoll = (roll: number, skipBoost = false) => {
    const cur = stateRef.current
    const p = cur.players[cur.currentPlayerIndex]
    const base = initialBasePlayers.find(b => b.id === p.id)
    const boost = !skipBoost && base ? getPlayerGameBoost(base, 'monsieur-3') : 0
    let effective = roll
    if (roll === 3 && boost > 0 && Math.random() * 100 < boost) effective = 4

    const newRolls = [...cur.setupRolls, { playerName: p.name, roll: effective }]
    setSetupRolls(newRolls)

    if (effective === 3) {
      const updated = [...cur.players]
      updated[cur.currentPlayerIndex] = { ...updated[cur.currentPlayerIndex], isMonsieur3: true }
      setPlayers(updated)
      setMonsieur3Index(cur.currentPlayerIndex)
      setMessage(`${p.name} a fait un 3 — Monsieur 3 trouvé !`)
      setSpecialMessage('🎲 Monsieur 3 !')
      launchConfetti()
      const newHistory = [...cur.rollHistory, { player: p.name, dice: { dice1: effective, dice2: 1 }, message: `${p.name} devient Monsieur 3` }]
      setRollHistory(newHistory)

      const next = (cur.currentPlayerIndex + 1) % cur.players.length

      if (isOnline) {
        void pushState({
          players: toSyncedPlayers(updated),
          monsieur3Index: cur.currentPlayerIndex,
          message: `${p.name} a fait un 3 — Monsieur 3 trouvé !`,
          specialMessage: '🎲 Monsieur 3 !',
          setupRolls: newRolls,
          rollHistory: newHistory,
          canRoll: false,
        })
        setTimeout(() => {
          setMonsieur3Found(true)
          setCurrentPlayerIndex(next)
          void pushState({ monsieur3Found: true, currentPlayer: next })
          setTimeout(() => {
            setGamePhase('play')
            setMessage(`C'est au tour de ${cur.players[next].name} de lancer les dés.`)
            setSpecialMessage(null)
            setCanRoll(true)
            void pushState({
              gamePhase: 'play',
              specialMessage: null,
              message: `C'est au tour de ${cur.players[next].name} de lancer les dés.`,
              canRoll: true,
              currentPlayer: next,
            })
          }, 1800)
        }, 1800)
      } else {
        setTimeout(() => {
          setMonsieur3Found(true)
          setCurrentPlayerIndex(next)
          setTimeout(() => {
            setGamePhase('play')
            setMessage(`C'est au tour de ${cur.players[next].name} de lancer les dés.`)
            setSpecialMessage(null)
            setCanRoll(true)
          }, 1800)
        }, 1800)
      }
    } else {
      const msg = `${p.name} a fait un ${effective}.`
      setMessage(msg)
      const newHistory = [...cur.rollHistory, { player: p.name, dice: { dice1: effective, dice2: 1 }, message: msg }]
      setRollHistory(newHistory)
      const next = (cur.currentPlayerIndex + 1) % cur.players.length
      setCurrentPlayerIndex(next)
      setCanRoll(true)
      if (isOnline) {
        void pushState({
          setupRolls: newRolls,
          rollHistory: newHistory,
          message: msg,
          currentPlayer: next,
          canRoll: true,
        })
      }
    }
  }

  const handlePlayRoll = (diceRoll: DiceRoll, skipBoost = false) => {
    const { dice1, dice2 } = diceRoll
    const sum = dice1 + dice2
    const isDouble = dice1 === dice2
    const cur = stateRef.current
    const p = cur.players[cur.currentPlayerIndex]
    const base = initialBasePlayers.find(b => b.id === p.id)
    const boost = !skipBoost && base ? getPlayerGameBoost(base, 'monsieur-3') : 0

    let msg = ''
    let m3Drinks = false
    let ruleTriggered = false
    let ended = false

    if (p.isMonsieur3) {
      if (dice1 !== 3 && dice2 !== 3 && sum !== 3 && sum !== 5 && dice1 !== 5 && dice2 !== 5 && sum !== 8 && !isDouble) {
        msg = `Monsieur 3 a terminé son tour — fin de la partie !`
        ended = true
        const newHistory = [...cur.rollHistory, { player: p.name, dice: diceRoll, message: msg }]
        setGameEnded(true)
        setRollHistory(newHistory)
        setMessage(msg)
        setCanRoll(false)

        if (isOnline) {
          void pushState({
            gameEnded: true,
            gamePhase: 'end',
            rollHistory: newHistory,
            message: msg,
            canRoll: false,
          })
          setTimeout(() => {
            setVictoryScreen(true)
            launchConfetti()
            setTimeout(launchConfetti, 1200)
            void pushState({ victoryScreen: true })
          }, 800)
        } else {
          setTimeout(() => { setVictoryScreen(true); launchConfetti(); setTimeout(launchConfetti, 1200) }, 800)
        }
        return
      }
    }

    if (dice1 === 3 || dice2 === 3 || sum === 3 || sum === 5 || dice1 === 5 || dice2 === 5 || sum === 8) {
      m3Drinks = true; ruleTriggered = true
      if (sum === 5) msg = '🤸 Somme 5 — bras en croix + Whoo ! Le dernier boit.'
      else if (sum === 8) msg = '👆 Somme 8 — pouce sur le front ! Le dernier boit.'
      else msg = '🍺 Monsieur 3, tu bois !'
    }
    if (!p.isMonsieur3 && !m3Drinks && cur.monsieur3Index >= 0 && boost > 0 && Math.random() * 100 < boost) {
      m3Drinks = true; ruleTriggered = true
      msg = '🍺 Monsieur 3, tu bois !'
    }
    if (isDouble) {
      msg += msg ? ' — ' : ''
      msg += `⚔️ Double ! ${p.name} choisit un duel.`
      ruleTriggered = true
    }

    let updated = cur.players
    if (m3Drinks && cur.monsieur3Index !== -1) {
      updated = [...cur.players]
      updated[cur.monsieur3Index] = { ...updated[cur.monsieur3Index], score: updated[cur.monsieur3Index].score + 1 }
      setPlayers(updated)
    }

    let nextIndex = cur.currentPlayerIndex
    if (!ruleTriggered) {
      msg = `Aucune règle — [${dice1}, ${dice2}].`
      nextIndex = (cur.currentPlayerIndex + 1) % cur.players.length
      setCurrentPlayerIndex(nextIndex)
    }

    const newHistory = [...cur.rollHistory, { player: p.name, dice: diceRoll, message: msg }]
    setRollHistory(newHistory)
    setMessage(msg)

    const finishTurn = () => {
      if (ruleTriggered && !ended) {
        setCanRoll(true)
        if (isOnline) void pushState({ canRoll: true, message: msg, rollHistory: newHistory, players: toSyncedPlayers(updated) })
      } else if (!ended) {
        setMessage(`C'est au tour de ${cur.players[nextIndex].name} de lancer les dés.`)
        setCanRoll(true)
        if (isOnline) {
          void pushState({
            currentPlayer: nextIndex,
            message: `C'est au tour de ${cur.players[nextIndex].name} de lancer les dés.`,
            canRoll: true,
            rollHistory: newHistory,
            players: toSyncedPlayers(updated),
          })
        }
      }
    }

    if (isOnline) {
      void pushState({
        rollHistory: newHistory,
        message: msg,
        players: toSyncedPlayers(updated),
        canRoll: false,
        currentPlayer: ruleTriggered ? cur.currentPlayerIndex : nextIndex,
      })
    }

    setTimeout(finishTurn, 900)
  }

  const rollDice = () => {
    if (!canRoll || rolling) return
    if (isOnline && !isMyTurn) return

    setRolling(true)
    setCanRoll(false)
    if (isOnline) void pushState({ rolling: true, canRoll: false })

    const phase = stateRef.current.gamePhase
    const interval = setInterval(() => {
      setDice({ dice1: rollDie(), dice2: phase === 'setup' ? 1 : rollDie() })
    }, 50)

    setTimeout(() => {
      clearInterval(interval)
      let d1: number
      let d2: number
      if (isOnline) {
        const rng = createSeededRng(randomSeed())
        d1 = randomIntWithRng(rng, 1, 6)
        d2 = phase === 'setup' ? 1 : randomIntWithRng(rng, 1, 6)
      } else {
        d1 = rollDie()
        d2 = phase === 'setup' ? 1 : rollDie()
      }
      setDice({ dice1: d1, dice2: d2 })
      setRolling(false)
      if (isOnline) void pushState({ dice: { dice1: d1, dice2: d2 }, rolling: false })
      if (phase === 'setup') handleSetupRoll(d1, isOnline)
      else handlePlayRoll({ dice1: d1, dice2: d2 }, isOnline)
    }, 800)
  }

  const restartGame = () => {
    if (isOnline) return
    if (!initialBasePlayers?.length) return
    setPlayers(initialBasePlayers.map(p => ({
      name: p?.name || 'Joueur', isMonsieur3: false, score: 0,
      preferences: p?.preferences || {}, id: p?.id || crypto.randomUUID(),
    })))
    setCurrentPlayerIndex(0)
    setDice({ dice1: 1, dice2: 1 })
    setRolling(false)
    setGamePhase('setup')
    setMessage('Lancez le dé — le premier à faire un 3 devient Monsieur 3 !')
    setRollHistory([])
    setSpecialMessage(null)
    setCanRoll(true)
    setSetupRolls([])
    setMonsieur3Found(false)
    setGameEnded(false)
    setMonsieur3Index(-1)
    setVictoryScreen(false)
  }

  const handleEnd = () => {
    if (isOnline) {
      void onlineSync?.leaveToMenu?.()
      return
    }
    onGameEnd()
  }

  if (isOnline && !onlineSync?.remoteState?.gameStarted) {
    return <div className="p-6 text-center text-red-300">Chargement de la partie…</div>
  }

  const currentPlayer = players[currentPlayerIndex]
  const monsieur3Player = players.find(p => p.isMonsieur3)
  const rollDisabled = !canRoll || rolling || victoryScreen || players.length === 0 || (isOnline && !isMyTurn)

  return (
    <div className="w-full min-h-screen relative text-white">
      {/* Fond */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#07060b]" />
        <div className="absolute -top-32 -left-20 h-[28rem] w-[28rem] rounded-full bg-red-600/10 blur-[120px]" />
        <div className="absolute -bottom-32 right-0 h-[26rem] w-[26rem] rounded-full bg-indigo-700/10 blur-[110px]" />
      </div>

      {/* Header fixe */}
      <div className="fixed top-0 inset-x-0 z-30 border-b border-white/[0.06] bg-[#07060b]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <h1 className="font-black tracking-tight text-lg bg-clip-text text-transparent bg-gradient-to-r from-red-400 via-rose-300 to-orange-400">
            🎲 Monsieur 3
          </h1>
          <div className="flex items-center gap-1">
            {!isOnline && (
              <button onClick={restartGame} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-red-300/60 transition hover:bg-white/10 hover:text-red-300" aria-label="Nouvelle partie">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
            <button onClick={handleEnd} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-white/40 transition hover:bg-white/10 hover:text-white/70" aria-label="Retour aux jeux">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="mx-auto max-w-xl px-4 pt-20 pb-28 space-y-4">

        {isOnline && onlineSync?.activePlayerName && (
          <p className="text-center text-sm text-red-300/80">
            Tour de <strong>{onlineSync.activePlayerName}</strong>
            {!isMyTurn && ' — en attente…'}
          </p>
        )}

        {/* Phase indicator */}
        <div className="flex items-center gap-2">
          <span className={cn(
            'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest',
            gamePhase === 'setup' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
          )}>
            {gamePhase === 'setup' ? 'Recherche de Monsieur 3' : gamePhase === 'end' ? 'Fin de partie' : 'En jeu'}
          </span>
          {monsieur3Player && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold text-amber-300">
              M3 : {monsieur3Player.name} · {monsieur3Player.score} 🍺
            </span>
          )}
        </div>

        {/* Joueur actif */}
        {currentPlayer && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 flex items-center gap-3">
            {(() => {
              const bg = getColorFromClass(currentPlayer.preferences?.color ?? '')
              return (
                <Avatar className="h-10 w-10 shrink-0 border-2 border-white/20" style={{ backgroundColor: bg }}>
                  <AvatarFallback className="text-sm font-bold text-white" style={{ backgroundColor: bg }}>
                    {currentPlayer.preferences?.icon || currentPlayer.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                  {currentPlayer.preferences?.avatar && <AvatarImage src={currentPlayer.preferences.avatar} alt={currentPlayer.name} />}
                </Avatar>
              )
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">Joueur actif</p>
              <PlayerName player={currentPlayer} className={cn('font-bold text-white text-base truncate', isSpecialPlayer(currentPlayer) && getSpecialEffectClass(currentPlayer))} />
            </div>
            {currentPlayer.isMonsieur3 && (
              <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2.5 py-1 text-[11px] font-bold text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]">
                Monsieur 3
              </span>
            )}
          </div>
        )}

        {/* Zone des dés */}
        <div ref={confettiRef} className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-6 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 opacity-[0.03] [background:repeating-linear-gradient(45deg,rgba(255,255,255,.2)_0px,rgba(255,255,255,.2)_1px,transparent_1px,transparent_20px)]" />

          <div className="relative flex items-center justify-center gap-6 mb-5">
            <Die value={dice.dice1} rolling={rolling} highlight={dice.dice1 === 3} />
            {gamePhase !== 'setup' && (
              <>
                <span className="text-white/20 text-2xl font-thin">+</span>
                <Die value={dice.dice2} rolling={rolling} highlight={dice.dice2 === 3} />
                {!rolling && gamePhase === 'play' && (
                  <div className="absolute -bottom-1 right-4 flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-white/50">
                    Somme <span className="font-bold text-white/80 ml-1">{dice.dice1 + dice.dice2}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={message}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              role="status"
              aria-live="polite"
              className="text-center text-sm font-semibold text-white/80 min-h-[2.5rem] flex items-center justify-center px-2"
            >
              {message}
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {specialMessage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl z-10"
              >
                <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 px-6 py-4 text-2xl font-black text-black shadow-2xl">
                  {specialMessage}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Liste des joueurs */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">Joueurs</p>
          <div className="space-y-1">
            {players.map((p, i) => {
              const bg = getColorFromClass(p.preferences?.color ?? '')
              const isCurrent = i === currentPlayerIndex
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all',
                    isCurrent ? 'bg-white/[0.07] border border-white/10' : 'border border-transparent'
                  )}
                >
                  <Avatar className="h-7 w-7 shrink-0 border border-white/15" style={{ backgroundColor: bg }}>
                    <AvatarFallback className="text-[10px] font-bold text-white" style={{ backgroundColor: bg }}>
                      {p.preferences?.icon || p.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                    {p.preferences?.avatar && <AvatarImage src={p.preferences.avatar} alt={p.name} />}
                  </Avatar>
                  <PlayerName player={p} className={cn('text-sm font-medium flex-1 truncate', isCurrent ? 'text-white' : 'text-white/60', isSpecialPlayer(p) && getSpecialEffectClass(p))} />
                  {p.isMonsieur3 && (
                    <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">M3</span>
                  )}
                  {p.isMonsieur3 && p.score > 0 && (
                    <span className="text-xs text-red-400 font-semibold">{p.score}🍺</span>
                  )}
                  {isCurrent && !p.isMonsieur3 && (
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Historique */}
        {rollHistory.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
            <button
              onClick={() => setShowHistory(v => !v)}
              aria-expanded={showHistory}
              aria-controls="roll-history"
              className="flex w-full items-center justify-between px-4 py-3 text-[11px] font-semibold uppercase tracking-widest text-white/40 hover:text-white/60 transition"
            >
              <span>Historique ({rollHistory.length})</span>
              <span>{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && (
              <div id="roll-history" className="border-t border-white/[0.06] px-4 pb-3 pt-2 max-h-48 overflow-y-auto space-y-1.5">
                {[...rollHistory].reverse().map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-white/50">
                    <span className="shrink-0 font-semibold text-white/70">{r.player}</span>
                    <span className="shrink-0 rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono">
                      {r.dice.dice1}{r.dice.dice2 !== 1 ? `+${r.dice.dice2}` : ''}
                    </span>
                    <span className="flex-1 text-white/45">{r.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barre d'action fixe */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-[#07060b] via-[#07060b]/95 to-transparent backdrop-blur-sm">
        <div className="mx-auto max-w-xl px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={rollDice}
            disabled={rollDisabled}
            aria-label={rolling ? 'Lancement en cours' : 'Lancer les dés'}
            className="w-full rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(239,68,68,0.35)] transition-transform [touch-action:manipulation] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 hover:from-red-500 hover:to-rose-400"
          >
            {rolling ? '🎲 Lancement...' : isOnline && !isMyTurn ? '⏳ En attente de votre tour' : gamePhase === 'setup' ? '🎲 Lancer le dé' : '🎲 Lancer les dés'}
          </button>
        </div>
      </div>

      {/* Écran de victoire */}
      <AnimatePresence>
        {victoryScreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.85, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', duration: 0.6 }}
              className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-red-500/20 bg-[#0d0807] p-6 shadow-2xl"
            >
              <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(ellipse at 50% 0%, #ef4444, transparent 70%)' }} />
              <div className="relative space-y-5 text-center">
                <div className="text-5xl">🎲</div>
                <h2 className="text-2xl font-black text-white">Partie terminée !</h2>

                {monsieur3Player && (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/70 mb-2">Monsieur 3</p>
                    <p className="text-xl font-extrabold text-amber-300">{monsieur3Player.name}</p>
                    <p className="text-3xl font-black text-white mt-1">{monsieur3Player.score} 🍺</p>
                    <p className="text-xs text-white/40 mt-1">gorgée{monsieur3Player.score !== 1 ? 's' : ''} bue{monsieur3Player.score !== 1 ? 's' : ''}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {isOnline && onlineSync ? (
                    <>
                      <button
                        onClick={() => void onlineSync.voteRematch?.()}
                        disabled={onlineSync.rematchVotes?.includes(onlineSync.myUserId)}
                        className="col-span-2 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 py-3 text-sm font-bold text-white hover:from-red-500 hover:to-rose-400 disabled:cursor-default disabled:opacity-60"
                      >
                        {onlineSync.rematchVotes?.includes(onlineSync.myUserId)
                          ? `En attente (${onlineSync.rematchVotes?.length ?? 0}/${onlineSync.memberUserIds.length})`
                          : `Rejouer (${onlineSync.rematchVotes?.length ?? 0}/${onlineSync.memberUserIds.length})`}
                      </button>
                      <button
                        onClick={() => void onlineSync.leaveToMenu?.()}
                        className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.05] py-3 text-sm text-white/60 hover:bg-white/10 hover:text-white"
                      >
                        Menu
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={restartGame}
                        className="rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 py-3 text-sm font-bold text-white hover:from-red-500 hover:to-rose-400"
                      >
                        Rejouer
                      </button>
                      <button
                        onClick={onGameEnd}
                        className="rounded-2xl border border-white/10 bg-white/[0.05] py-3 text-sm text-white/60 hover:bg-white/10 hover:text-white"
                      >
                        Menu
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
