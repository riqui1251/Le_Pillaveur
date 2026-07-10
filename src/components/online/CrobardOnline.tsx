"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Home, RefreshCw, Send, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { PartyCanvas, type Stroke } from './PartyCanvas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { CrobardClientView } from '@/lib/crobard/engine'
import { CROBARD_CHOOSING_MS, CROBARD_DRAWING_MS } from '@/lib/crobard/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial, type TutorialStep } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'

/**
 * CROBARD en ligne (serveur-autoritaire). `word`/`wordChoices` ne sont
 * envoyés qu'au dessinateur ; les traits (`strokes`) restent PUBLICS —
 * c'est le principe du jeu. Une réponse fausse/proche n'est jamais
 * persistée dans l'état partagé (feedback local uniquement).
 */

function parseView(json: string | null | undefined): CrobardClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as CrobardClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function CrobardOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom, fetchRoom } = useOnlineRoom()
  const t = useTranslations('games.crobard.game')
  const tTutorial = useTranslations('games.crobard.tutorial')
  const tutorialSteps = tTutorial.raw('steps') as TutorialStep[]
  const [busy, setBusy] = useState(false)
  const [guessText, setGuessText] = useState('')
  const [guessFeedback, setGuessFeedback] = useState<'wrong' | 'close' | null>(null)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'crobard' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('crobard', inGame)
  const cosmetics = useMemberCosmetics(room)

  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [view])

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

  useEffect(() => {
    setGuessText('')
    setGuessFeedback(null)
  }, [view?.round])

  if (!inGame) {
    return <GameOnlineLobby gameId="crobard" onLaunch={fetchRoom} />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-fuchsia-400/30 border-t-fuchsia-400" />
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const won = finished && view.winnerId === user.id
  const ranking = [...view.players].sort((a, b) => b.score - a.score)

  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? '—'

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return null
    setBusy(true)
    try {
      const res = await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, expectedVersion: room.stateVersion }),
      })
      return (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
    } finally {
      setBusy(false)
    }
  }

  const submitGuess = async () => {
    const text = guessText.trim()
    if (!text || busy) return
    const data = await sendAction({ action: 'guess', text })
    if (data?.error === 'GUESS_WRONG') {
      setGuessFeedback('wrong')
      setTimeout(() => setGuessFeedback(null), 1200)
    } else if (data?.error === 'GUESS_CLOSE') {
      setGuessFeedback('close')
      setTimeout(() => setGuessFeedback(null), 1200)
    } else if (data?.ok) {
      setGuessText('')
      setGuessFeedback(null)
    }
  }

  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const totalPhaseMs = view.phase === 'choosing' ? CROBARD_CHOOSING_MS : CROBARD_DRAWING_MS

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
          <Trophy className="h-14 w-14 text-fuchsia-400" />
          <h2 className="text-3xl font-black">{t('victory.title', { name: nameOf(view.winnerId) })}</h2>
        </motion.div>

        <div className="flex w-full max-w-sm flex-col gap-1.5">
          {ranking.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2',
                i === 0 ? 'border-fuchsia-400/40 bg-fuchsia-500/10' : 'border-white/10 bg-white/5'
              )}
            >
              <span className="w-5 text-center text-xs font-black text-white/50">{i + 1}</span>
              <span aria-hidden>{iconOf(p)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              </span>
              <span className="text-sm font-black text-fuchsia-300">{p.score}</span>
            </div>
          ))}
        </div>

        <XpGainBanner won={Boolean(won)} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-orange-500 py-5 text-base font-bold"
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
        <p className="text-sm font-bold uppercase tracking-widest text-fuchsia-300/80">{t('countdown.title')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-fuchsia-200"
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
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-300/80">{t('roundEnd.title')}</p>
        {view.lastRoundWord && (
          <p className="text-3xl font-black">{t('roundEnd.wordWas', { word: view.lastRoundWord })}</p>
        )}
        <div className="flex w-full max-w-xs flex-col gap-1.5">
          {ranking.slice(0, 5).map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-left text-sm">
              <span className="w-4 text-xs font-black text-white/40">{i + 1}</span>
              <span aria-hidden>{iconOf(p)}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              </span>
              <span className="font-black text-fuchsia-300">{p.score}</span>
            </div>
          ))}
        </div>
        <Button
          onClick={() => void sendAction({ action: 'continue' })}
          disabled={busy}
          className="w-full max-w-xs rounded-2xl bg-gradient-to-r from-fuchsia-600 to-orange-500 py-4 text-sm font-bold"
        >
          {view.round >= view.totalRounds ? t('roundEnd.seeResult') : t('roundEnd.continue')}
        </Button>
      </div>
    )
  }

  // ── Choix du mot ──────────────────────────────────────────────────────────
  if (view.phase === 'choosing') {
    return (
      <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-300/80">
          {t('round', { round: view.round, total: view.totalRounds })}
        </p>
        {view.isDrawer && view.wordChoices ? (
          <>
            <p className="text-lg font-black">{t('choosing.pickWord')}</p>
            <div className="flex w-full max-w-sm flex-col gap-2">
              {view.wordChoices.map((word, i) => (
                <Button
                  key={word}
                  onClick={() => void sendAction({ action: 'choose-word', index: i })}
                  disabled={busy}
                  className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-600 to-orange-500 py-5 text-base font-bold"
                >
                  {word}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-lg font-semibold text-white/70">
            {t('choosing.waitingFor', { name: nameOf(view.drawerId) })}
          </p>
        )}
      </div>
      <AnimatePresence>
        {tutorial.open && <GameTutorialModal steps={tutorialSteps} onClose={tutorial.close} />}
      </AnimatePresence>
      </>
    )
  }

  // ── Dessin en cours ───────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const iHaveGuessed = view.correctGuessers.includes(user.id)
  const nonDrawerCount = view.players.filter((p) => p.id !== view.drawerId && !p.leftAt).length

  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('round', { round: view.round, total: view.totalRounds })}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-fuchsia-300">
              {t('foundCount', { found: view.correctGuessers.length, total: nonDrawerCount })}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 15_000 ? 'bg-red-400' : 'bg-fuchsia-400'
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

      {view.isDrawer && view.word && (
        <div className="rounded-2xl border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-600/15 to-transparent px-4 py-2.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{t('yourWord')}</p>
          <p className="text-2xl font-black tracking-wide">{view.word}</p>
        </div>
      )}

      <PartyCanvas
        strokes={view.strokes}
        readOnly={!view.isDrawer}
        onStrokeComplete={(stroke: Stroke) => void sendAction({ action: 'draw-stroke', stroke })}
        onClear={() => void sendAction({ action: 'clear' })}
      />

      {!view.isDrawer && (
        <div className="space-y-1.5">
          {iHaveGuessed ? (
            <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 py-3 text-center text-sm font-bold text-emerald-200">
              {t('youFoundIt')}
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  value={guessText}
                  onChange={(e) => setGuessText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitGuess()
                  }}
                  placeholder={t('guessPlaceholder')}
                  disabled={busy}
                  className="flex-1 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
                />
                <Button
                  onClick={() => void submitGuess()}
                  disabled={busy || !guessText.trim()}
                  className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-orange-500 px-4"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <AnimatePresence>
                {guessFeedback && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      'text-center text-xs font-bold',
                      guessFeedback === 'close' ? 'text-amber-300' : 'text-red-300'
                    )}
                  >
                    {guessFeedback === 'close' ? t('feedback.close') : t('feedback.wrong')}
                  </motion.p>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      )}

      {/* Joueurs */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {view.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold',
              p.id === view.drawerId
                ? 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200'
                : view.correctGuessers.includes(p.id)
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-white/10 bg-white/5 text-white/70',
              p.leftAt && 'opacity-40'
            )}
          >
            <span aria-hidden>{iconOf(p)}</span>
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
            <span className="text-white/50">· {p.score}</span>
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
