"use client"

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Dice6, Crown, ArrowLeft, RotateCcw, Beer, Trophy, MapPin, Sparkles, Target, Shuffle, User } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PLAYER_ICONS } from '@/lib/players'
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
  const tCase = useTranslations('games.petit-buveur.caseTypes')
  const tGame = useTranslations('games.petit-buveur.game')
  const tDiff = useTranslations('games.petit-buveur.difficultyLabels')
  const [busy, setBusy] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [rollDisplay, setRollDisplay] = useState<number | null>(null)
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current)
    }
  }, [])

  const inGame = room?.gameId === 'petit-buveur' && room.status === 'playing'

  // Tant que la partie n'est pas lancée : le lobby gère création/join/prêt/lancer.
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
  const caseLabel = (type: string) => tCase(type)
  const difficulty = room.settings?.difficulty && room.settings.difficulty in DIFFICULTY_EMOJI
    ? room.settings.difficulty
    : 'normal'

  const iconOf = (id: string) => iconFor(Math.max(0, view.players.findIndex((p) => p.id === id)))
  const leaderPos = Math.max(...view.players.map((p) => p.position))

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
        accent: 'border-indigo-400/50 bg-indigo-500/15',
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
  ) => {
    if (!room || busy) return
    setBusy(true)
    try {
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, expectedVersion: room.stateVersion, choice }),
      })
      // Le serveur diffuse le nouvel état (SSE) → useOnlineRoom rafraîchit la vue.
    } finally {
      setBusy(false)
    }
  }

  const handleRoll = () => {
    if (busy || rolling) return
    setRolling(true)
    setRollDisplay(1 + Math.floor(Math.random() * 6))
    rollIntervalRef.current = setInterval(() => {
      setRollDisplay(1 + Math.floor(Math.random() * 6))
    }, 90)
    void sendAction('roll').finally(() => {
      setTimeout(() => {
        if (rollIntervalRef.current) clearInterval(rollIntervalRef.current)
        rollIntervalRef.current = null
        setRolling(false)
        setRollDisplay(null)
      }, 500)
    })
  }

  const awaitingChoice = Boolean(view.pending) && isMyTurn

  return (
    <div className="relative grid h-full min-h-0 w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-gray-950 text-white">
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
                <span className="truncate">{active?.name}</span>
              </div>
            </div>
            <span className="shrink-0 text-xs font-medium text-white/40">
              {active ? active.position + 1 : '—'}/{BOARD_SIZE}
            </span>
          </div>

          {/* Effets actifs — pastilles compactes (icône + joueur + compteur, détail en title) */}
          {effectChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
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

          {/* Dernière case résolue */}
          <AnimatePresence mode="wait">
            {view.lastCase && !view.pending && (
              <motion.div
                key={view.version}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 to-orange-500/10 px-3 py-1.5 shadow-sm"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="text-xs font-semibold text-amber-200 sm:text-sm">
                  {t('caseLabel')} {(active?.position ?? 0) + 1}
                </span>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-100">
                  {caseLabel(view.lastCase.type)}
                </span>
                {view.lastDice != null && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-white/50">
                    <Dice6 className="h-3.5 w-3.5" /> {view.lastDice}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Simple confirmation (case sans choix explicite) */}
          {awaitingChoice && view.pending &&
            !view.pending.needsTarget &&
            !TARGET_INTERACTIVE.has(view.pending.caseType) &&
            view.pending.caseType !== 'teleport' && (
              <Button
                onClick={() => sendAction('resolve')}
                disabled={busy}
                className="w-full bg-violet-600 py-5 text-base font-bold text-white hover:bg-violet-500"
              >
                {busy ? '…' : `${t('continueCase')} (${caseLabel(view.pending.caseType)})`}
              </Button>
            )}

          {/* Plateau */}
          <div className="pb-board">
            <div className="pb-board-grid grid grid-cols-6 gap-2 sm:gap-2.5">
              {Array.from({ length: BOARD_SIZE }).map((_, index) => {
                const onCase = view.players.filter((p) => p.position === index)
                const isStart = index === 0
                const isFinish = index === BOARD_SIZE - 1
                const isActiveCase = active?.position === index
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
                      'flex w-[8.5rem] shrink-0 items-center gap-2 rounded-xl border p-2 transition-colors sm:w-[9.5rem] sm:p-2.5',
                      isActive
                        ? 'border-emerald-400/60 bg-emerald-500/12 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]'
                        : rankBorder(index)
                    )}
                  >
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
                        <span className="min-w-0 truncate text-xs font-semibold text-white/90">{p.name}</span>
                      </div>
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-white/40">
                        {t('caseLabel')} {p.position + 1}
                        <Beer className="h-3 w-3" /> {p.drinks}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Fin de partie */}
          <AnimatePresence>
            {finished && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-orange-500/10 p-5 text-center"
              >
                <p className="flex items-center justify-center gap-2 text-lg font-bold text-white">
                  <Crown className="h-5 w-5 text-amber-400" />
                  {winner ? t('winner', { name: winner.name }) : t('gameOver')}
                </p>
                <Button
                  onClick={() => voteRematch()}
                  disabled={iVotedRematch}
                  className="w-full bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {iVotedRematch
                    ? t('rematchWaiting', { count: rematchVotes.length, total: view.players.length })
                    : t('rematch')}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
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
                  <span className="max-w-[5.5rem] truncate text-sm font-bold text-emerald-100 sm:max-w-[7.5rem] sm:text-base">
                    {active.name}
                  </span>
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
                    ? `${t('rollDice')} ${rollDisplay ?? ''}`
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
                className="z-[100] flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
              >
                <div className="flex flex-col items-center gap-2 border-b border-white/10 bg-gradient-to-br from-violet-600/20 to-transparent px-5 pb-5 pt-5 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-400/30">
                    <Target className="h-6 w-6 text-violet-300" />
                  </div>
                  <span className="rounded-full border border-violet-400/30 bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-violet-100">
                    {caseLabel(view.pending.caseType)}
                  </span>
                  <h3 className="text-lg font-bold text-white">{tGame('target.title')}</h3>
                  <p className="max-w-[18rem] text-sm text-white/50">{tGame('target.hint')}</p>
                  <div
                    className="mt-1 flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-violet-400/40 bg-violet-500/10 text-2xl text-violet-100"
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
                              <span className={cn('truncate font-medium text-white/90', isActive && 'text-emerald-300')}>
                                {p.name}
                              </span>
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
                          <span className="max-w-full truncate text-center text-sm font-semibold text-white">
                            {p.name}
                          </span>
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
                      className="h-11 w-full gap-2 border-violet-500/30 bg-violet-500/5 text-white hover:bg-violet-500/15"
                    >
                      <Shuffle className="h-4 w-4 text-violet-300" />
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
                          {tGame('target.me')} <span className="font-semibold">{active.name}</span>
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
                className="z-[100] w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
              >
                <div className="flex flex-col items-center gap-2 border-b border-white/10 bg-gradient-to-br from-violet-600/20 to-transparent px-5 pb-4 pt-5 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/20 ring-1 ring-violet-400/30">
                    <Target className="h-6 w-6 text-violet-300" />
                  </div>
                  <span className="rounded-full border border-violet-400/30 bg-violet-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-violet-100">
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
    </div>
  )
}
