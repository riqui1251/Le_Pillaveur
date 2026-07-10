"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Home, RefreshCw, Send, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BLUFF_FAKE_MAX_LEN, type BluffClientView } from '@/lib/bluff/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial, type TutorialStep } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'

/**
 * LE GRAND BLUFF en ligne (serveur-autoritaire). Vue déjà filtrée : les
 * bluffs des autres n'arrivent jamais avant le reveal, les candidats de vote
 * sont anonymisés (`voteOptions`, jamais `isReal`/`authorId`). `submit` et
 * `vote` sont des phases SIMULTANÉES — pas de « tour » individuel, juste une
 * échéance commune (tick `advance`).
 */

function parseView(json: string | null | undefined): BluffClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as BluffClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function BluffOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.bluff.game')
  const tTutorial = useTranslations('games.bluff.tutorial')
  const tutorialSteps = tTutorial.raw('steps') as TutorialStep[]
  const [busy, setBusy] = useState(false)
  const [fakeInput, setFakeInput] = useState('')
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'bluff' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const stateVersion = room?.stateVersion ?? -1
  const tutorial = useGameTutorial('bluff', inGame)
  const cosmetics = useMemberCosmetics(room)

  // Horloge locale pour le compte à rebours de phase (décoratif).
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phaseEndsAt === null || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 500)
    return () => clearInterval(timer)
  }, [view])

  // ÉCHÉANCE DE PHASE : TOUS les clients envoient le tick « advance »
  // (idempotent, jitter) — évite qu'un seul téléphone verrouillé bloque tout.
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

  // Ticks « arbitre » (bots en attente + remplacement) : premier humain
  // restant. submit/vote sont simultanés → pas d'acteur unique côté bots.
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
    const botsPendingSubmit = view.phase === 'submit' && view.players.some((p) => p.isBot && !p.hasSubmitted)
    const botsPendingVote = view.phase === 'vote' && view.players.some((p) => p.isBot && !p.hasVoted)
    const actorIsBot =
      view.phase === 'reveal' && view.players.find((p) => p.id === room.currentTurnUserId)?.isBot
    if (botsPendingSubmit || botsPendingVote || actorIsBot) {
      botTimer = setTimeout(() => send({ action: 'bot' }), view.phase === 'reveal' ? 2500 : 1500)
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

  // Vide le champ de bluff à chaque nouvel état.
  useEffect(() => {
    setFakeInput('')
  }, [stateVersion])

  if (!inGame) {
    return <GameOnlineLobby gameId="bluff" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-400/30 border-t-rose-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length

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

  const fakeTrimmed = fakeInput.trim()
  const fakeOk = fakeTrimmed.length > 0 && fakeTrimmed.length <= BLUFF_FAKE_MAX_LEN
  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const totalPhaseMs = view.phase === 'submit' ? 45_000 : 60_000
  const submittedCount = view.players.filter((p) => p.hasSubmitted).length
  const votedCount = view.players.filter((p) => p.hasVoted).length

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const sorted = [...view.players].sort((a, b) => b.score - a.score)
    const won = view.winnerId === user.id
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
          <Trophy className="h-14 w-14 text-amber-400" />
          <h2 className="text-3xl font-black">
            {view.winnerId ? t('victory.winnerIs', { name: nameOf(view.winnerId) }) : t('victory.tie')}
          </h2>
        </motion.div>

        <XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />

        <div className="w-full max-w-sm space-y-2">
          <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">
            {t('victory.finalScore')}
          </p>
          {sorted.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                p.id === view.winnerId
                  ? 'border-amber-400/40 bg-amber-500/10'
                  : 'border-white/10 bg-white/5'
              )}
            >
              <span className="w-5 shrink-0 text-center text-xs font-black text-white/40">{i + 1}</span>
              <span className="text-xl" aria-hidden>{iconOf(p)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums text-amber-200">{p.score}</span>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-rose-600 to-amber-500 py-5 text-base font-bold"
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
        <p className="text-sm font-bold uppercase tracking-widest text-rose-300/80">{t('countdown.title')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-rose-200"
          >
            {secondsLeft}
          </motion.span>
        </AnimatePresence>
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      {/* Bandeau : manche + phase + timer */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('round', { n: view.promptIdx + 1, total: view.totalRounds })}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-rose-300">
              {view.phase === 'submit' && t('phaseSubmit')}
              {view.phase === 'vote' && t('phaseVote')}
              {view.phase === 'reveal' && t('phaseReveal')}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 10_000 ? 'bg-red-400' : 'bg-rose-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalPhaseMs) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Bannière retour */}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {t('waitingReturn', {
            name: leftPlayer.name,
            seconds: Math.max(0, Math.ceil((leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
          })}
        </div>
      )}

      {/* Question */}
      {view.prompt && (
        <div className="rounded-2xl border border-rose-400/30 bg-gradient-to-br from-rose-600/15 to-transparent px-4 py-3 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{t('promptLabel')}</p>
          <p className="text-lg font-black">{view.prompt}</p>
        </div>
      )}

      {/* Révélation */}
      <AnimatePresence>
        {view.phase === 'reveal' && reveal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl border border-rose-400/30 bg-gray-900/80 p-4"
          >
            <p className="text-center text-sm font-bold text-emerald-200">
              {t('reveal.realAnswer', { answer: reveal.realAnswer })}
            </p>
            <div className="space-y-1.5">
              {reveal.candidates.map((c) => (
                <div
                  key={c.candidateId}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2',
                    c.isReal ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/8 bg-white/4'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">« {c.text} »</span>
                  {!c.isReal && c.authorId && (
                    <span className="shrink-0 text-[10px] text-white/40">{nameOf(c.authorId)}</span>
                  )}
                  {c.votes.length > 0 && (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                      {c.votes.map((id) => iconOf({ id, isBot: view.players.find((p) => p.id === id)?.isBot ?? false })).join(' ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {Object.keys(reveal.pointsAwarded).length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 text-[11px] text-amber-200">
                {Object.entries(reveal.pointsAwarded)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, pts]) => (
                    <span key={id} className="rounded-full bg-amber-500/10 px-2 py-0.5 font-bold">
                      {nameOf(id)} +{pts}
                    </span>
                  ))}
              </div>
            )}
            <Button
              onClick={() => void sendAction({ action: 'continue' })}
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-r from-rose-600 to-amber-500 py-4 text-sm font-bold"
            >
              {view.promptIdx + 1 >= view.totalRounds ? t('reveal.seeResult') : t('reveal.continue')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Soumission du bluff */}
      {view.phase === 'submit' && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          {view.myFake ? (
            <p className="text-center text-sm font-bold text-white/70">
              {t('submitted', { count: submittedCount, total: view.players.length })}
            </p>
          ) : (
            <>
              <p className="text-center text-sm font-bold">{t('submitPrompt')}</p>
              <div className="flex gap-2">
                <input
                  value={fakeInput}
                  onChange={(e) => setFakeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && fakeOk && !busy) {
                      void sendAction({ action: 'submit-fake', text: fakeTrimmed })
                    }
                  }}
                  maxLength={BLUFF_FAKE_MAX_LEN}
                  placeholder={t('submitPlaceholder')}
                  autoFocus
                  className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-white/30 focus:border-rose-400 focus:outline-none"
                />
                <Button
                  onClick={() => void sendAction({ action: 'submit-fake', text: fakeTrimmed })}
                  disabled={busy || !fakeOk}
                  className="shrink-0 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 px-4 font-bold"
                  aria-label={t('submitSend')}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Vote */}
      {view.phase === 'vote' && view.voteOptions && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-center text-sm font-bold">
            {view.myVote ? t('voted', { count: votedCount, total: view.players.length }) : t('votePrompt')}
          </p>
          <div className="space-y-1.5">
            {view.voteOptions.map((opt) => {
              const chosen = view.myVote === opt.candidateId
              const disabled = Boolean(view.myVote) || busy
              return (
                <button
                  key={opt.candidateId}
                  onClick={() => void sendAction({ action: 'vote', candidateId: opt.candidateId })}
                  disabled={disabled}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all',
                    chosen
                      ? 'border-rose-400/70 bg-rose-500/20 ring-2 ring-rose-400'
                      : 'border-white/10 bg-white/5',
                    !disabled && 'hover:bg-white/10 active:scale-95'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">« {opt.text} »</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal steps={tutorialSteps} onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
