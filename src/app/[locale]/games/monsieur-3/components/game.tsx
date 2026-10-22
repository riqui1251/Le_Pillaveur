"use client"

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronDown, Dices, Repeat, RotateCcw } from 'lucide-react'
import { CONFETTI_COLORS, fireConfetti, preloadConfetti } from '@/components/online/EndConfetti'
import { Player as BasePlayer, PlayerPreferences } from '@/lib/players'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { Button } from '@/components/ui/button'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { GameShell } from '@/components/game/GameShell'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { EndActionDock } from '@/components/game/EndActionDock'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { PulsingCount } from '@/components/petit-buveur/drink-feedback'
import { cn } from '@/lib/utils'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import { usePlayers } from '@/hooks/usePlayers'
import { countFace, diceTones, playOutcome, type DiceRoll, type DieTone } from '../rules'

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

interface HistoryEntry {
  player: string
  dice: DiceRoll
  message: string
  /** Absent des anciennes sauvegardes : on retombe alors sur l'ancienne lecture des dés. */
  phase?: 'setup' | 'play'
}

/**
 * Dernier événement de la table, typé : l'écran en tire la carte verdict
 * (qui boit, qui relance, à qui la main) dans la langue courante, avec les
 * noms de la table courante.
 */
type Verdict =
  | { kind: 'setupStart' }
  | { kind: 'setupRoll'; playerId: string; roll: number }
  | { kind: 'found'; playerId: string }
  | { kind: 'turn' }
  | { kind: 'play'; playerId: string; dice: DiceRoll }

type VerdictTone = 'info' | 'drink' | 'gesture' | 'duel' | 'found' | 'end'

interface VerdictView {
  tone: VerdictTone
  title?: string
  lines: (string | null)[]
}

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
  /** Absent des sauvegardes antérieures, qui portaient un message déjà traduit. */
  verdict?: Verdict
  rollHistory: HistoryEntry[]
  setupRolls: { playerName: string; roll: number }[]
  monsieur3Found: boolean
  monsieur3Index: number
  dice: DiceRoll
}

const ROLL_MS = 800
/**
 * Le résultat reste à l'écran avant que la main passe : le flash « passe le
 * téléphone » le couvrait sinon à l'instant où les dés s'arrêtaient.
 */
const RESULT_HOLD_MS = 900
const FOUND_HOLD_MS = 3000
const END_DELAY_MS = 800

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

function Die({ value, rolling, tone, reduced }: { value: number; rolling: boolean; tone: DieTone; reduced: boolean }) {
  return (
    <motion.div
      role="img"
      aria-label={String(value)}
      animate={rolling && !reduced ? { rotate: [0, -12, 12, -8, 8, 0], scale: [1, 1.08, 0.95, 1.05, 1] } : {}}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
      className={cn(
        // shrink-0 : les points sont en absolu, un dé compressible tombait en
        // rectangle sur un écran étroit.
        'relative h-[88px] w-[88px] shrink-0 rounded-2xl border-2 border-[#D8CCAE] bg-cream shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-shadow duration-300',
        tone === 'drink' && 'ring-4 ring-red-400 ring-offset-2 ring-offset-felt-deep',
        tone === 'duel' && 'ring-4 ring-gold ring-offset-2 ring-offset-felt-deep',
        rolling && 'shadow-[0_0_32px_rgb(var(--gold-rgb)/0.35)]'
      )}
    >
      {(DOT_POSITIONS[value] || []).map((pos, i) => (
        <div key={i} className={DOT_CLASS[pos]}>
          <div className={cn('h-4 w-4 rounded-full', value === 3 ? 'bg-suit-red' : 'bg-[#24201A]')} />
        </div>
      ))}
    </motion.div>
  )
}

const VERDICT_SURFACE: Record<VerdictTone, string> = {
  info: 'text-cream/80',
  drink: 'bg-suit-red text-cream shadow-[0_12px_28px_-14px_rgba(179,56,46,0.9)]',
  gesture: 'bg-amber-500 text-[#24201A]',
  found: 'bg-amber-500 text-[#24201A]',
  duel: 'border-2 border-gold bg-felt-deep/80 text-cream',
  end: 'border-2 border-gold bg-felt-deep/80 text-cream',
}

/** Lecture des dés d'une ligne d'historique : un seul dé pendant la recherche. */
function historyDice(entry: HistoryEntry): string {
  const { dice1, dice2 } = entry.dice
  if (entry.phase === 'setup') return String(dice1)
  if (entry.phase === 'play') return `${dice1} + ${dice2}`
  return dice2 !== 1 ? `${dice1} + ${dice2}` : String(dice1)
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function Game({ players: initialBasePlayers, onGameEnd }: GameProps) {
  const t = useTranslations('games.monsieur-3')
  const tc = useTranslations('common')
  const reduced = useReducedMotion() ?? false
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [dice, setDice] = useState<DiceRoll>({ dice1: 1, dice2: 1 })
  const [rolling, setRolling] = useState(false)
  const [gamePhase, setGamePhase] = useState<'setup' | 'play' | 'end'>('setup')
  const [verdict, setVerdict] = useState<Verdict>({ kind: 'setupStart' })
  const [rollHistory, setRollHistory] = useState<HistoryEntry[]>([])
  const [canRoll, setCanRoll] = useState(false)
  const [setupRolls, setSetupRolls] = useState<{ playerName: string; roll: number }[]>([])
  const [monsieur3Found, setMonsieur3Found] = useState(false)
  const [gameEnded, setGameEnded] = useState(false)
  const [monsieur3Index, setMonsieur3Index] = useState(-1)
  const [victoryScreen, setVictoryScreen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [confirmDialog, confirm] = useConfirmAction()

  const [started, setStarted] = useState(false)
  const session = useResumableLocalGame<Monsieur3Save>(SAVE_ID, SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerStates.map((st) => st.id), initialBasePlayers)
  )
  const { updatePlayerStats } = usePlayers()

  // Enchaînements en attente (dés qui roulent, main qui passe, annonce de
  // Monsieur 3) : annulés à la nouvelle partie et au démontage, sinon un
  // délai en suspens réécrivait la partie neuve.
  const pendingRef = useRef<{
    timers: Set<ReturnType<typeof setTimeout>>
    interval: ReturnType<typeof setInterval> | null
  }>({ timers: new Set(), interval: null })

  const later = (fn: () => void, ms: number) => {
    const pending = pendingRef.current
    const id = setTimeout(() => {
      pending.timers.delete(id)
      fn()
    }, ms)
    pending.timers.add(id)
  }

  const cancelPending = () => {
    const pending = pendingRef.current
    pending.timers.forEach(clearTimeout)
    pending.timers.clear()
    if (pending.interval) clearInterval(pending.interval)
    pending.interval = null
  }

  useEffect(() => {
    const pending = pendingRef.current
    return () => {
      pending.timers.forEach(clearTimeout)
      pending.timers.clear()
      if (pending.interval) clearInterval(pending.interval)
    }
  }, [])

  const diceZoneRef = useRef<HTMLDivElement>(null)
  // La bibliothèque arrive par import dynamique : on la précharge au montage
  // pour que la première salve parte avec le lancer, pas une requête après.
  useEffect(() => {
    preloadConfetti()
  }, [])

  const launchConfetti = () => {
    // Zone des dés démontée (écran de fin) : salve depuis le haut de l'écran.
    const rect = diceZoneRef.current?.getBoundingClientRect()
    const origin = rect
      ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: rect.top / window.innerHeight + 0.1 }
      : { x: 0.5, y: 0.3 }
    fireConfetti({ particleCount: 60, spread: 80, origin, colors: CONFETTI_COLORS })
    later(() => fireConfetti({ particleCount: 40, angle: 60, spread: 55, origin, colors: CONFETTI_COLORS }), 300)
    later(() => fireConfetti({ particleCount: 40, angle: 120, spread: 55, origin, colors: CONFETTI_COLORS }), 500)
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
    setVerdict({ kind: 'setupStart' })
    setCurrentPlayerIndex(0)
    setCanRoll(true)
    setMonsieur3Index(-1)
    setVictoryScreen(false)
    setSetupRolls([])
    setRollHistory([])
    setMonsieur3Found(false)
    setGameEnded(false)
  }, [initialBasePlayers, session.ready, session.pending, started])

  // Sauvegarde continue tant que la partie n'est pas finie — pas pendant que
  // les dés roulent (une écriture toutes les 50 ms pour des faces de passage).
  useEffect(() => {
    if (!started || gameEnded || rolling || players.length === 0) return
    session.save({
      playerStates: players.map(p => ({ id: p.id, score: p.score, isMonsieur3: p.isMonsieur3 })),
      currentPlayerIndex,
      gamePhase,
      verdict,
      rollHistory,
      setupRolls,
      monsieur3Found,
      monsieur3Index,
      dice,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, gameEnded, rolling, players, currentPlayerIndex, gamePhase, verdict, rollHistory, setupRolls, monsieur3Found, monsieur3Index, dice])

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
    const restored: Player[] = saved.playerStates.map(st => {
      const base = initialBasePlayers.find(p => p.id === st.id)
      return {
        name: base?.name || 'Joueur',
        isMonsieur3: st.isMonsieur3,
        score: st.score,
        preferences: base?.preferences,
        id: st.id,
      }
    })
    setPlayers(restored)
    setRollHistory(saved.rollHistory)
    setSetupRolls(saved.setupRolls)
    setDice(saved.dice)
    const m3At = restored.findIndex(p => p.isMonsieur3)
    if (saved.gamePhase === 'setup' && m3At !== -1) {
      // Sauvegarde prise pendant l'annonce de Monsieur 3 (désigné, partie pas
      // encore lancée) : on finit la bascule, sinon le lanceur reprenait la
      // recherche et la table pouvait se retrouver avec deux Monsieur 3.
      setGamePhase('play')
      setMonsieur3Found(true)
      setMonsieur3Index(m3At)
      setCurrentPlayerIndex((m3At + 1) % restored.length)
      setVerdict({ kind: 'turn' })
    } else {
      setGamePhase(saved.gamePhase)
      setMonsieur3Found(saved.monsieur3Found)
      setMonsieur3Index(saved.monsieur3Index)
      setCurrentPlayerIndex(saved.currentPlayerIndex)
      setVerdict(saved.verdict ?? (saved.gamePhase === 'setup' ? { kind: 'setupStart' } : { kind: 'turn' }))
    }
    setRolling(false)
    setGameEnded(false)
    setVictoryScreen(false)
    setCanRoll(true)
    setStarted(true)
  }

  const currentPlayer = players[currentPlayerIndex]
  const monsieur3Player = players.find(p => p.isMonsieur3)

  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? ''
  const nextNameAfter = (id: string) => {
    const i = players.findIndex(p => p.id === id)
    return i === -1 ? '' : players[(i + 1) % players.length]?.name ?? ''
  }

  /** Carte verdict d'un événement : qui boit et combien, nommément. */
  const describeVerdict = (v: Verdict): VerdictView => {
    switch (v.kind) {
      case 'setupStart':
        return { tone: 'info', lines: [t('messages.setupStart')] }
      case 'turn':
        return { tone: 'info', lines: [t('messages.turnNext', { name: currentPlayer?.name ?? '' })] }
      case 'setupRoll':
        return {
          tone: 'info',
          lines: [
            t('messages.rollResult', { name: nameOf(v.playerId), roll: v.roll }),
            t('verdict.handTo', { name: nextNameAfter(v.playerId) }),
          ],
        }
      case 'found':
        return { tone: 'found', title: t('messages.foundSpecial'), lines: [t('messages.foundM3', { name: nameOf(v.playerId) })] }
      case 'play': {
        const roller = players.find(p => p.id === v.playerId)
        const rollerName = roller?.name ?? ''
        const m3Name = monsieur3Player?.name ?? ''
        const out = playOutcome(v.dice, Boolean(roller?.isMonsieur3))
        if (out.endsGame) {
          return { tone: 'end', title: t('gameOver'), lines: [t('verdict.end', { name: rollerName })] }
        }
        const duel = out.double ? `${t('verdict.double')} ${t('verdict.duel', { name: rollerName })}` : null
        if (out.trigger === 'sum5' || out.trigger === 'sum8') {
          return {
            tone: 'gesture',
            title: out.trigger === 'sum5' ? t('verdict.sum5') : t('verdict.sum8'),
            lines: [t('verdict.lastDrinks'), t('verdict.m3Too', { name: m3Name }), duel],
          }
        }
        if (out.trigger) {
          const title =
            out.trigger === 'three'
              ? t('verdict.three', { count: countFace(v.dice, 3) })
              : out.trigger === 'five'
                ? t('verdict.five', { count: countFace(v.dice, 5) })
                : t('verdict.sum3')
          return { tone: 'drink', title, lines: [t('verdict.m3Drinks', { name: m3Name }), duel] }
        }
        if (out.double) {
          return { tone: 'duel', title: t('verdict.double'), lines: [t('verdict.duel', { name: rollerName })] }
        }
        return { tone: 'info', lines: [t('verdict.nothing', { name: nextNameAfter(v.playerId) })] }
      }
    }
  }

  const historyText = (v: Verdict) => {
    const view = describeVerdict(v)
    return [view.title, ...view.lines].filter(Boolean).join(' ')
  }

  const rollDice = () => {
    if (!canRoll || rolling) return
    setRolling(true)
    setCanRoll(false)
    const setup = gamePhase === 'setup'
    const pending = pendingRef.current
    if (pending.interval) clearInterval(pending.interval)
    // Animations réduites : pas de défilé des faces (vingt changements par
    // seconde), le dé affiche directement son résultat à la fin du lancer.
    pending.interval = reduced
      ? null
      : setInterval(() => {
          setDice({ dice1: rollDie(), dice2: setup ? 1 : rollDie() })
        }, 50)

    later(() => {
      if (pending.interval) clearInterval(pending.interval)
      pending.interval = null
      const d1 = rollDie()
      const d2 = setup ? 1 : rollDie()
      setDice({ dice1: d1, dice2: d2 })
      setRolling(false)
      if (setup) handleSetupRoll(d1)
      else handlePlayRoll({ dice1: d1, dice2: d2 })
    }, ROLL_MS)
  }

  const handleSetupRoll = (roll: number) => {
    const p = players[currentPlayerIndex]
    const next = (currentPlayerIndex + 1) % players.length
    setSetupRolls(prev => [...prev, { playerName: p.name, roll }])

    if (roll === 3) {
      setPlayers(prev => prev.map((pl, i) => (i === currentPlayerIndex ? { ...pl, isMonsieur3: true } : pl)))
      setMonsieur3Index(currentPlayerIndex)
      const found: Verdict = { kind: 'found', playerId: p.id }
      setVerdict(found)
      launchConfetti()
      setRollHistory(prev => [...prev, { player: p.name, dice: { dice1: roll, dice2: 1 }, message: historyText(found), phase: 'setup' }])

      later(() => {
        setMonsieur3Found(true)
        setCurrentPlayerIndex(next)
        setGamePhase('play')
        setVerdict({ kind: 'turn' })
        setCanRoll(true)
      }, FOUND_HOLD_MS)
    } else {
      const v: Verdict = { kind: 'setupRoll', playerId: p.id, roll }
      setVerdict(v)
      setRollHistory(prev => [...prev, { player: p.name, dice: { dice1: roll, dice2: 1 }, message: historyText(v), phase: 'setup' }])
      setCurrentPlayerIndex(next)
      later(() => setCanRoll(true), RESULT_HOLD_MS)
    }
  }

  const handlePlayRoll = (diceRoll: DiceRoll) => {
    const p = players[currentPlayerIndex]
    const outcome = playOutcome(diceRoll, p.isMonsieur3)
    const v: Verdict = { kind: 'play', playerId: p.id, dice: diceRoll }
    setVerdict(v)
    setRollHistory(prev => [...prev, { player: p.name, dice: diceRoll, message: historyText(v), phase: 'play' }])

    if (outcome.endsGame) {
      setGameEnded(true)
      later(() => {
        setVictoryScreen(true)
        launchConfetti()
        later(launchConfetti, 1200)
      }, END_DELAY_MS)
      return
    }

    if (outcome.m3Drinks && monsieur3Index !== -1) {
      setPlayers(prev => prev.map((pl, i) => (i === monsieur3Index ? { ...pl, score: pl.score + 1 } : pl)))
    }
    // Une règle est tombée : le même joueur relance ; sinon la main passe.
    if (!outcome.rollAgain) setCurrentPlayerIndex((currentPlayerIndex + 1) % players.length)
    later(() => setCanRoll(true), RESULT_HOLD_MS)
  }

  const restartGame = () => {
    if (!initialBasePlayers?.length) return
    cancelPending()
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
    setVerdict({ kind: 'setupStart' })
    setRollHistory([])
    setCanRoll(true)
    setSetupRolls([])
    setMonsieur3Found(false)
    setGameEnded(false)
    setMonsieur3Index(-1)
    setVictoryScreen(false)
  }

  const askRestart = async () => {
    // Avant le premier lancer, il n'y a rien à perdre : pas de question.
    if (rollHistory.length > 0) {
      const ok = await confirm({
        title: tc('confirmRestart.title'),
        description: tc('confirmRestart.description'),
        confirmLabel: tc('confirmRestart.confirm'),
        cancelLabel: tc('confirmRestart.cancel'),
        tone: 'danger',
      })
      if (!ok) return
    }
    restartGame()
  }

  if (session.pending) {
    return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  }

  const lastOutcome =
    verdict.kind === 'play'
      ? playOutcome(verdict.dice, Boolean(players.find(p => p.id === verdict.playerId)?.isMonsieur3))
      : null
  const rollAgainName =
    verdict.kind === 'play' && lastOutcome?.rollAgain && !lastOutcome.endsGame ? nameOf(verdict.playerId) : null
  const tones: [DieTone, DieTone] = rolling
    ? [null, null]
    : verdict.kind === 'play' && lastOutcome
      ? diceTones(verdict.dice, lastOutcome)
      : verdict.kind === 'found'
        ? ['drink', null]
        : [null, null]
  const showSum = gamePhase === 'play' && verdict.kind === 'play' && !rolling
  const view = describeVerdict(verdict)
  const verdictKey = `${verdict.kind}-${rollHistory.length}`
  const m3Turn = gamePhase === 'play' && Boolean(currentPlayer?.isMonsieur3) && !gameEnded

  const currentName = currentPlayer?.name ?? ''
  // Pendant l'annonce (3 s), la main n'a pas encore passé : « Léa, lance le
  // dé » grisé laissait croire que le nouveau Monsieur 3 devait relancer.
  const rollLabel = rolling
    ? t('rolling')
    : verdict.kind === 'found'
      ? t('messages.foundSpecial')
      : gamePhase === 'setup'
        ? t('rollSetupNamed', { name: currentName })
        : rollAgainName && verdict.kind === 'play' && verdict.playerId === currentPlayer?.id
          ? t('rollAgainNamed', { name: currentName })
          : t('rollPlayNamed', { name: currentName })

  // Le flash ne part que quand la main est prête : pendant le lancer et le
  // temps de lecture du résultat, la clé est nulle (un retour à la même clé,
  // une relance, ne flashe pas).
  const handKey = canRoll && !rolling ? currentPlayer?.id : null

  const historyPanel = rollHistory.length > 0 && (
    <section className="rounded-2xl border border-gold/20 bg-felt-deep/70">
      <button
        type="button"
        onClick={() => setShowHistory(v => !v)}
        aria-expanded={showHistory}
        aria-controls="m3-roll-history"
        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold transition hover:text-gold/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
      >
        <span>{t('history', { count: rollHistory.length })}</span>
        <ChevronDown aria-hidden className={cn('h-4 w-4 shrink-0 transition-transform', showHistory && 'rotate-180')} />
      </button>
      {showHistory && (
        <ol id="m3-roll-history" className="max-h-[14rem] space-y-2 overflow-y-auto border-t border-gold/10 px-4 pb-3 pt-2 text-left">
          {[...rollHistory].reverse().map((r, i) => (
            <li key={rollHistory.length - i} className="flex items-start gap-2 text-sm">
              <span className="shrink-0 font-semibold text-cream">{r.player}</span>
              <span className="shrink-0 rounded border border-gold/20 bg-black/20 px-1.5 font-mono text-xs leading-5 text-gold tabular-nums">
                {historyDice(r)}
              </span>
              <span className="min-w-0 flex-1 text-cream/70">{r.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )

  const restartButton = (
    <Button
      variant="ghost"
      size="gameIcon"
      onClick={() => void askRestart()}
      aria-label={t('newGame')}
      className="border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
    >
      <RotateCcw aria-hidden className="h-5 w-5" />
    </Button>
  )

  const rollButton = (
    <Button
      variant="primary"
      size="gameLg"
      onClick={rollDice}
      disabled={!canRoll || rolling || gameEnded || players.length === 0}
      className="w-full min-w-0 gap-2 [touch-action:manipulation]"
    >
      <Dices aria-hidden className={cn('h-5 w-5 shrink-0', rolling && 'motion-safe:animate-spin')} />
      <span className="min-w-0 truncate">{rollLabel}</span>
    </Button>
  )

  return (
    <>
      {confirmDialog}
      <PassPhoneOverlay
        playerKey={handKey}
        name={currentName}
        avatar={currentPlayer ? <PlayerIcon player={currentPlayer} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
        enabled={!victoryScreen && !gameEnded}
      />
      <GameShell
        title={t('title')}
        // À l'écran de fin, le titre « Partie terminée ! » est déjà dans la page.
        headerSubtitle={victoryScreen ? undefined : gamePhase === 'setup' ? t('phaseSetup') : t('phasePlay')}
        onBack={onGameEnd}
        maxWidth={576}
        // Cale de 44 px à l'écran de fin : sans elle, le titre glissait à
        // droite du ← au lieu de rester centré.
        headerRight={victoryScreen ? <span aria-hidden className="h-11 w-11" /> : restartButton}
        actionBar={victoryScreen ? undefined : rollButton}
        contentClassName="gap-3"
      >
        {victoryScreen ? (
          <>
            <motion.div
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="mx-auto flex w-full max-w-sm flex-col gap-4 text-center"
            >
              <h2 className="font-display text-3xl font-bold text-gold">{t('gameOver')}</h2>
              {monsieur3Player && (
                <div className="rounded-2xl border border-gold/30 bg-felt-deep/80 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">{t('m3Label')}</p>
                  <div className="mt-3 flex min-w-0 items-center justify-center gap-3">
                    <PlayerIcon player={monsieur3Player} size="lg" />
                    <PlayerName player={monsieur3Player} className="min-w-0 truncate font-display text-2xl font-bold text-cream" />
                  </div>
                  <p className="mt-3 font-display text-5xl font-bold leading-none text-gold tabular-nums">
                    {monsieur3Player.score} <span aria-hidden>🍺</span>
                  </p>
                  <p className="mt-1 text-sm text-cream/70">{t('sipsDrunk', { count: monsieur3Player.score })}</p>
                </div>
              )}
              {historyPanel}
            </motion.div>

            <EndActionDock
              voiceGutter={false}
              feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="monsieur-3" />}
            >
              <Button variant="primary" size="gameLg" className="w-full gap-2" onClick={restartGame}>
                <RotateCcw aria-hidden className="h-5 w-5" />
                {t('replay')}
              </Button>
              <Button variant="quiet" size="game" className="w-full" onClick={onGameEnd}>
                {t('menu')}
              </Button>
            </EndActionDock>
          </>
        ) : (
          <>
            {/* Zone des dés : dés, somme SOUS les dés, puis le verdict. */}
            <div ref={diceZoneRef} className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
              <div className="flex items-center justify-center gap-4">
                <Die value={dice.dice1} rolling={rolling} tone={tones[0]} reduced={reduced} />
                {gamePhase !== 'setup' && (
                  <>
                    <span aria-hidden className="font-display text-2xl text-gold/60">+</span>
                    <Die value={dice.dice2} rolling={rolling} tone={tones[1]} reduced={reduced} />
                  </>
                )}
              </div>

              {gamePhase !== 'setup' && (
                <p className="mt-3 flex h-9 items-center justify-center gap-2">
                  {showSum && (
                    <>
                      <span className="text-sm font-semibold text-cream/70">{t('sum')}</span>
                      <span className="font-display text-3xl font-bold leading-none text-gold tabular-nums">
                        {dice.dice1 + dice.dice2}
                      </span>
                    </>
                  )}
                </p>
              )}

              {/* Pendant le lancer, le verdict précédent reste en place, estompé :
                  démonté, il faisait sauter deux fois par lancer le jeton de
                  Monsieur 3 et la liste des joueurs. */}
              <div role="status" aria-live="polite" className="mt-3 min-h-[4.5rem]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={verdictKey}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className={cn(
                        'flex flex-col items-center gap-2 transition-opacity duration-200',
                        rolling && 'opacity-40'
                      )}
                    >
                      <div
                        className={cn(
                          'flex min-h-[4.5rem] w-full flex-col items-center justify-center gap-1 rounded-2xl px-4 py-3 text-center',
                          VERDICT_SURFACE[view.tone]
                        )}
                      >
                        {view.title && (
                          <p
                            className={cn(
                              'font-display text-2xl font-bold leading-tight',
                              (view.tone === 'duel' || view.tone === 'end') && 'text-gold'
                            )}
                          >
                            {view.title}
                          </p>
                        )}
                        {view.lines.filter(Boolean).map((line, i) => (
                          <p
                            key={i}
                            className={cn(
                              view.tone === 'info'
                                ? 'text-sm'
                                : i === 0
                                  ? 'text-lg font-semibold leading-snug'
                                  : 'text-sm font-semibold'
                            )}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                      {rollAgainName && (
                        <p className="inline-flex items-center gap-1.5 rounded-full bg-gold/20 px-3 py-1 text-sm font-semibold text-gold">
                          <Repeat aria-hidden className="h-4 w-4" />
                          {t('verdict.rollAgain', { name: rollAgainName })}
                        </p>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Jeton de Monsieur 3 : son compteur de gorgées, en grand. */}
            {monsieur3Player && (
              <section
                aria-label={t('m3Label')}
                className="rounded-2xl border border-suit-red/60 bg-felt-deep/80 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <PlayerIcon player={monsieur3Player} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">{t('m3Label')}</p>
                    <PlayerName player={monsieur3Player} className="block max-w-full truncate font-display text-lg font-bold text-cream" />
                  </div>
                  <div className="shrink-0 text-center">
                    <p className="font-display text-3xl font-bold leading-none text-cream tabular-nums">
                      <PulsingCount value={monsieur3Player.score} className="inline-block" />
                      <span aria-hidden className="ml-1 text-2xl">🍺</span>
                    </p>
                    <p className="mt-1 text-xs text-cream/70">{t('sipsDrunk', { count: monsieur3Player.score })}</p>
                  </div>
                </div>
                {m3Turn && <p className="mt-2 text-sm text-cream/80">{t('m3Rolling')}</p>}
              </section>
            )}

            {/* Joueurs, en puces : le tour en or, Monsieur 3 marqué. */}
            <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('players')}</h2>
              <ul className="flex flex-wrap gap-2">
                {players.map((p, i) => {
                  const isCurrent = i === currentPlayerIndex
                  return (
                    <li
                      key={p.id}
                      aria-current={isCurrent ? 'true' : undefined}
                      className={cn(
                        'flex h-10 max-w-full items-center gap-1.5 rounded-full border pl-1.5 pr-3',
                        isCurrent ? 'border-gold bg-gold/20 text-cream' : 'border-gold/20 bg-black/20 text-cream/80'
                      )}
                    >
                      <PlayerIcon player={p} size="sm" />
                      <PlayerName player={p} className={cn('min-w-0 truncate text-sm', isCurrent ? 'font-bold' : 'font-medium')} />
                      {p.isMonsieur3 && (
                        <span className="shrink-0 rounded-md bg-suit-red px-1.5 py-0.5 text-xs font-bold leading-none text-cream">M3</span>
                      )}
                      {isCurrent && <Dices aria-hidden className="h-4 w-4 shrink-0 text-gold" />}
                    </li>
                  )
                })}
              </ul>
            </section>

            {historyPanel}
          </>
        )}
      </GameShell>
    </>
  )
}
