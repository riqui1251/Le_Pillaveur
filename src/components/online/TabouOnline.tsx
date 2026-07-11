"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Ear, Home, Mic, RefreshCw, SkipForward, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TabouClientView, TabouTeam } from '@/lib/tabou/engine'
import { TABOU_ROUND_MS } from '@/lib/tabou/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'

/**
 * TABOU VOCAL en ligne (serveur-autoritaire). `currentWord` n'est envoyé
 * qu'au décrivant (`isDescriber`) tant que la manche est en cours ; les
 * autres ne voient que le timer et leur bouton de rôle (coéquipier =
 * TROUVÉ, adversaire = TABOU). `lastRoundWord` devient public au bilan.
 */

function parseView(json: string | null | undefined): TabouClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as TabouClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

const TEAM_STYLES: Record<TabouTeam, { chip: string; card: string; text: string }> = {
  A: { chip: 'border-sky-400/25 bg-sky-500/10 text-sky-200', card: 'border-sky-400/30 bg-sky-500/10', text: 'text-sky-300' },
  B: { chip: 'border-rose-400/25 bg-rose-500/10 text-rose-200', card: 'border-rose-400/30 bg-rose-500/10', text: 'text-rose-300' },
}

export function TabouOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.tabou.game')
  const [busy, setBusy] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'tabou' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('tabou', inGame)
  const cosmetics = useMemberCosmetics(room)

  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [view])

  // ÉCHÉANCE DE PHASE : tick « advance » générique.
  useEffect(() => {
    if (!view || !room || view.phase === 'finished' || view.phaseEndsAt === null) return
    const expectedVersion = room.stateVersion
    const delay = Math.max(250, view.phaseEndsAt - Date.now() + 300 + Math.random() * 700)
    const timer = setTimeout(() => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'advance', phaseKey: view.phaseKey, expectedVersion }),
      })
    }, delay)
    return () => clearTimeout(timer)
  }, [view, room])

  // Ticks « arbitre » (bots en attente au bilan + remplacement) : premier humain restant.
  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    const expectedVersion = room.stateVersion
    const send = (body: Record<string, unknown>) => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion }),
      })
    }

    let botTimer: ReturnType<typeof setTimeout> | undefined
    const actorIsBot =
      view.phase === 'roundEnd' && view.players.find((p) => p.id === room.currentTurnUserId)?.isBot
    if (actorIsBot) {
      botTimer = setTimeout(() => send({ action: 'bot' }), 2000)
    }

    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (view.players.some((p) => !p.isBot && p.leftAt)) {
      const check = () => {
        const expired = view.players.some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= ONLINE_REPLACE_GRACE_MS
        )
        if (expired) send({ action: 'replace-left' })
      }
      check()
      replaceTimer = setInterval(check, 5000)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [view, user, room])

  if (!inGame) {
    return <GameOnlineLobby gameId="tabou" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const describer = view.players.find((p) => p.id === view.describerId)
  const myTeam = me?.team
  const isTeammate = !view.isDescriber && myTeam && describer?.team === myTeam
  const isOpponent = !view.isDescriber && myTeam && describer?.team !== myTeam
  const finished = view.phase === 'finished'
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const won = finished && myTeam && view.winnerTeam === myTeam

  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return
    setBusy(true)
    try {
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion: room.stateVersion }),
      })
    } finally {
      setBusy(false)
    }
  }

  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-white">
        {windowSize.width > 0 && (
          <ReactConfetti width={windowSize.width} height={windowSize.height} numberOfPieces={180} recycle={false} />
        )}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <Trophy className={cn('h-14 w-14', view.winnerTeam === 'A' ? 'text-sky-400' : 'text-rose-400')} />
          <h2 className="font-display text-3xl font-bold text-gold">
            {view.winnerTeam === 'A' ? t('victory.teamAWin') : t('victory.teamBWin')}
          </h2>
          <p className="text-sm text-white/60">{t('score', { a: view.scores.A, b: view.scores.B })}</p>
        </motion.div>

        <XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 py-5 text-base font-bold"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {iVotedRematch && humanCount > 1
              ? t('victory.rematchWaiting', { count: rematchVotes.length, total: humanCount })
              : t('victory.replay')}
          </Button>
          <Button
            onClick={() => void leaveRoom()}
            variant="outline"
            className="w-full rounded-2xl border-white/15 bg-white/5 py-5 text-base font-semibold text-white/80 hover:bg-white/10"
          >
            <Home className="mr-2 h-4 w-4" /> {t('victory.backToMenu')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  if (view.phase === 'countdown') {
    const secondsLeft = Math.max(1, Math.ceil((timeLeftMs ?? 0) / 1000))
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-white">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300/80">{t('countdown.title')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-emerald-200"
          >
            {secondsLeft}
          </motion.span>
        </AnimatePresence>
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Bilan de manche ───────────────────────────────────────────────────────
  if (view.phase === 'roundEnd') {
    const target = view.targetScore
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-300/80">{t('roundEnd.title')}</p>
        {view.lastRoundWord && (
          <p className="text-2xl font-black">{t('roundEnd.wordWas', { word: view.lastRoundWord.word })}</p>
        )}
        <div className="flex gap-4 text-sm font-bold">
          <span className="text-emerald-300">✅ {view.roundStats.found} {t('roundEnd.found')}</span>
          <span className="text-white/50">⏭ {view.roundStats.passed} {t('roundEnd.passed')}</span>
          <span className="text-red-300">🚫 {view.roundStats.taboo} {t('roundEnd.taboo')}</span>
        </div>
        <p className="text-sm font-bold text-emerald-200">{t('score', { a: view.scores.A, b: view.scores.B })}</p>
        <Button
          onClick={() => void sendAction({ action: 'continue' })}
          disabled={busy}
          className="w-full max-w-xs rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 py-4 text-sm font-bold"
        >
          {view.scores.A >= target || view.scores.B >= target ? t('roundEnd.seeResult') : t('roundEnd.continue')}
        </Button>
      </div>
    )
  }

  // ── Manche en cours (describing) ─────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">{t('score', { a: view.scores.A, b: view.scores.B })}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
              {t('phaseDescribing')}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 15_000 ? 'bg-red-400' : 'bg-emerald-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / TABOU_ROUND_MS) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {t('waitingReturn', {
            name: leftPlayer.name,
            seconds: Math.max(0, Math.ceil((leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
          })}
        </div>
      )}

      {view.isDescriber && view.currentWord ? (
        <div className="space-y-3 rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-600/15 to-transparent p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{t('yourWord')}</p>
          <p className="text-3xl font-black tracking-wide">{view.currentWord.word}</p>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-300/70">{t('tabooWords')}</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {view.currentWord.taboo.map((w) => (
                <span key={w} className="rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-200">
                  {w}
                </span>
              ))}
            </div>
          </div>
          <Button
            onClick={() => void sendAction({ action: 'pass' })}
            disabled={busy}
            variant="outline"
            className="w-full rounded-xl border-white/15 bg-white/5 py-3 text-sm font-bold text-white/80 hover:bg-white/10"
          >
            <SkipForward className="mr-2 h-4 w-4" /> {t('passButton')}
          </Button>
        </div>
      ) : isTeammate ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center">
          <Mic className="h-8 w-8 text-emerald-300" />
          <p className="text-sm font-semibold text-white/80">
            {t('teammateHint', { name: describer?.name ?? '' })}
          </p>
          <Button
            onClick={() => void sendAction({ action: 'found' })}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 py-6 text-lg font-black"
          >
            {t('foundButton')}
          </Button>
        </div>
      ) : isOpponent ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <Ear className="h-7 w-7 text-white/50" />
          <p className="text-sm font-semibold text-white/60">
            {t('opponentHint', { name: describer?.name ?? '' })}
          </p>
          <Button
            onClick={() => void sendAction({ action: 'taboo-called' })}
            disabled={busy}
            variant="outline"
            className="w-full rounded-xl border-red-400/30 bg-red-500/10 py-3 text-sm font-bold text-red-200 hover:bg-red-500/20"
          >
            {t('tabooButton')}
          </Button>
        </div>
      ) : null}

      {/* Joueurs par équipe */}
      <div className="grid grid-cols-2 gap-2">
        {(['A', 'B'] as const).map((team) => (
          <div key={team} className={cn('rounded-xl border p-2', TEAM_STYLES[team].card)}>
            <p className={cn('mb-1.5 text-[10px] font-bold uppercase tracking-wide', TEAM_STYLES[team].text)}>
              {team === 'A' ? t('teamA') : t('teamB')}
            </p>
            <div className="flex flex-wrap gap-1">
              {view.players.filter((p) => p.team === team).map((p) => (
                <span
                  key={p.id}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold',
                    TEAM_STYLES[team].chip,
                    p.id === view.describerId && 'ring-1 ring-white/50',
                    p.leftAt && 'opacity-40'
                  )}
                >
                  <span aria-hidden>{iconOf(p)}</span>
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="tabou" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
