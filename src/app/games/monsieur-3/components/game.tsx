"use client"

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, ArrowLeft } from 'lucide-react'
import confetti from 'canvas-confetti'
import { Player as BasePlayer, PlayerPreferences, getPlayerGameBoost } from '@/lib/players'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────────────────

interface GameProps {
  players: BasePlayer[]
  onGameEnd: () => void
}

interface Player {
  name: string
  isMonsieur3: boolean
  score: number
  preferences?: PlayerPreferences
  id: string
}

interface DiceRoll { dice1: number; dice2: number }

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

// ── Composant principal ───────────────────────────────────────────────────────

export default function Game({ players: initialBasePlayers, onGameEnd }: GameProps) {
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [dice, setDice] = useState<DiceRoll>({ dice1: 1, dice2: 1 })
  const [rolling, setRolling] = useState(false)
  const [gamePhase, setGamePhase] = useState<'setup' | 'play' | 'end'>('setup')
  const [message, setMessage] = useState('')
  const [rollHistory, setRollHistory] = useState<{ player: string; dice: DiceRoll; message: string }[]>([])
  const [specialMessage, setSpecialMessage] = useState<string | null>(null)
  const [canRoll, setCanRoll] = useState(false)
  const [setupRolls, setSetupRolls] = useState<{ playerName: string; roll: number }[]>([])
  const [monsieur3Found, setMonsieur3Found] = useState(false)
  const [gameEnded, setGameEnded] = useState(false)
  const [monsieur3Index, setMonsieur3Index] = useState(-1)
  const [victoryScreen, setVictoryScreen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const confettiRef = useRef<HTMLDivElement>(null)

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
  }, [initialBasePlayers])

  const rollDice = () => {
    if (!canRoll) return
    setRolling(true)
    setCanRoll(false)

    const interval = setInterval(() => {
      setDice({ dice1: rollDie(), dice2: gamePhase === 'setup' ? 1 : rollDie() })
    }, 50)

    setTimeout(() => {
      clearInterval(interval)
      const d1 = rollDie()
      const d2 = gamePhase === 'setup' ? 1 : rollDie()
      setDice({ dice1: d1, dice2: d2 })
      setRolling(false)
      if (gamePhase === 'setup') handleSetupRoll(d1)
      else handlePlayRoll({ dice1: d1, dice2: d2 })
    }, 800)
  }

  const handleSetupRoll = (roll: number) => {
    const p = players[currentPlayerIndex]
    const base = initialBasePlayers.find(b => b.id === p.id)
    const boost = base ? getPlayerGameBoost(base, 'monsieur-3') : 0
    let effective = roll
    if (roll === 3 && boost > 0 && Math.random() * 100 < boost) effective = 4

    const newRolls = [...setupRolls, { playerName: p.name, roll: effective }]
    setSetupRolls(newRolls)

    if (effective === 3) {
      const updated = [...players]
      updated[currentPlayerIndex].isMonsieur3 = true
      setPlayers(updated)
      setMonsieur3Index(currentPlayerIndex)
      setMessage(`${p.name} a fait un 3 — Monsieur 3 trouvé !`)
      setSpecialMessage('🎲 Monsieur 3 !')
      launchConfetti()
      setRollHistory(prev => [...prev, { player: p.name, dice: { dice1: effective, dice2: 1 }, message: `${p.name} devient Monsieur 3` }])

      setTimeout(() => {
        setMonsieur3Found(true)
        const next = (currentPlayerIndex + 1) % players.length
        setCurrentPlayerIndex(next)
        setTimeout(() => {
          setGamePhase('play')
          setMessage(`C'est au tour de ${players[next].name} de lancer les dés.`)
          setSpecialMessage(null)
          setCanRoll(true)
        }, 1800)
      }, 1800)
    } else {
      const msg = `${p.name} a fait un ${effective}.`
      setMessage(msg)
      setRollHistory(prev => [...prev, { player: p.name, dice: { dice1: effective, dice2: 1 }, message: msg }])
      const next = (currentPlayerIndex + 1) % players.length
      setCurrentPlayerIndex(next)
      setCanRoll(true)
    }
  }

  const handlePlayRoll = (diceRoll: DiceRoll) => {
    const { dice1, dice2 } = diceRoll
    const sum = dice1 + dice2
    const isDouble = dice1 === dice2
    const p = players[currentPlayerIndex]
    const base = initialBasePlayers.find(b => b.id === p.id)
    const boost = base ? getPlayerGameBoost(base, 'monsieur-3') : 0

    let msg = ''
    let m3Drinks = false
    let ruleTriggered = false

    if (p.isMonsieur3) {
      if (dice1 !== 3 && dice2 !== 3 && sum !== 3 && sum !== 5 && dice1 !== 5 && dice2 !== 5 && sum !== 8 && !isDouble) {
        msg = `Monsieur 3 a terminé son tour — fin de la partie !`
        setGameEnded(true)
        setRollHistory(prev => [...prev, { player: p.name, dice: diceRoll, message: msg }])
        setMessage(msg)
        setTimeout(() => { setVictoryScreen(true); launchConfetti(); setTimeout(launchConfetti, 1200) }, 800)
        return
      }
    }

    if (dice1 === 3 || dice2 === 3 || sum === 3 || sum === 5 || dice1 === 5 || dice2 === 5 || sum === 8) {
      m3Drinks = true; ruleTriggered = true
      if (sum === 5) msg = '🤸 Somme 5 — bras en croix + Whoo ! Le dernier boit.'
      else if (sum === 8) msg = '👆 Somme 8 — pouce sur le front ! Le dernier boit.'
      else msg = '🍺 Monsieur 3, tu bois !'
    }
    if (!p.isMonsieur3 && !m3Drinks && monsieur3Index >= 0 && boost > 0 && Math.random() * 100 < boost) {
      m3Drinks = true; ruleTriggered = true
      msg = '🍺 Monsieur 3, tu bois !'
    }
    if (isDouble) {
      msg += msg ? ' — ' : ''
      msg += `⚔️ Double ! ${p.name} choisit un duel.`
      ruleTriggered = true
    }

    if (m3Drinks && monsieur3Index !== -1) {
      const updated = [...players]
      updated[monsieur3Index].score += 1
      setPlayers(updated)
    }

    if (!ruleTriggered) {
      msg = `Aucune règle — [${dice1}, ${dice2}].`
      const next = (currentPlayerIndex + 1) % players.length
      setCurrentPlayerIndex(next)
    }

    setRollHistory(prev => [...prev, { player: p.name, dice: diceRoll, message: msg }])
    setMessage(msg)

    setTimeout(() => {
      if (ruleTriggered && !gameEnded) {
        setCanRoll(true)
      } else if (!gameEnded) {
        const next = (currentPlayerIndex + 1) % players.length
        setMessage(`C'est au tour de ${players[next].name} de lancer les dés.`)
        setCanRoll(true)
      }
    }, 900)
  }

  const restartGame = () => {
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

  const currentPlayer = players[currentPlayerIndex]
  const monsieur3Player = players.find(p => p.isMonsieur3)

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
            <button onClick={restartGame} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-red-300/60 transition hover:bg-white/10 hover:text-red-300" aria-label="Nouvelle partie">
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={onGameEnd} className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-white/40 transition hover:bg-white/10 hover:text-white/70" aria-label="Retour aux jeux">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="mx-auto max-w-xl px-4 pt-6 pb-28 space-y-4 sm:pt-8">

        {/* Phase indicator */}
        <div className="flex items-center gap-2">
          <span className={cn(
            'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest',
            gamePhase === 'setup' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
          )}>
            {gamePhase === 'setup' ? 'Recherche de Monsieur 3' : 'En jeu'}
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
            <PlayerIcon player={currentPlayer} size="md" className="h-10 w-10 text-xl" />
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
          {/* Texture */}
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

          {/* Message */}
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

          {/* Message spécial (Monsieur 3 trouvé) */}
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
              const isCurrent = i === currentPlayerIndex
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all',
                    isCurrent ? 'bg-white/[0.07] border border-white/10' : 'border border-transparent'
                  )}
                >
                  <PlayerIcon player={p} size="sm" className="h-7 w-7 text-sm" />
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
            disabled={!canRoll || rolling || victoryScreen || players.length === 0}
            aria-label={rolling ? 'Lancement en cours' : 'Lancer les dés'}
            className="w-full rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 py-4 text-base font-bold text-white shadow-[0_8px_24px_rgba(239,68,68,0.35)] transition-transform [touch-action:manipulation] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 hover:from-red-500 hover:to-rose-400"
          >
            {rolling ? '🎲 Lancement...' : gamePhase === 'setup' ? '🎲 Lancer le dé' : '🎲 Lancer les dés'}
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
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
