"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Crown, Home, RefreshCw, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SF_JUDGE_MS, SF_SUBMIT_MS, type SFClientView } from '@/lib/sans-filtre/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { XpGainBanner } from './XpGainBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * SANS FILTRE en ligne (serveur-autoritaire). Vue déjà filtrée : chacun ne
 * voit que SA main, les réponses abattues restent anonymes jusqu'au
 * couronnement. Le juge du tour ne joue pas — il lit à voix haute (vocal) et
 * couronne la plus drôle.
 */

function parseView(json: string | null | undefined): SFClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as SFClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function SansFiltreOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.sans-filtre.game')
  const [busy, setBusy] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'sans-filtre' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('sans-filtre', inGame)
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

  // Ticks « arbitre » (bots convertis en cours de manche + remplacement) :
  // premier humain restant.
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
    const botsPendingPlay =
      view.phase === 'submit' &&
      view.players.some((p) => p.isBot && !p.isJudge && !p.hasPlayed && p.handCount > 0 && !p.leftAt)
    const judgeIsBot =
      view.phase === 'judging' && view.players.find((p) => p.isJudge)?.isBot
    const actorIsBot =
      view.phase === 'reveal' && view.players.find((p) => p.id === room.currentTurnUserId)?.isBot
    if (botsPendingPlay || judgeIsBot || actorIsBot) {
      botTimer = setTimeout(() => send({ action: 'bot' }), view.phase === 'submit' ? 1500 : 2500)
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
    return <GameOnlineLobby gameId="sans-filtre" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const judge = view.players.find((p) => p.isJudge)
  const iAmJudge = judge?.id === user.id
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
        // Intention joueur : pas de verrou de version (le moteur valide la
        // phase) — un verrou ferait perdre les cartes abattues simultanément.
        body: JSON.stringify(body),
      })
    } finally {
      setBusy(false)
    }
  }

  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const totalPhaseMs = view.phase === 'judging' ? SF_JUDGE_MS : SF_SUBMIT_MS
  const playersInRound = view.players.filter((p) => !p.isJudge && !p.leftAt)
  const playedCount = playersInRound.filter((p) => p.hasPlayed).length

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const sorted = [...view.players].sort((a, b) => b.crowns - a.crowns)
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
          <h2 className="font-display text-3xl font-bold text-gold">
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
              <span className="text-xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-sm font-black tabular-nums text-amber-200">
                <Crown className="h-3.5 w-3.5" /> {p.crowns}
              </span>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 py-5 text-base font-bold text-black"
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
        <p className="text-sm font-bold uppercase tracking-widest text-amber-300/80">{t('countdown.title')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-amber-200"
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
            {t('round', { n: view.round + 1, total: view.totalRounds })}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              {view.phase === 'submit' && t('phaseSubmit')}
              {view.phase === 'judging' && t('phaseJudging')}
              {view.phase === 'reveal' && t('phaseReveal')}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/50">
          <Crown className="h-3 w-3 text-amber-300" />
          {iAmJudge ? t('youAreJudge') : t('judgeIs', { name: judge?.name ?? '—' })}
        </p>
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 10_000 ? 'bg-suit-red' : 'bg-gold'
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

      {/* Carte noire */}
      {view.black && (
        <div className="rounded-2xl border border-gold/40 bg-[#1d1a14] px-4 py-4 text-center shadow-[0_10px_24px_-12px_rgba(0,0,0,0.8)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-gold/60">{t('blackLabel')}</p>
          <p className="mt-1.5 font-display text-lg font-bold leading-snug text-cream">{view.black}</p>
        </div>
      )}

      {/* Couronnement */}
      <AnimatePresence>
        {view.phase === 'reveal' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl border border-amber-400/40 bg-felt-deep/80 p-4"
          >
            {view.crowned ? (
              <div className="space-y-2 text-center">
                <p className="flex items-center justify-center gap-1.5 font-display text-base font-bold text-gold">
                  <Crown className="h-4 w-4" /> {t('crowned.title')}
                </p>
                <div className="relative mx-auto max-w-xs rounded-xl border border-[#D8CCAE] bg-cream px-4 py-3 text-sm font-bold text-[#24201A] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.65)]">
                  <span aria-hidden className="absolute left-2 top-1 font-display text-[10px] font-black leading-tight text-[#24201A]">J<br />♣</span>
                  {view.crowned.text}
                </div>
                <p className="text-xs font-semibold text-amber-200">
                  {t('crowned.by', { name: view.crowned.playerName })}
                </p>
              </div>
            ) : (
              <p className="text-center text-sm font-semibold text-white/60">{t('crowned.nobody')}</p>
            )}
            <Button
              onClick={() => void sendAction({ action: 'continue' })}
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 py-4 text-sm font-bold text-black"
            >
              {view.round + 1 >= view.totalRounds ? t('reveal.seeResult') : t('reveal.continue')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jugement : réponses anonymes */}
      {view.phase === 'judging' && view.submissions && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-center text-sm font-bold">
            {iAmJudge ? t('judgePickPrompt') : t('judgeReading', { name: judge?.name ?? '—' })}
          </p>
          <div className="space-y-1.5">
            {view.submissions.map((s) => (
              <button
                key={s.card}
                onClick={() => iAmJudge && void sendAction({ action: 'judge-pick', card: s.card })}
                disabled={!iAmJudge || busy}
                className={cn(
                  'relative w-full rounded-xl border border-[#D8CCAE] bg-cream px-4 py-3 pl-7 text-left text-sm font-bold text-[#24201A] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)] transition-all',
                  iAmJudge && !busy && 'hover:-translate-y-0.5 active:scale-[0.98]'
                )}
              >
                <span aria-hidden className="absolute left-2 top-1 font-display text-[10px] font-black leading-tight text-[#24201A]/70">?<br />♣</span>
                {s.text}
              </button>
            ))}
          </div>
          {iAmJudge && <p className="text-center text-[11px] text-white/45">{t('judgeReadAloud')}</p>}
        </div>
      )}

      {/* Abattage : ma main */}
      {view.phase === 'submit' && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          {iAmJudge ? (
            <p className="py-4 text-center text-sm font-semibold text-white/60">
              {t('judgeWaits', { count: playedCount, total: playersInRound.length })}
            </p>
          ) : view.myPlayed !== null ? (
            <p className="py-4 text-center text-sm font-bold text-white/70">
              {t('played', { count: playedCount, total: playersInRound.length })}
            </p>
          ) : (
            <>
              <p className="text-center text-sm font-bold">{t('playPrompt')}</p>
              <div className="space-y-1.5">
                {view.myHand.map((c) => (
                  <button
                    key={c.card}
                    onClick={() => void sendAction({ action: 'play-card', card: c.card })}
                    disabled={busy}
                    className="relative w-full rounded-xl border border-[#D8CCAE] bg-cream px-4 py-3 pl-7 text-left text-sm font-bold text-[#24201A] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)] transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                  >
                    <span aria-hidden className="absolute left-2 top-1 font-display text-[10px] font-black leading-tight text-suit-red">J<br />♥</span>
                    {c.text}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Table : couronnes */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {view.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              p.isJudge
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-100'
                : 'border-white/10 bg-white/5 text-white/70',
              view.phase === 'submit' && !p.isJudge && p.hasPlayed && 'border-emerald-400/40'
            )}
          >
            <PlayerAvatarGlyph value={iconOf(p)} />
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
            {p.crowns > 0 && (
              <span className="inline-flex items-center gap-0.5 text-amber-300">
                <Crown className="h-3 w-3" /> {p.crowns}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="sans-filtre" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
