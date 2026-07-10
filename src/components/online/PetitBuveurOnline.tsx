"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Dice6, ArrowLeft, RefreshCw, Home, Beer, Trophy, Sparkles, Target, Shuffle, User, HelpCircle, History, X, Volume2, VolumeX } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PLAYER_ICONS } from '@/lib/players'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { DiceOverlay, type DiceOverlayState } from '@/components/petit-buveur/DiceOverlay'
import { TurnOverlay } from '@/components/petit-buveur/TurnOverlay'
import { useSteppedPositions } from '@/components/petit-buveur/useSteppedPositions'
import { useDrinkDeltas, FloatingDrinkBadge, PulsingCount } from '@/components/petit-buveur/drink-feedback'
import { useGameSounds } from '@/hooks/useGameSounds'
import { CaseRevealCard } from '@/components/petit-buveur/CaseRevealCard'
import { getCaseMeta } from '@/lib/petit-buveur/case-families'
import { InteractionSpectacle } from '@/components/petit-buveur/InteractionSpectacle'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial, type TutorialStep } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import type { EngineState } from '@/lib/petit-buveur/engine'
import '@/styles/petit-buveur-board.css'

/**
 * Écran de jeu Petit Buveur EN LIGNE (serveur-autoritaire).
 *
 * Reprend le langage visuel du mode local (plateau `pb-board-*`, HUD, effets
 * actifs, classement, barre d'action fixe) pour un ressenti cohérent. Affiche
 * l'état poussé par le serveur (SSE + polling de `useOnlineRoom`) et envoie
 * des actions à `POST /.../action` ; le moteur tourne côté serveur.
 */

const BOARD_SIZE = 30
const DIFFICULTY_EMOJI: Record<string, string> = { facile: '🌱', normal: '🌟', difficile: '🔥', extreme: '💀' }

/**
 * L'avertissement AFK (« joue ! ») s'affiche pendant les 60 dernières secondes
 * avant l'expulsion (elle-même à 3 min d'inactivité, validée côté serveur).
 */
const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

/** Cases interactives qui demandent de choisir un joueur cible. */
const TARGET_INTERACTIVE = new Set(['vote', 'echange', 'pile-face', 'defi-chaine'])

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

/** Icône emoji stable par joueur (dérivée de sa position dans la liste, identique pour tous les clients). */
function iconFor(index: number): string {
  return PLAYER_ICONS[index % PLAYER_ICONS.length]
}

type EffectChip = {
  id: string
  icon: string
  title: string
  desc: string
  remaining: number
  playerName: string
  linkedName?: string
  accent: string
}

export function PetitBuveurOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.petit-buveur.online')
  const tPB = useTranslations('games.petit-buveur')
  const tTutorial = useTranslations('games.petit-buveur.tutorial')
  const tutorialSteps = tTutorial.raw('steps') as TutorialStep[]
  const tCase = useTranslations('games.petit-buveur.caseTypes')
  const tGame = useTranslations('games.petit-buveur.game')
  const tDiff = useTranslations('games.petit-buveur.difficultyLabels')
  const [busy, setBusy] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })
  const [diceOverlay, setDiceOverlay] = useState<DiceOverlayState | null>(null)
  const diceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** « Toucher pour passer » : écourte le maintien du résultat. */
  const diceSkipRef = useRef<(() => void) | null>(null)
  // Dernier dé arrivé par SSE/polling — secours si la réponse HTTP du roll se perd.
  const rollFallbackRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (diceTimerRef.current) clearTimeout(diceTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'petit-buveur' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('petit-buveur', inGame)
  const cosmetics = useMemberCosmetics(room)

  // Début de tour côté client : remis à zéro à chaque écriture d'état serveur.
  // Sert de base aux comptes à rebours AFK (l'horloge d'autorité reste le serveur).
  const stateVersion = room?.stateVersion ?? -1
  const turnStartRef = useRef({ version: stateVersion, at: Date.now() })
  if (turnStartRef.current.version !== stateVersion) {
    turnStartRef.current = { version: stateVersion, at: Date.now() }
  }

  // Ticks « arbitre » (premier humain PRÉSENT de la partie) :
  // - tour d'un bot → demande au serveur de jouer UNE action (rythme visible) ;
  // - joueur parti depuis plus de 3 min → demande son remplacement par un bot.
  // La garde expectedVersion rend les ticks concurrents inoffensifs.
  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    const expectedVersion = room.stateVersion
    const send = (action: 'bot' | 'replace-left') => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, expectedVersion }),
      })
    }

    let botTimer: ReturnType<typeof setTimeout> | undefined
    const activeP = view.players[view.currentPlayer]
    if (activeP?.isBot) botTimer = setTimeout(() => send('bot'), 1400)

    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (view.players.some((p) => !p.isBot && p.leftAt)) {
      const check = () => {
        const expired = view.players.some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= ONLINE_REPLACE_GRACE_MS
        )
        if (expired) send('replace-left')
      }
      check()
      replaceTimer = setInterval(check, 5000)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [view, user, room])

  // Tick AFK : si le joueur au tour (humain, présent, pas moi) ne joue rien
  // pendant 3 min, n'importe quel autre client demande son remplacement —
  // le serveur revalide avec SA propre horloge avant d'expulser.
  const afkTarget = view && view.phase !== 'finished' ? view.players[view.currentPlayer] : undefined
  // Surveillé seulement s'il reste un AUTRE humain présent : sans lui, personne
  // ne peut déclencher l'expulsion (le dernier humain n'est jamais expulsable).
  const afkWatchable = Boolean(
    afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      view?.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  useEffect(() => {
    if (!view || !user || !room || !afkWatchable) return
    const activeP = view.players[view.currentPlayer]
    if (!activeP || activeP.id === user.id) return
    const expectedVersion = room.stateVersion
    const check = () => {
      if (Date.now() - turnStartRef.current.at < ONLINE_REPLACE_GRACE_MS) return
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'replace-afk', expectedVersion }),
      })
    }
    const timer = setInterval(check, 5000)
    return () => clearInterval(timer)
  }, [view, user, room, afkWatchable])

  // Avertissement AFK affiché après 1 min sans action du joueur au tour.
  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  // Horloge locale 1s pour les comptes à rebours (retour d'un parti / AFK).
  const someoneLeft = Boolean(view?.players.some((p) => !p.isBot && p.leftAt)) && view?.phase !== 'finished'
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!someoneLeft && !afkWatch) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [someoneLeft, afkWatch])

  // Pions animés case par case + feedback gorgées (voir src/components/petit-buveur/).
  const positionsById = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const p of view?.players ?? []) rec[p.id] = p.position
    return rec
  }, [view])
  // Pions gelés tant que l'overlay du dé est affiché : le déplacement ne
  // démarre qu'après la lecture du résultat (séquence dé → hop → case).
  const { positions: shownPositions } = useSteppedPositions(positionsById, {
    frozen: Boolean(diceOverlay),
  })
  const drinksById = useMemo(() => {
    const rec: Record<string, number> = {}
    for (const p of view?.players ?? []) rec[p.id] = p.drinks
    return rec
  }, [view])
  const drinkDeltas = useDrinkDeltas(drinksById)

  // Mémorise le dé de la vue courante (voir rollFallbackRef dans handleRoll).
  useEffect(() => {
    rollFallbackRef.current = view?.lastDice ?? null
  }, [view])

  // Sons : fanfare de victoire (une seule fois) + toggle mute dans l'en-tête.
  const { muted, toggleMuted, play } = useGameSounds()
  const finishedNow = Boolean(view && (view.phase === 'finished' || view.winner))
  const prevFinishedRef = useRef(false)
  useEffect(() => {
    if (finishedNow && !prevFinishedRef.current) play('victory')
    prevFinishedRef.current = finishedNow
  }, [finishedNow, play])

  // Tant que la partie n'est pas lancée : le lobby gère création/join/prêt/lancer.
  if (!inGame) {
    return <GameOnlineLobby gameId="petit-buveur" />
  }

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
  const caseLabel = (type: string) => tCase(type)
  const difficulty = room.settings?.difficulty && room.settings.difficulty in DIFFICULTY_EMOJI
    ? room.settings.difficulty
    : 'normal'

  // Icône personnalisée du compte si définie, sinon icône stable dérivée de
  // l'index. Les bots (remplaçants inclus) sont signalés par 🤖.
  const iconOf = (id: string) => {
    if (view.players.find((p) => p.id === id)?.isBot) return '🤖'
    return (
      room.members.find((m) => m.userId === id)?.preferences?.icon ??
      iconFor(Math.max(0, view.players.findIndex((p) => p.id === id)))
    )
  }
  // Positions AFFICHÉES (le pion avance case par case, l'état réel a déjà sauté).
  const shownPosOf = (id: string) => shownPositions[id] ?? view.players.find((p) => p.id === id)?.position ?? 0
  const leaderPos = Math.max(...view.players.map((p) => shownPosOf(p.id)))
  const activeShownPos = active ? shownPosOf(active.id) : null

  const effectChips: EffectChip[] = []
  view.players.forEach((p) => {
    if (p.protected && (p.protectionTurnsLeft ?? 0) > 0) {
      effectChips.push({
        id: `prot-${p.id}`, icon: '🛡️', title: tGame('effects.protection'), desc: tGame('effects.protectionDesc'),
        remaining: p.protectionTurnsLeft ?? 1, playerName: p.name, accent: 'border-blue-400/50 bg-blue-500/15',
      })
    }
    if (p.cursed > 0) {
      effectChips.push({
        id: `curse-${p.id}`, icon: '👻', title: tGame('effects.curse'), desc: tGame('effects.curseDesc'),
        remaining: p.cursed, playerName: p.name, accent: 'border-red-400/50 bg-red-500/15',
      })
    }
    if (p.linkedTo && (p.linkedTurns ?? 0) > 0) {
      const linked = view.players.find((o) => o.id === p.linkedTo)
      effectChips.push({
        id: `link-${p.id}`, icon: '🔗', title: tGame('effects.chain'), desc: tGame('effects.chainDesc'),
        remaining: p.linkedTurns ?? 1, playerName: p.name, linkedName: linked?.name,
        accent: 'border-chip-blue/60 bg-chip-blue/20',
      })
    }
    if (p.skipNextTurn) {
      effectChips.push({
        id: `skip-${p.id}`, icon: '⏭️', title: tGame('effects.skipTurn'), desc: tGame('effects.skipTurnDesc'),
        remaining: 1, playerName: p.name, accent: 'border-slate-400/50 bg-slate-500/15',
      })
    }
    if (p.anchored) {
      effectChips.push({
        id: `anchor-${p.id}`, icon: '⚓', title: tGame('effects.anchor'), desc: tGame('effects.anchorDesc'),
        remaining: 1, playerName: p.name, accent: 'border-cyan-400/50 bg-cyan-500/15',
      })
    }
  })

  /** Légende statique de tous les effets possibles (mêmes icônes/couleurs que les pastilles actives). */
  const legendEffects = [
    { icon: '🛡️', title: tGame('effects.protection'), desc: tGame('effects.protectionDesc'), accent: 'border-blue-400/50 bg-blue-500/15' },
    { icon: '👻', title: tGame('effects.curse'), desc: tGame('effects.curseDesc'), accent: 'border-red-400/50 bg-red-500/15' },
    { icon: '🔗', title: tGame('effects.chain'), desc: tGame('effects.chainDesc'), accent: 'border-chip-blue/60 bg-chip-blue/20' },
    { icon: '⏭️', title: tGame('effects.skipTurn'), desc: tGame('effects.skipTurnDesc'), accent: 'border-slate-400/50 bg-slate-500/15' },
    { icon: '⚓', title: tGame('effects.anchor'), desc: tGame('effects.anchorDesc'), accent: 'border-cyan-400/50 bg-cyan-500/15' },
  ]

  const ranking = [...view.players].sort((a, b) => b.position - a.position)
  const rankBorder = (i: number) =>
    i === 0
      ? 'border-amber-400/35 bg-amber-500/10'
      : i === 1
        ? 'border-white/15 bg-white/5'
        : i === 2
          ? 'border-orange-500/25 bg-orange-600/10'
          : 'border-white/8 bg-white/3'

  const sendAction = async (
    action: 'roll' | 'resolve',
    choice?: { targetId?: string; side?: 'pile' | 'face'; option?: string }
  ): Promise<{ view?: { lastDice?: number | null } } | null> => {
    if (!room || busy) return null
    setBusy(true)
    try {
      const res = await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, expectedVersion: room.stateVersion, choice }),
      })
      // Le serveur diffuse le nouvel état (SSE) → useOnlineRoom rafraîchit la vue.
      return (await res.json().catch(() => null)) as { view?: { lastDice?: number | null } } | null
    } finally {
      setBusy(false)
    }
  }

  const handleRoll = () => {
    if (busy || rolling || !user) return
    setRolling(true)
    rollFallbackRef.current = null
    const rollStartedAt = Date.now()
    const meIcon = iconOf(user.id)
    const meName = view.players.find((p) => p.id === user.id)?.name ?? ''
    setDiceOverlay({ phase: 'rolling', playerName: meName, playerIcon: meIcon })

    const clear = () => {
      setDiceOverlay(null)
      setRolling(false)
      diceSkipRef.current = null
    }
    const showResult = (dice: number) => {
      // Le résultat est déjà tiré par le serveur : on l'affiche, on le laisse
      // lire un instant, puis le pion part (animation case par case).
      setDiceOverlay({ phase: 'result', value: dice, playerName: meName, playerIcon: meIcon })
      diceTimerRef.current = setTimeout(clear, 750)
      diceSkipRef.current = () => {
        if (diceTimerRef.current) clearTimeout(diceTimerRef.current)
        clear()
      }
    }

    // Filet de sécurité : si la réponse HTTP se perd (connexions saturées),
    // le SSE/polling apportera l'état quand même — on récupère le dé depuis
    // la vue, ou on ferme l'overlay plutôt que de le laisser tourner à vide.
    let settled = false
    const fallback = setTimeout(() => {
      if (settled) return
      settled = true
      const dice = rollFallbackRef.current
      if (typeof dice === 'number') showResult(dice)
      else clear()
    }, 5000)

    void sendAction('roll').then((body) => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      const dice = body?.view?.lastDice
      if (typeof dice === 'number') {
        // Durée MINIMALE de roulement : un serveur très rapide ne doit pas
        // court-circuiter l'animation (le dé paraissait « instantané »).
        const wait = Math.max(0, 700 - (Date.now() - rollStartedAt))
        diceTimerRef.current = setTimeout(() => showResult(dice), wait)
      } else {
        clear()
      }
    })
  }

  const awaitingChoice = Boolean(view.pending) && isMyTurn

  // grid-cols-[minmax(0,1fr)] : sans lui, le min-content d'une rangée
  // (en-tête) étire la colonne implicite au-delà du viewport (mobile).
  return (
    <>
    <div className="relative grid h-full min-h-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-hidden bg-gray-950 text-white">
      {/* Spectacle des tirages (roue, pièce, dé de la honte) — visible par tous */}
      <InteractionSpectacle
        interaction={view.lastInteraction}
        caseLabel={view.lastInteraction ? caseLabel(view.lastInteraction.kind) : ''}
        actorName={
          view.lastInteraction
            ? view.players.find((p) => p.id === view.lastInteraction?.actorId)?.name ?? ''
            : ''
        }
        targetName={
          view.lastInteraction?.kind === 'pile-face'
            ? view.players.find((p) => p.id === (view.lastInteraction as { targetId?: string | null }).targetId)?.name ?? ''
            : ''
        }
        labels={{
          wheelSafe: t('spectacle.wheelSafe'),
          // gabarits avec {placeholders} interpolés par le composant → raw
          wheelDrinks: t.raw('spectacle.wheelDrinks') as string,
          wheelLegendSafe: t('spectacle.wheelLegendSafe'),
          wheelLegendDrink: t('spectacle.wheelLegendDrink'),
          pfWin: t('spectacle.pfWin'),
          pfLose: t.raw('spectacle.pfLose') as string,
          pile: t('spectacle.pile'),
          face: t('spectacle.face'),
          deHonteSafe: t('spectacle.deHonteSafe'),
          deHonteDrink: t('spectacle.deHonteDrink'),
          deHonteForward: t('spectacle.deHonteForward'),
          deHonteBack: t('spectacle.deHonteBack'),
        }}
      />

      {/* Mise en scène du lancer de dé + flash de changement de tour */}
      <DiceOverlay
        state={diceOverlay}
        onSkip={() => diceSkipRef.current?.()}
        skipLabel={tGame('tapToSkip')}
      />
      <TurnOverlay
        activeKey={finished || diceOverlay ? null : active?.id ?? null}
        icon={active ? iconOf(active.id) : ''}
        name={active?.name ?? ''}
        isSelf={isMyTurn}
        labelOf={`${tGame('turnOf')} ${active?.name ?? ''}`}
        labelSelf={tGame('yourTurn')}
        delayMs={1600}
      />

      {/* Blobs animés */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-amber-600/15 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -left-40 h-80 w-80 rounded-full bg-orange-600/10 blur-[100px] animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="absolute bottom-0 right-1/3 h-72 w-72 rounded-full bg-emerald-600/10 blur-[90px] animate-[pulse_12s_ease-in-out_infinite_4s]" />
      </div>

      {/* En-tête */}
      <header className="relative z-30 shrink-0 border-b border-white/10 bg-gray-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => leaveRoom()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
            aria-label={t('leave')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-base font-bold sm:text-lg">
            {t('title')}
          </h1>
          <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/60">
            {DIFFICULTY_EMOJI[difficulty]} {tDiff(difficulty)}
          </span>
          <button
            onClick={() => setShowHistory(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
            aria-label={t('history.title')}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            onClick={toggleMuted}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
            aria-label={muted ? tGame('soundOn') : tGame('soundOff')}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setShowLegend(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white"
            aria-label={tGame('effects.active').replace(' :', '')}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <TutorialReopenButton onClick={tutorial.reopen} />
        </div>
      </header>

      {/* Zone scrollable */}
      <main className="relative min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto flex w-full max-w-3xl flex-col space-y-2 px-3 py-2.5 pb-4 sm:space-y-3 sm:px-4 sm:py-3">
          {/* HUD tour + joueur actif */}
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md sm:px-4 sm:py-3">
            <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300 sm:px-2.5 sm:py-1 sm:text-xs">
              {t('turn', { count: view.turnCount })}
            </span>
            <div className="min-w-0 flex-1 text-center">
              <p className="hidden text-[10px] uppercase tracking-widest text-white/40 sm:mb-0.5 sm:block">{tGame('turnOf')}</p>
              <div className="flex items-center justify-center gap-1.5 truncate text-sm font-bold sm:text-base">
                {active && <span aria-hidden>{iconOf(active.id)}</span>}
                {active && (
                  <OnlinePlayerName name={active.name} cosmetics={cosmetics.get(active.id)} className="truncate" />
                )}
              </div>
            </div>
            <span className="shrink-0 text-xs font-medium text-white/40">
              {active ? active.position + 1 : '—'}/{BOARD_SIZE}
            </span>
          </div>

          {/* Joueur(s) parti(s) : en attente de leur retour avant remplacement par un bot */}
          {someoneLeft && (
            <div className="space-y-0.5 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-center">
              {view.players
                .filter((p) => !p.isBot && p.leftAt)
                .map((p) => {
                  const remaining = Math.max(
                    0,
                    Math.ceil(((p.leftAt ?? 0) + ONLINE_REPLACE_GRACE_MS - clock) / 1000)
                  )
                  return (
                    <p key={p.id} className="text-xs font-semibold text-amber-100">
                      {t('waitingReturn', { name: p.name, seconds: remaining })}
                    </p>
                  )
                })}
            </div>
          )}

          {/* Avertissement AFK (60 dernières secondes avant expulsion) : message
              direct « joue ! » pour le joueur au tour, informatif pour les autres. */}
          {afkWatch && afkTarget && !afkTarget.isBot && !afkTarget.leftAt && (
            <div className="rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-center">
              <p className="text-xs font-semibold text-red-100">
                {(() => {
                  const seconds = Math.max(
                    0,
                    Math.ceil((turnStartRef.current.at + ONLINE_REPLACE_GRACE_MS - clock) / 1000)
                  )
                  return afkTarget.id === user.id
                    ? t('afkWarningSelf', { seconds })
                    : t('afkWarning', { name: afkTarget.name, seconds })
                })()}
              </p>
            </div>
          )}

          {/* Effets actifs — pastilles compactes (icône + joueur + compteur, détail en title) */}
          {effectChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
              {effectChips.map((e) => (
                <span
                  key={e.id}
                  title={`${e.playerName}${e.linkedName ? ` ↔ ${e.linkedName}` : ''} · ${e.title} — ${e.desc}`}
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-white/90',
                    e.accent
                  )}
                >
                  <span aria-hidden>{e.icon}</span>
                  <span className="max-w-[4.5rem] truncate sm:max-w-[7rem]">
                    {e.playerName}
                    {e.linkedName ? ` ↔ ${e.linkedName}` : ''}
                  </span>
                  <span className="rounded-full bg-black/25 px-1 text-[9px] font-bold leading-4">{e.remaining}</span>
                </span>
              ))}
            </div>
          )}

          {/* Dernière case résolue — carte flip teintée par la famille de case */}
          {view.lastCase && !view.pending && (
            <CaseRevealCard
              caseType={view.lastCase.type}
              label={caseLabel(view.lastCase.type)}
              revealKey={`${view.turnCount}:${view.lastCase.type}:${view.lastDice ?? ''}`}
              headerExtra={
                <>
                  <span className="text-xs font-semibold text-white/70 sm:text-sm">
                    {t('caseLabel')} {(active?.position ?? 0) + 1}
                  </span>
                  {view.lastDice != null && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-white/50">
                      <Dice6 className="h-3.5 w-3.5" /> {view.lastDice}
                    </span>
                  )}
                </>
              }
            >
              {/* Texte du défi tiré (seuls les défis vérifiables sont tirés en ligne). */}
              {view.lastCase.type === 'defi' && typeof view.lastCase.defiIndex === 'number' && (
                <p className="mt-1.5 text-sm font-medium text-white/85">
                  {(tPB.raw('defis') as { text: string }[])[view.lastCase.defiIndex]?.text}
                </p>
              )}
              {/* CE QUE la case a fait : gorgées prises, déplacements — lisible
                  avant que le joueur suivant ne joue. */}
              {view.lastOutcome && view.lastOutcome.caseType === view.lastCase.type && (
                view.lastOutcome.changes.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {view.lastOutcome.changes.map((c) => {
                      const p = view.players.find((pl) => pl.id === c.playerId)
                      return (
                        <span
                          key={c.playerId}
                          className="flex items-center gap-1 rounded-full border border-white/15 bg-gray-950/60 px-2 py-0.5 text-xs font-semibold text-white/90"
                        >
                          <span aria-hidden>{iconOf(c.playerId)}</span>
                          {p && (
                            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="max-w-[6rem] truncate" />
                          )}
                          {c.drinks > 0 && <span className="text-amber-300">+{c.drinks} 🍺</span>}
                          {c.to !== c.from && (
                            <span className="text-sky-300">
                              → {t('caseLabel')} {c.to + 1}
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                ) : (
                  getCaseMeta(view.lastCase.type).family !== 'neutral' &&
                  getCaseMeta(view.lastCase.type).family !== 'bonus' && (
                    <p className="mt-2 text-xs font-semibold text-emerald-300">
                      {t('outcomeNothing')}
                    </p>
                  )
                )
              )}
            </CaseRevealCard>
          )}

          {/* Simple confirmation (case sans choix explicite) */}
          {awaitingChoice && view.pending &&
            !view.pending.needsTarget &&
            !TARGET_INTERACTIVE.has(view.pending.caseType) &&
            view.pending.caseType !== 'teleport' && (
              <Button
                onClick={() => sendAction('resolve')}
                disabled={busy}
                className="w-full bg-amber-600 py-5 text-base font-bold text-white hover:bg-amber-500"
              >
                {busy ? '…' : `${t('continueCase')} (${caseLabel(view.pending.caseType)})`}
              </Button>
            )}

          {/* Plateau */}
          <div className="pb-board">
            <div className="pb-board-grid grid grid-cols-6 gap-2 sm:gap-2.5">
              {Array.from({ length: BOARD_SIZE }).map((_, index) => {
                const onCase = view.players.filter((p) => shownPosOf(p.id) === index)
                const isStart = index === 0
                const isFinish = index === BOARD_SIZE - 1
                const isActiveCase = activeShownPos === index
                const isLeaderCase = index === leaderPos
                return (
                  <div
                    key={index}
                    className={cn(
                      'relative flex aspect-square min-h-[2.75rem] items-center justify-center rounded-lg sm:min-h-[3.25rem] sm:rounded-xl',
                      isStart
                        ? 'pb-board-case pb-board-start'
                        : isFinish
                          ? 'pb-board-case pb-board-finish'
                          : 'pb-board-case',
                      isActiveCase && isLeaderCase
                        ? 'pb-board-highlight-both'
                        : isActiveCase
                          ? 'pb-board-highlight-active'
                          : isLeaderCase
                            ? 'pb-board-highlight-leader'
                            : ''
                    )}
                  >
                    {!isFinish && (
                      <span
                        className={cn(
                          'pb-board-case-num absolute left-0.5 top-0.5 z-[1] text-[8px] font-semibold sm:left-1 sm:top-1 sm:text-[9px]',
                          isStart ? 'text-emerald-400/70' : 'text-white/30'
                        )}
                      >
                        {isStart ? '🏁' : index + 1}
                      </span>
                    )}
                    {isFinish && onCase.length === 0 && (
                      <span className="pb-board-finish-icon text-3xl sm:text-4xl" aria-hidden>🏆</span>
                    )}
                    <div
                      className={cn(
                        'pb-board-players absolute inset-0 grid place-items-center gap-0.5 p-1',
                        onCase.length > 2 ? 'grid-cols-2' : 'grid-cols-1'
                      )}
                    >
                      {onCase.map((p) => {
                        const isSelf = p.id === user.id
                        const isPlayerActive = p.id === active?.id
                        return (
                          <motion.span
                            key={p.id}
                            layoutId={`token-${p.id}`}
                            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                            title={p.name}
                            className={cn(
                              'flex items-center justify-center rounded-full text-base leading-none transition-transform sm:text-lg',
                              isPlayerActive ? 'z-10 scale-110 ring-2 ring-white/80' : 'z-0',
                              isSelf && 'drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                            )}
                          >
                            {iconOf(p.id)}
                          </motion.span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Classement */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
            <div className="mb-2.5 flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <h3 className="text-xs font-semibold text-white/80">{tGame('ranking')}</h3>
            </div>
            <div className="flex gap-2 overflow-x-auto p-0.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ranking.map((p, index) => {
                const isActive = active?.id === p.id
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'relative flex w-[8.5rem] shrink-0 items-center gap-2 rounded-xl border p-2 transition-colors sm:w-[9.5rem] sm:p-2.5',
                      isActive
                        ? 'border-emerald-400/60 bg-emerald-500/12 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]'
                        : rankBorder(index)
                    )}
                  >
                    <FloatingDrinkBadge deltas={drinkDeltas.filter((d) => d.playerId === p.id)} />
                    <span
                      className={cn(
                        'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border px-1.5 text-xs font-bold tabular-nums',
                        index === 0
                          ? 'border-amber-400/45 bg-amber-500/20 text-amber-100'
                          : index === 1
                            ? 'border-white/25 bg-white/10 text-white/80'
                            : index === 2
                              ? 'border-orange-500/35 bg-orange-600/15 text-orange-100'
                              : 'border-white/10 bg-white/5 text-white/50'
                      )}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="shrink-0 text-sm" aria-hidden>{iconOf(p.id)}</span>
                        <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 truncate text-xs font-semibold text-white/90" />
                      </div>
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-white/40">
                        {t('caseLabel')} {p.position + 1}
                        <Beer className="h-3 w-3" /> <PulsingCount value={p.drinks} />
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </main>

      {/* Barre d'action fixe */}
      {!finished && (
        <footer
          className="relative z-40 border-t border-white/10 bg-gray-950/95 px-3 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
          aria-label={t('title')}
        >
          <div className="mx-auto flex w-full max-w-lg items-stretch gap-2 sm:max-w-3xl sm:gap-3">
            {active && (
              <div className="flex shrink-0 flex-col justify-center gap-1.5 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2.5 sm:px-4 sm:py-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80 sm:text-xs">
                  {tGame('turnShort')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden>{iconOf(active.id)}</span>
                  <OnlinePlayerName
                    name={active.name}
                    cosmetics={cosmetics.get(active.id)}
                    className="max-w-[5.5rem] truncate text-sm font-bold text-emerald-100 sm:max-w-[7.5rem] sm:text-base"
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handleRoll}
              disabled={!isMyTurn || Boolean(view.pending) || busy || rolling}
              className="min-w-0 flex-1 touch-manipulation select-none rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 sm:text-lg"
            >
              <span className="flex items-center justify-center gap-2">
                <span>
                  {rolling
                    ? t('rollDice')
                    : view.pending
                      ? isMyTurn
                        ? t('continueCase')
                        : t('waitingFor', { name: active?.name ?? '' })
                      : isMyTurn
                        ? t('rollDice')
                        : t('waitingFor', { name: active?.name ?? '' })}
                </span>
                <Dice6 className={cn('h-5 w-5', rolling && 'animate-spin')} />
              </span>
            </button>
          </div>
        </footer>
      )}

      {/* Écran de victoire — fidèle au mode local (confettis, trophée, stats, classement final). */}
      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={tGame('victory.winner')}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            {windowSize.width > 0 && windowSize.height > 0 && (
              <ReactConfetti
                width={windowSize.width}
                height={windowSize.height}
                recycle={true}
                numberOfPieces={200}
                gravity={0.15}
              />
            )}
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.15 }}
              className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-white/15 bg-felt-deep/95 shadow-2xl backdrop-blur-md"
            >
              <div className="bg-gradient-to-br from-amber-600/20 via-transparent to-orange-600/10 p-6">
                {/* Trophée animé */}
                <div className="mb-4 flex flex-col items-center gap-3">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                    className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-4xl shadow-xl shadow-amber-500/40"
                  >
                    🏆
                  </motion.div>
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-widest text-amber-400/70">
                      {tGame('victory.winner')}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-white">
                      {winner ? (
                        <OnlinePlayerName name={winner.name} cosmetics={cosmetics.get(winner.id)} />
                      ) : (
                        '—'
                      )}
                    </h2>
                    <p className="mt-0.5 text-sm text-white/50">{tGame('victory.wonGame')}</p>
                  </div>
                </div>

                <XpGainBanner
                  won={winner?.id === user?.id}
                  playerIds={view.players.map((p) => p.id)}
                  className="mb-4"
                />

                {/* Stats */}
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-300">{view.turnCount}</p>
                    <p className="text-[10px] text-white/40">{tGame('victory.turns')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-300">{view.players.length}</p>
                    <p className="text-[10px] text-white/40">{tGame('victory.players')}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl leading-none" aria-hidden>{DIFFICULTY_EMOJI[difficulty]}</p>
                    <p className="mt-1 text-sm font-bold text-amber-300">{tDiff(difficulty)}</p>
                    <p className="mt-0.5 text-[10px] text-white/40">{tGame('victory.difficulty')}</p>
                  </div>
                </div>

                {/* Classement final */}
                <div className="mb-5 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                    {tGame('finalRanking')}
                  </p>
                  {ranking.map((p, index) => (
                    <div
                      key={p.id}
                      className={cn(
                        'flex items-center justify-between rounded-xl px-3 py-2',
                        p.id === winner?.id ? 'border border-amber-400/30 bg-amber-500/15' : 'bg-white/5'
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border px-1 text-[10px] font-bold tabular-nums',
                            index === 0
                              ? 'border-amber-400/45 bg-amber-500/20 text-amber-100'
                              : 'border-white/10 bg-white/5 text-white/50'
                          )}
                        >
                          {index + 1}
                        </span>
                        <RankCrest role={cosmetics.get(p.id)?.role} />
                        <span className="shrink-0 text-sm" aria-hidden>{iconOf(p.id)}</span>
                        <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="truncate text-sm font-semibold text-white" />
                      </div>
                      <div className="flex shrink-0 gap-3 text-xs text-white/50">
                        <span>{p.drinks}🍺</span>
                        <span>{t('caseLabel')} {p.position + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2.5">
                  <Button
                    onClick={() => voteRematch()}
                    disabled={iVotedRematch}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 disabled:opacity-60"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {iVotedRematch
                      ? t('rematchWaiting', { count: rematchVotes.length, total: view.players.length })
                      : tGame('replay')}
                  </Button>
                  <button
                    onClick={() => leaveRoom()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white"
                  >
                    <Home className="h-4 w-4" /> {tGame('backToMenu')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fenêtre de ciblage / téléport — plein écran mobile (bottom-sheet), centrée sur desktop */}
      <AnimatePresence>
        {awaitingChoice && view.pending && (
          view.pending.needsTarget || TARGET_INTERACTIVE.has(view.pending.caseType) ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-label={tGame('target.title')}
              className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
            >
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="z-[100] flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-felt-deep shadow-2xl"
              >
                <div className="flex flex-col items-center gap-2 border-b border-white/10 bg-gradient-to-br from-amber-600/20 to-transparent px-5 pb-5 pt-5 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/30">
                    <Target className="h-6 w-6 text-amber-300" />
                  </div>
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-100">
                    {caseLabel(view.pending.caseType)}
                  </span>
                  <h3 className="text-lg font-bold text-white">{tGame('target.title')}</h3>
                  <p className="max-w-[18rem] text-sm text-white/50">{tGame('target.hint')}</p>
                  <div
                    className="mt-1 flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-amber-400/40 bg-amber-500/10 text-2xl text-amber-100"
                    aria-hidden
                  >
                    ?
                  </div>
                </div>

                <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-4">
                  {/* Classement compact */}
                  <div className="mb-4 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      {tGame('ranking')}
                    </p>
                    <ul className="space-y-1">
                      {ranking.map((p, index) => {
                        const isActive = p.id === active?.id
                        return (
                          <li
                            key={p.id}
                            className={cn(
                              'flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm',
                              isActive && 'bg-emerald-500/10'
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border px-1 text-[10px] font-bold tabular-nums',
                                  index === 0
                                    ? 'border-amber-400/45 bg-amber-500/20 text-amber-100'
                                    : 'border-white/10 bg-white/5 text-white/50'
                                )}
                              >
                                {index + 1}
                              </span>
                              <span className="shrink-0 text-xs" aria-hidden>{iconOf(p.id)}</span>
                              <OnlinePlayerName
                                name={p.name}
                                cosmetics={cosmetics.get(p.id)}
                                className={cn('truncate font-medium text-white/90', isActive && 'text-emerald-300')}
                              />
                            </span>
                            <span className="shrink-0 text-[10px] text-white/40">
                              {t('caseLabel')} {p.position + 1}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>

                  {/* Cibles (hors soi-même — voir bouton "Moi" ci-dessous) */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {view.players
                      .filter((p) => p.id !== active?.id)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={busy}
                          onClick={() => sendAction('resolve', { targetId: p.id })}
                          className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-3 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/10 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        >
                          <span className="text-3xl" aria-hidden>{iconOf(p.id)}</span>
                          <OnlinePlayerName
                            name={p.name}
                            cosmetics={cosmetics.get(p.id)}
                            className="max-w-full truncate text-center text-sm font-semibold text-white"
                          />
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/50">
                            {t('caseLabel')} {p.position + 1}
                          </span>
                        </button>
                      ))}
                  </div>

                  {/* Actions rapides */}
                  <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        const pick = view.players[Math.floor(Math.random() * view.players.length)]
                        if (pick) sendAction('resolve', { targetId: pick.id })
                      }}
                      className="h-11 w-full gap-2 border-amber-500/30 bg-amber-500/5 text-white hover:bg-amber-500/15"
                    >
                      <Shuffle className="h-4 w-4 text-amber-300" />
                      {tGame('target.random')}
                    </Button>
                    {active && (
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() => sendAction('resolve', { targetId: active.id })}
                        className="h-11 w-full gap-2 border border-amber-500/30 bg-amber-500/10 text-white hover:bg-amber-500/20"
                      >
                        <User className="h-4 w-4 opacity-90" />
                        <span className="flex min-w-0 items-center gap-1 truncate">
                          {tGame('target.me')}{' '}
                          <OnlinePlayerName name={active.name} cosmetics={cosmetics.get(active.id)} className="font-semibold" />
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : view.pending.caseType === 'teleport' ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              role="dialog"
              aria-modal="true"
              aria-label={t('teleportPrompt')}
              className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
            >
              <motion.div
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.97 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="z-[100] w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-felt-deep shadow-2xl"
              >
                <div className="flex flex-col items-center gap-2 border-b border-white/10 bg-gradient-to-br from-amber-600/20 to-transparent px-5 pb-4 pt-5 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/30">
                    <Target className="h-6 w-6 text-amber-300" />
                  </div>
                  <span className="rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-100">
                    {caseLabel(view.pending.caseType)}
                  </span>
                  <h3 className="text-lg font-bold text-white">{t('teleportPrompt')}</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 p-5">
                  <Button
                    disabled={busy}
                    onClick={() => sendAction('resolve', { option: 'leader' })}
                    className="h-12 justify-center bg-amber-500 text-base font-bold text-black hover:bg-amber-400"
                  >
                    {t('teleportLeader')}
                  </Button>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    onClick={() => sendAction('resolve', { option: 'last' })}
                    className="h-12 justify-center text-base font-bold"
                  >
                    {t('teleportLast')}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          ) : null
        )}
      </AnimatePresence>

      {/* Légende des effets — informative, fermable (contrairement aux modales de choix). */}
      <AnimatePresence>
        {showLegend && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={tGame('effects.active').replace(' :', '')}
            onClick={() => setShowLegend(false)}
            className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="z-[100] flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-felt-deep shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-br from-amber-600/20 to-transparent px-5 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 shrink-0 text-amber-300" />
                  <h3 className="text-base font-bold text-white">{tGame('effects.active').replace(' :', '')}</h3>
                </div>
                <button
                  onClick={() => setShowLegend(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={tGame('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 space-y-2 overflow-y-auto p-4">
                {legendEffects.map((e) => (
                  <div key={e.title} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', e.accent)}>
                    <span className="text-xl" aria-hidden>{e.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{e.title}</p>
                      <p className="text-xs text-white/60">{e.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Historique des effets précédents — informatif, fermable */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={t('history.title')}
            onClick={() => setShowHistory(false)}
            className="fixed inset-0 z-[105] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="z-[100] flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-felt-deep shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-br from-amber-600/20 to-transparent px-5 py-4">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 shrink-0 text-amber-300" />
                  <h3 className="text-base font-bold text-white">{t('history.title')}</h3>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={tGame('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 space-y-2 overflow-y-auto p-4">
                {(view.outcomeHistory ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-white/50">{t('history.empty')}</p>
                ) : (
                  [...(view.outcomeHistory ?? [])].reverse().map((entry, i) => {
                    const actor = view.players.find((p) => p.id === entry.actorId)
                    return (
                      <div
                        key={`${entry.turn}-${entry.caseType}-${i}`}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white/60">
                            T{entry.turn}
                          </span>
                          <span className="text-base leading-none" aria-hidden>
                            {getCaseMeta(entry.caseType).icon}
                          </span>
                          <span className="text-xs font-semibold text-white/90">
                            {caseLabel(entry.caseType)}
                          </span>
                          {entry.dice != null && (
                            <span className="flex items-center gap-0.5 text-[10px] text-white/40">
                              <Dice6 className="h-3 w-3" /> {entry.dice}
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-1 text-[11px] text-white/50">
                            <span aria-hidden>{iconOf(entry.actorId)}</span>
                            {actor && (
                              <OnlinePlayerName name={actor.name} cosmetics={cosmetics.get(actor.id)} className="max-w-[5.5rem] truncate" />
                            )}
                          </span>
                        </div>
                        {entry.changes.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {entry.changes.map((c) => {
                              const p = view.players.find((pl) => pl.id === c.playerId)
                              return (
                                <span
                                  key={c.playerId}
                                  className="flex items-center gap-1 rounded-full border border-white/15 bg-gray-950/60 px-2 py-0.5 text-[11px] font-semibold text-white/85"
                                >
                                  <span aria-hidden>{iconOf(c.playerId)}</span>
                                  {p && (
                                    <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="max-w-[5rem] truncate" />
                                  )}
                                  {c.drinks > 0 && <span className="text-amber-300">+{c.drinks} 🍺</span>}
                                  {c.to !== c.from && (
                                    <span className="text-sky-300">
                                      → {t('caseLabel')} {c.to + 1}
                                    </span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] font-medium text-emerald-300/80">
                            {t('outcomeNothing')}
                          </p>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal steps={tutorialSteps} onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
