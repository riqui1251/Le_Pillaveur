"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Home, RefreshCw, Siren, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EspionClientView } from '@/lib/espion/engine'
import { getEspionLocations } from '@/lib/espion/data'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial, type TutorialStep } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'

/**
 * QUI EST L'ESPION ? en ligne (serveur-autoritaire). `location` est null
 * pour l'espion tant que la manche n'est pas révélée ; `activeAccusation`
 * est PUBLIC en temps réel (contrairement au vote secret des autres jeux) —
 * cohérent avec une partie qui se joue à voix haute au vocal.
 */

function parseView(json: string | null | undefined): EspionClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as EspionClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function EspionOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.espion.game')
  const tTutorial = useTranslations('games.espion.tutorial')
  const tutorialSteps = tTutorial.raw('steps') as TutorialStep[]
  const [busy, setBusy] = useState(false)
  const [showAccuseGrid, setShowAccuseGrid] = useState(false)
  const [showGuessGrid, setShowGuessGrid] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })
  const locations = useMemo(() => getEspionLocations(user?.locale ?? 'fr'), [user?.locale])

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'espion' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const stateVersion = room?.stateVersion ?? -1
  const tutorial = useGameTutorial('espion', inGame)
  const cosmetics = useMemberCosmetics(room)

  // Horloge locale (décorative) pour le timer principal ET la fenêtre d'accusation.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 500)
    return () => clearInterval(timer)
  }, [view])

  // ÉCHÉANCE DE PHASE : tick « advance » générique (résout aussi une
  // accusation expirée en priorité, cf. moteur). Se recale sur la PLUS
  // PROCHE des deux échéances (accusation en cours ou timer principal).
  useEffect(() => {
    if (!view || !room || view.phase === 'finished' || view.phaseEndsAt === null) return
    const expectedVersion = room.stateVersion
    const nextDeadline = view.activeAccusation
      ? Math.min(view.activeAccusation.endsAt, view.phaseEndsAt)
      : view.phaseEndsAt
    const delay = Math.max(250, nextDeadline - Date.now() + 300 + Math.random() * 700)
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

  // Ticks « arbitre » (bots en attente + remplacement) : premier humain restant.
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
    const botsPendingSupport =
      view.phase === 'discussion' && view.activeAccusation && view.players.some((p) => p.isBot)
    const actorIsBot =
      view.phase === 'reveal' && view.players.find((p) => p.id === room.currentTurnUserId)?.isBot
    if (botsPendingSupport || actorIsBot) {
      botTimer = setTimeout(() => send({ action: 'bot' }), view.phase === 'reveal' ? 2500 : 3000)
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

  useEffect(() => {
    setShowAccuseGrid(false)
    setShowGuessGrid(false)
  }, [stateVersion])

  if (!inGame) {
    return <GameOnlineLobby gameId="espion" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const activePlayers = view.players.filter((p) => !p.leftAt)
  const majorityNeeded = Math.floor(activePlayers.length / 2) + 1

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
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
  const totalPhaseMs = view.discussionMs
  const accusationTimeLeftMs = view.activeAccusation
    ? Math.max(0, view.activeAccusation.endsAt - clock)
    : null
  const iSupported = view.activeAccusation?.supporters.includes(user.id) ?? false
  const iAmAccused = view.activeAccusation?.targetId === user.id

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const crewWon = view.winnerTeam === 'crew'
    const won = me?.role === view.winnerTeam
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
          <Trophy className={cn('h-14 w-14', crewWon ? 'text-cyan-400' : 'text-slate-300')} />
          <h2 className="text-3xl font-black">
            {crewWon ? t('victory.crewWin') : t('victory.spyWin')}
          </h2>
          <p className="text-sm text-white/60">
            {t('victory.score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
          </p>
        </motion.div>

        <XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-slate-700 to-cyan-600 py-5 text-base font-bold"
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
        <p className="text-sm font-bold uppercase tracking-widest text-cyan-300/80">{t('countdown.title')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-cyan-200"
          >
            {secondsLeft}
          </motion.span>
        </AnimatePresence>
        {view.location ? (
          <div className="w-full max-w-xs rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-600/15 to-transparent px-4 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{t('yourLocation')}</p>
            <p className="truncate text-2xl font-black tracking-wide">{view.location}</p>
          </div>
        ) : (
          <div className="w-full max-w-xs rounded-2xl border border-slate-400/30 bg-slate-600/15 px-4 py-3 text-center">
            <p className="text-sm font-black">{t('youAreSpy')}</p>
          </div>
        )}
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Révélation de manche ─────────────────────────────────────────────────
  if (view.phase === 'reveal' && reveal) {
    const outcomeText =
      reveal.outcome === 'spy-caught'
        ? t('reveal.outcome.spyCaught', { name: nameOf(reveal.spyId) })
        : reveal.outcome === 'accusation-failed'
          ? t('reveal.outcome.accusationFailed')
          : reveal.outcome === 'spy-guessed-right'
            ? t('reveal.outcome.spyGuessedRight', { name: nameOf(reveal.spyId) })
            : reveal.outcome === 'spy-guessed-wrong'
              ? t('reveal.outcome.spyGuessedWrong')
              : t('reveal.outcome.timeout', { name: nameOf(reveal.spyId) })
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <Siren className={cn('h-10 w-10', reveal.winner === 'crew' ? 'text-cyan-300' : 'text-slate-300')} />
        <p className="text-2xl font-black">{outcomeText}</p>
        <p className="text-sm text-white/60">{t('reveal.location', { location: reveal.location })}</p>
        <p className="text-sm font-bold text-cyan-200">
          {t('victory.score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
        </p>
        <Button
          onClick={() => void sendAction({ action: 'continue' })}
          disabled={busy}
          className="w-full max-w-xs rounded-2xl bg-gradient-to-r from-slate-700 to-cyan-600 py-4 text-sm font-bold"
        >
          {view.roundWins.spy >= view.roundsToWin || view.roundWins.crew >= view.roundsToWin
            ? t('reveal.seeResult')
            : t('reveal.continue')}
        </Button>
      </div>
    )
  }

  // ── Discussion en cours ───────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('score', { spy: view.roundWins.spy, crew: view.roundWins.crew })}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
              {t('phaseDiscussion')}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 30_000 ? 'bg-red-400' : 'bg-cyan-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalPhaseMs) * 100)}%` }}
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

      {/* Lieu ou statut espion */}
      {view.location ? (
        <div className="rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-600/15 to-transparent px-4 py-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{t('yourLocation')}</p>
          <p className="text-xl font-black tracking-wide">{view.location}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-400/30 bg-slate-600/15 px-4 py-3 text-center">
          <p className="text-sm font-black">{t('youAreSpy')}</p>
          <p className="mt-0.5 text-[10px] text-white/40">{t('spyHint')}</p>
        </div>
      )}

      {/* Accusation en cours */}
      <AnimatePresence>
        {view.activeAccusation && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2 rounded-2xl border border-red-400/40 bg-red-500/10 p-3 text-center"
          >
            <p className="text-sm font-black">
              {t('accusation.title', { accuser: nameOf(view.activeAccusation.accuserId), target: nameOf(view.activeAccusation.targetId) })}
            </p>
            <p className="text-xs text-white/60">
              {t('accusation.support', { count: view.activeAccusation.supporters.length, needed: majorityNeeded })}
            </p>
            {accusationTimeLeftMs !== null && (
              <div className="mx-auto h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-red-400 transition-[width] duration-500 ease-linear"
                  style={{ width: `${Math.min(100, (accusationTimeLeftMs / 15_000) * 100)}%` }}
                />
              </div>
            )}
            {!iSupported && !iAmAccused && (
              <Button
                onClick={() => void sendAction({ action: 'support' })}
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-red-600 to-orange-500 py-3 text-sm font-bold"
              >
                {t('accusation.supportButton')}
              </Button>
            )}
            {iSupported && <p className="text-xs font-semibold text-emerald-300">{t('accusation.supported')}</p>}
            {iAmAccused && <p className="text-xs font-semibold text-red-200">{t('accusation.youAreAccused')}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions : accuser / deviner */}
      {!view.activeAccusation && (
        <div className="flex flex-col gap-2">
          {!showAccuseGrid ? (
            <Button
              onClick={() => setShowAccuseGrid(true)}
              className="w-full rounded-2xl bg-gradient-to-r from-slate-700 to-cyan-600 py-4 text-sm font-bold"
            >
              {t('accuseButton')}
            </Button>
          ) : (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-center text-xs font-semibold text-white/60">{t('accuseWho')}</p>
              <div className="grid grid-cols-2 gap-2">
                {activePlayers
                  .filter((p) => p.id !== user.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => void sendAction({ action: 'accuse', targetId: p.id })}
                      disabled={busy}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10 active:scale-95"
                    >
                      <span className="text-lg" aria-hidden>{iconOf(p)}</span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">
                        <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                      </span>
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setShowAccuseGrid(false)}
                className="w-full text-center text-[11px] font-semibold text-white/40"
              >
                {t('cancel')}
              </button>
            </div>
          )}

          {!view.location && !showGuessGrid && (
            <Button
              onClick={() => setShowGuessGrid(true)}
              variant="outline"
              className="w-full rounded-2xl border-slate-400/30 bg-slate-600/10 py-4 text-sm font-bold text-white/80 hover:bg-slate-600/20"
            >
              {t('guessButton')}
            </Button>
          )}
          {!view.location && showGuessGrid && (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="text-center text-xs font-semibold text-white/60">{t('guessWhich')}</p>
              <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto">
                {locations.map((loc) => (
                  <button
                    key={loc}
                    onClick={() => void sendAction({ action: 'guess-location', location: loc })}
                    disabled={busy}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-semibold transition-colors hover:bg-white/10 active:scale-95"
                  >
                    {loc}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowGuessGrid(false)}
                className="w-full text-center text-[11px] font-semibold text-white/40"
              >
                {t('cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Joueurs */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {view.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/70',
              p.leftAt && 'opacity-40'
            )}
          >
            <span aria-hidden>{iconOf(p)}</span>
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
          </span>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal steps={tutorialSteps} onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
