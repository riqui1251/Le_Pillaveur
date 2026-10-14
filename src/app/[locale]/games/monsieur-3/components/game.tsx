"use client"

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, ArrowLeft } from 'lucide-react'
import { fireConfetti, preloadConfetti } from '@/components/online/EndConfetti'
import { Player as BasePlayer, PlayerPreferences } from '@/lib/players'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'
import { GameFixedActionBar, gameActionBarPadding } from '@/components/game/GameFixedActionBar'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import { usePlayers } from '@/hooks/usePlayers'

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

// Reprise de partie : désignation de Monsieur 3, scores et historique sont de
// simples données — seuls les enchainements de setTimeout ne sont pas rejoués,
// on rend donc la main au joueur courant (canRoll) à la reprise.
const SAVE_ID = 'monsieur-3'
// Version 2 : la sauvegarde ne porte plus que des identifiants de joueurs
// (plus aucun profil recopié), les anciennes entrées sont donc jetées.
const SAVE_VERSION = 2

type Monsieur3Save = {
  /** Uniquement l'état DE PARTIE de chaque joueur, jamais son profil : le nom
   *  et les préférences sont réhydratés depuis la table passée en propriété.
   *  L'ordre est significatif (currentPlayerIndex, monsieur3Index y renvoient). */
  playerStates: { id: string; score: number; isMonsieur3: boolean }[]
  currentPlayerIndex: number
  gamePhase: 'setup' | 'play' | 'end'
  message: string
  rollHistory: { player: string; dice: DiceRoll; message: string }[]
  setupRolls: { playerName: string; roll: number }[]
  monsieur3Found: boolean
  monsieur3Index: number
  dice: DiceRoll
}

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
        'relative h-20 w-20 rounded-2xl border-2 bg-cream shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-all duration-300',
        highlight ? 'border-suit-red shadow-[0_0_24px_rgb(var(--suit-red-rgb)/0.5)]' : 'border-[#D8CCAE]',
        rolling && 'shadow-[0_0_32px_rgb(var(--gold-rgb)/0.35)]'
      )}
    >
      {(DOT_POSITIONS[value] || []).map((pos, i) => (
        <div key={i} className={DOT_CLASS[pos]}>
          <div className={cn(
            'h-3.5 w-3.5 rounded-full',
            value === 3 ? 'bg-suit-red' : 'bg-[#24201A]'
          )} />
        </div>
      ))}
    </motion.div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function Game({ players: initialBasePlayers, onGameEnd }: GameProps) {
  const t = useTranslations('games.monsieur-3')
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

  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<Monsieur3Save>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerStates.map((st) => st.id), initialBasePlayers)
  )
  const { updatePlayerStats } = usePlayers()

  const confettiRef = useRef<HTMLDivElement>(null)
  // La bibliothèque arrive par import dynamique : on la précharge au montage
  // pour que la première salve parte avec le lancer, pas une requête après.
  useEffect(() => {
    preloadConfetti()
  }, [])

  const launchConfetti = () => {
    if (!confettiRef.current) return
    const rect = confettiRef.current.getBoundingClientRect()
    const origin = {
      x: rect.left / window.innerWidth + rect.width / window.innerWidth / 2,
      y: rect.top / window.innerHeight + 0.1,
    }
    fireConfetti({ particleCount: 60, spread: 80, origin, colors: ['#ef4444', '#f97316', '#facc15', '#a78bfa'] })
    setTimeout(() => fireConfetti({ particleCount: 40, angle: 60, spread: 55, origin, colors: ['#ef4444', '#f97316'] }), 300)
    setTimeout(() => fireConfetti({ particleCount: 40, angle: 120, spread: 55, origin, colors: ['#facc15', '#a78bfa'] }), 500)
  }

  const rollDie = () => Math.floor(Math.random() * 6) + 1

  // Pas de nouvelle partie tant que la reprise n'a pas été proposée et tranchée.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    if (!initialBasePlayers?.length) { setPlayers([]); return }
    setStarted(true)
    setPlayers(initialBasePlayers.map(p => ({
      name: p?.name || 'Joueur',
      isMonsieur3: false,
      score: 0,
      preferences: p?.preferences || {},
      id: p?.id || crypto.randomUUID(),
    })))
    setGamePhase('setup')
    setMessage(t('messages.setupStart'))
    setCurrentPlayerIndex(0)
    setCanRoll(true)
    setMonsieur3Index(-1)
    setVictoryScreen(false)
    setSetupRolls([])
    setRollHistory([])
    setMonsieur3Found(false)
    setGameEnded(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBasePlayers, session.ready, session.pending, started])

  // Sauvegarde continue tant que la partie n'est pas finie.
  useEffect(() => {
    if (!started || gameEnded || players.length === 0) return
    session.save({
      playerStates: players.map(p => ({ id: p.id, score: p.score, isMonsieur3: p.isMonsieur3 })),
      currentPlayerIndex,
      gamePhase,
      message,
      rollHistory,
      setupRolls,
      monsieur3Found,
      monsieur3Index,
      dice,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameEnded, players, currentPlayerIndex, gamePhase, message, rollHistory, setupRolls, monsieur3Found, monsieur3Index, dice])

  /** Évite de compter deux fois la même partie. */
  const gameCountedRef = useRef(false)

  // Fin de partie : c'est ici que le compteur de parties du mode local bouge,
  // et que la sauvegarde disparaît.
  useEffect(() => {
    if (!victoryScreen) {
      gameCountedRef.current = false
      return
    }
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    players.forEach(p => {
      try {
        updatePlayerStats(p.id, 'monsieur-3', { gamesPlayed: 1, totalDrinks: p.score })
      } catch (error) {
        console.error('Erreur lors du comptage de la partie:', error)
      }
    })
    session.clear()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [victoryScreen])

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Table différente : reprendre écraserait la table choisie sur le hub par
    // celle de la sauvegarde. On jette la sauvegarde et on repart à neuf.
    const savedIds = saved.playerStates.map(st => st.id)
    if (!isSameLocalTable(savedIds, initialBasePlayers)) {
      session.discard()
      return
    }
    // Réhydratation : la sauvegarde ne porte que des identifiants et des
    // scores, le profil (nom, préférences) vient de la table courante.
    setPlayers(saved.playerStates.map(st => {
      const base = initialBasePlayers.find(p => p.id === st.id)
      return {
        name: base?.name || 'Joueur',
        isMonsieur3: st.isMonsieur3,
        score: st.score,
        preferences: base?.preferences,
        id: st.id,
      }
    }))
    setCurrentPlayerIndex(saved.currentPlayerIndex)
    setGamePhase(saved.gamePhase)
    setMessage(saved.message)
    setRollHistory(saved.rollHistory)
    setSetupRolls(saved.setupRolls)
    setMonsieur3Found(saved.monsieur3Found)
    setMonsieur3Index(saved.monsieur3Index)
    setDice(saved.dice)
    setSpecialMessage(null)
    setRolling(false)
    setGameEnded(false)
    setVictoryScreen(false)
    setCanRoll(true)
    setStarted(true)
  }

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
    const effective = roll

    const newRolls = [...setupRolls, { playerName: p.name, roll: effective }]
    setSetupRolls(newRolls)

    if (effective === 3) {
      const updated = [...players]
      updated[currentPlayerIndex].isMonsieur3 = true
      setPlayers(updated)
      setMonsieur3Index(currentPlayerIndex)
      setMessage(t('messages.foundM3', { name: p.name }))
      setSpecialMessage(t('messages.foundSpecial'))
      launchConfetti()
      setRollHistory(prev => [...prev, { player: p.name, dice: { dice1: effective, dice2: 1 }, message: t('messages.foundM3', { name: p.name }) }])

      setTimeout(() => {
        setMonsieur3Found(true)
        const next = (currentPlayerIndex + 1) % players.length
        setCurrentPlayerIndex(next)
        setTimeout(() => {
          setGamePhase('play')
          setMessage(t('messages.turnNext', { name: players[next].name }))
          setSpecialMessage(null)
          setCanRoll(true)
        }, 1800)
      }, 1800)
    } else {
      const msg = t('messages.rollResult', { name: p.name, roll: effective })
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

    let msg = ''
    let m3Drinks = false
    let ruleTriggered = false

    if (p.isMonsieur3) {
      if (dice1 !== 3 && dice2 !== 3 && sum !== 3 && sum !== 5 && dice1 !== 5 && dice2 !== 5 && sum !== 8 && !isDouble) {
        msg = t('messages.gameEnd')
        setGameEnded(true)
        setRollHistory(prev => [...prev, { player: p.name, dice: diceRoll, message: msg }])
        setMessage(msg)
        setTimeout(() => { setVictoryScreen(true); launchConfetti(); setTimeout(launchConfetti, 1200) }, 800)
        return
      }
    }

    if (dice1 === 3 || dice2 === 3 || sum === 3 || sum === 5 || dice1 === 5 || dice2 === 5 || sum === 8) {
      m3Drinks = true; ruleTriggered = true
      if (sum === 5) msg = t('messages.sum5')
      else if (sum === 8) msg = t('messages.sum8')
      else msg = t('messages.m3Drinks')
    }
    if (isDouble) {
      msg += msg ? ' — ' : ''
      msg += t('messages.double', { name: p.name })
      ruleTriggered = true
    }

    if (m3Drinks && monsieur3Index !== -1) {
      const updated = [...players]
      updated[monsieur3Index].score += 1
      setPlayers(updated)
    }

    if (!ruleTriggered) {
      msg = t('messages.noRule', { d1: dice1, d2: dice2 })
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
        setMessage(t('messages.turnNext', { name: players[next].name }))
        setCanRoll(true)
      }
    }, 900)
  }

  const restartGame = () => {
    if (!initialBasePlayers?.length) return
    session.clear()
    setStarted(true)
    setPlayers(initialBasePlayers.map(p => ({
      name: p?.name || 'Joueur', isMonsieur3: false, score: 0,
      preferences: p?.preferences || {}, id: p?.id || crypto.randomUUID(),
    })))
    setCurrentPlayerIndex(0)
    setDice({ dice1: 1, dice2: 1 })
    setRolling(false)
    setGamePhase('setup')
    setMessage(t('messages.setupStart'))
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

  if (session.pending) {
    return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  }

  return (
    <div className="w-full relative text-cream">
      {/* Header fixe */}
      <div className="fixed top-0 inset-x-0 z-30 border-b border-gold/20 bg-felt-deep/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <h1 className="font-display text-lg font-bold text-gold">
            {t('title')}
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={restartGame} className="rounded-xl border border-gold/20 bg-black/20 p-2 text-cream/70 transition hover:text-gold" aria-label={t('newGame')}>
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={onGameEnd} className="rounded-xl border border-gold/20 bg-black/20 p-2 text-cream/70 transition hover:text-gold" aria-label={t('backToGames')}>
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className={cn("mx-auto max-w-xl px-4 pt-6 space-y-4 sm:pt-8", gameActionBarPadding())}>

        {/* Phase indicator */}
        <div className="flex items-center gap-2">
          <span className={cn(
            'rounded-lg border px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-[0.2em]',
            gamePhase === 'setup' ? 'border-gold/30 bg-gold/10 text-gold' : 'border-suit-red/30 bg-suit-red/20 text-red-300'
          )}>
            {gamePhase === 'setup' ? t('phaseSetup') : t('phasePlay')}
          </span>
          {monsieur3Player && (
            <span className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-semibold text-gold">
              {t('m3Badge', { name: monsieur3Player.name, count: monsieur3Player.score })}
            </span>
          )}
        </div>

        {/* Joueur actif */}
        {currentPlayer && (
          <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 px-4 py-3 flex items-center gap-3">
            <PlayerIcon player={currentPlayer} size="md" className="h-10 w-10 text-xl" />
            <div className="flex-1 min-w-0">
              <p className="mb-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('activePlayer')}</p>
              <PlayerName player={currentPlayer} className={cn('font-display font-bold text-cream text-base truncate', isSpecialPlayer(currentPlayer) && getSpecialEffectClass(currentPlayer))} />
            </div>
            {currentPlayer.isMonsieur3 && (
              <span className="shrink-0 rounded-lg border border-suit-red/30 bg-suit-red/20 px-2.5 py-1 text-[11px] font-bold text-red-300">
                {t('m3Label')}
              </span>
            )}
          </div>
        )}

        {/* Zone des dés */}
        <div ref={confettiRef} className="relative rounded-2xl border border-gold/15 bg-felt-deep/70 p-6 overflow-hidden">
          <div className="relative flex items-center justify-center gap-6 mb-5">
            <Die value={dice.dice1} rolling={rolling} highlight={dice.dice1 === 3} />
            {gamePhase !== 'setup' && (
              <>
                <span className="text-gold/40 text-2xl font-thin">+</span>
                <Die value={dice.dice2} rolling={rolling} highlight={dice.dice2 === 3} />
                {!rolling && gamePhase === 'play' && (
                  <div className="absolute -bottom-1 right-4 flex items-center gap-1 rounded-lg border border-gold/30 bg-black/40 px-2.5 py-1 text-xs text-cream/60">
                    {t('sum')} <span className="font-display font-bold text-gold ml-1">{dice.dice1 + dice.dice2}</span>
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
              className="text-center font-display text-base font-semibold text-gold min-h-[2.5rem] flex items-center justify-center px-2"
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
                className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-2xl z-10"
              >
                <div className="rounded-2xl bg-amber-500 px-6 py-4 font-display text-2xl font-bold text-black shadow-2xl">
                  {specialMessage}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Liste des joueurs */}
        <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
          <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('players')}</p>
          <div className="space-y-1">
            {players.map((p, i) => {
              const isCurrent = i === currentPlayerIndex
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all',
                    isCurrent ? 'border border-gold/60 bg-gold/[0.15]' : 'border border-gold/20 bg-black/20'
                  )}
                >
                  <PlayerIcon player={p} size="sm" className="h-7 w-7 text-sm" />
                  <PlayerName player={p} className={cn('text-sm font-medium flex-1 truncate', isCurrent ? 'text-cream' : 'text-cream/60', isSpecialPlayer(p) && getSpecialEffectClass(p))} />
                  {p.isMonsieur3 && (
                    <span className="rounded-lg border border-suit-red/30 bg-suit-red/20 px-2 py-0.5 text-[10px] font-bold text-red-300">M3</span>
                  )}
                  {p.isMonsieur3 && p.score > 0 && (
                    <span className="text-xs text-red-300 font-semibold">{p.score}🍺</span>
                  )}
                  {isCurrent && !p.isMonsieur3 && (
                    <div className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Historique */}
        {rollHistory.length > 0 && (
          <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 overflow-hidden">
            <button
              onClick={() => setShowHistory(v => !v)}
              aria-expanded={showHistory}
              aria-controls="roll-history"
              className="flex w-full items-center justify-between px-4 py-3 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75 hover:text-gold transition"
            >
              <span>{t('history', { count: rollHistory.length })}</span>
              <span>{showHistory ? '▲' : '▼'}</span>
            </button>
            {showHistory && (
              <div id="roll-history" className="border-t border-gold/10 px-4 pb-3 pt-2 max-h-48 overflow-y-auto space-y-1.5">
                {[...rollHistory].reverse().map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-cream/60">
                    <span className="shrink-0 font-semibold text-cream">{r.player}</span>
                    <span className="shrink-0 rounded border border-gold/20 bg-black/20 px-1.5 py-0.5 font-mono text-gold">
                      {r.dice.dice1}{r.dice.dice2 !== 1 ? `+${r.dice.dice2}` : ''}
                    </span>
                    <span className="flex-1 text-cream/50">{r.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <GameFixedActionBar>
        <button
          onClick={rollDice}
          disabled={!canRoll || rolling || victoryScreen || players.length === 0}
          aria-label={rolling ? t('rolling') : t('rollPlay')}
          className="w-full rounded-2xl bg-amber-500 py-4 text-base font-bold text-black shadow-none transition-transform [touch-action:manipulation] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-amber-400"
        >
          {rolling ? t('rolling') : gamePhase === 'setup' ? t('rollSetup') : t('rollPlay')}
        </button>
      </GameFixedActionBar>

      {/* Écran de victoire */}
      <AnimatePresence>
        {victoryScreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4"
          >
            {/* Défilable, carte centrée par my-auto (et non items-center) : avec
                l'avis de première partie, la carte peut dépasser un petit écran,
                et un contenu centré qui déborde perdait son haut ET ses boutons. */}
            <motion.div
              initial={{ scale: 0.85, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', duration: 0.6 }}
              className="relative my-auto w-full max-w-sm overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep p-6 text-cream shadow-2xl"
            >
              <div className="relative space-y-5 text-center">
                <h2 className="font-display text-2xl font-bold text-gold">{t('gameOver')}</h2>

                {monsieur3Player && (
                  <div className="rounded-xl border border-gold/30 bg-gold/10 p-4">
                    <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">{t('m3Title')}</p>
                    <p className="font-display text-xl font-bold text-cream">{monsieur3Player.name}</p>
                    <p className="mt-1 font-display text-3xl font-bold text-gold">{monsieur3Player.score} 🍺</p>
                    <p className="text-xs text-cream/60 mt-1">{t('sipsDrunk', { count: monsieur3Player.score })}</p>
                  </div>
                )}

                <FirstGameFeedbackCard mode="local" gameId="monsieur-3" />

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={restartGame}
                    className="rounded-2xl bg-amber-500 py-3 text-sm font-bold text-black shadow-none hover:bg-amber-400"
                  >
                    {t('replay')}
                  </button>
                  <button
                    onClick={onGameEnd}
                    className="rounded-2xl border border-gold/25 bg-black/20 py-3 text-sm font-semibold text-cream/80 hover:bg-black/30 hover:text-cream"
                  >
                    {t('menu')}
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
