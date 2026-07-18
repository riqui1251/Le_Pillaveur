"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, RefreshCw, Scale } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DIL_VOTE_MS, type DilClientView } from '@/lib/dilemmes/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * DILEMMES en ligne (serveur-autoritaire). Votes SECRETS pendant la manche
 * (seul `hasVoted` circule), révélés d'un coup — la minorité trinque en mode
 * Apéro. Pas de score ni de vainqueur : c'est le brise-glace de la soirée.
 */

function parseView(json: string | null | undefined): DilClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as DilClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function DilemmesOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.dilemmes.game')
  const [busy, setBusy] = useState(false)

  const inGame = room?.gameId === 'dilemmes' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('dilemmes', inGame)
  const cosmetics = useMemberCosmetics(room)
  const isSoft = user?.ambianceMode === 'soft'

  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phaseEndsAt === null || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 500)
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
    const botsPendingVote =
      view.phase === 'vote' && view.players.some((p) => p.isBot && !p.hasVoted && !p.leftAt)
    const actorIsBot =
      view.phase === 'reveal' && view.players.find((p) => p.id === room.currentTurnUserId)?.isBot
    if (botsPendingVote || actorIsBot) {
      botTimer = setTimeout(() => send({ action: 'bot' }), view.phase === 'reveal' ? 3500 : 1500)
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
    return <GameOnlineLobby gameId="dilemmes" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-400/30 border-t-rose-400" />
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const card = view.card
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return
    setBusy(true)
    try {
      // Intention joueur : pas de verrou de version (le moteur valide la
      // phase) — un verrou ferait perdre les votes simultanés.
      await fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
    } finally {
      setBusy(false)
    }
  }

  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const votedCount = view.players.filter((p) => p.hasVoted && !p.leftAt).length
  const activeCount = view.players.filter((p) => !p.leftAt).length
  const reveal = view.lastReveal

  const cardTitle = card
    ? card.kind === 'prefer'
      ? t('kinds.prefer')
      : card.kind === 'never'
        ? t('kinds.never')
        : t('kinds.who')
    : ''

  // ── Fin de partie ────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-white">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <Scale className="h-14 w-14 text-rose-300" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('finished.title')}</h2>
          <p className="max-w-xs text-sm text-white/60">{t('finished.subtitle')}</p>
        </motion.div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-rose-700 to-amber-600 py-5 text-base font-bold"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {iVotedRematch && humanCount > 1
              ? t('finished.rematchWaiting', { count: rematchVotes.length, total: humanCount })
              : t('finished.replay')}
          </Button>
          <Button
            onClick={() => void leaveRoom()}
            variant="outline"
            className="w-full rounded-2xl border-white/15 bg-white/5 py-5 text-base font-semibold text-white/80 hover:bg-white/10"
          >
            <Home className="mr-2 h-4 w-4" /> {t('finished.backToMenu')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Compte à rebours ─────────────────────────────────────────────────────
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

  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const revealCount = (choice: string) => (reveal ?? []).filter((r) => r.choice === choice).length
  const revealVoters = (choice: string) => (reveal ?? []).filter((r) => r.choice === choice)

  const choiceCard = (choice: 'A' | 'B', label: string) => {
    const chosen = view.myVote === choice
    const showResults = view.phase === 'reveal'
    const count = showResults ? revealCount(choice) : 0
    const total = (reveal ?? []).length || 1
    return (
      <button
        key={choice}
        onClick={() => view.phase === 'vote' && !view.myVote && void sendAction({ action: 'vote', choice })}
        disabled={view.phase !== 'vote' || Boolean(view.myVote) || busy}
        className={cn(
          'relative w-full rounded-2xl border border-[#D8CCAE] bg-cream px-4 py-4 pl-8 text-left text-sm font-bold text-[#24201A] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.65)] transition-all',
          view.phase === 'vote' && !view.myVote && 'hover:-translate-y-0.5 active:scale-[0.98]',
          chosen && 'ring-2 ring-gold'
        )}
      >
        <span aria-hidden className={cn('absolute left-2.5 top-1.5 font-display text-[11px] font-black leading-tight', choice === 'A' ? 'text-suit-red' : 'text-[#24201A]')}>
          A<br />{choice === 'A' ? '♥' : '♠'}
        </span>
        {label}
        {showResults && (
          <span className="mt-2 flex items-center gap-2">
            <span className={cn('font-display text-xl font-black', choice === 'A' ? 'text-suit-red' : 'text-chip-blue')}>
              {Math.round((count / total) * 100)} %
            </span>
            <span className="flex flex-wrap gap-0.5">
              {revealVoters(choice).map((r) => (
                <span key={r.voterId} title={nameOf(r.voterId)} aria-hidden>
                  <PlayerAvatarGlyph value={iconOf({ id: r.voterId, isBot: view.players.find((p) => p.id === r.voterId)?.isBot ?? false })} />
                </span>
              ))}
            </span>
          </span>
        )}
      </button>
    )
  }

  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      {/* Bandeau */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('round', { n: view.round + 1, total: view.totalRounds })}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-rose-300">{cardTitle}</span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {timeLeftMs !== null && view.phase === 'vote' && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500 ease-linear', timeLeftMs < 8_000 ? 'bg-suit-red' : 'bg-gold')}
              style={{ width: `${Math.min(100, (timeLeftMs / DIL_VOTE_MS) * 100)}%` }}
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

      {/* La carte */}
      {card && (card.kind === 'prefer' ? (
        <div className="space-y-2">
          <p className="text-center font-display text-lg font-bold text-cream">{t('preferPrompt')}</p>
          {choiceCard('A', card.a)}
          <p aria-hidden className="text-center font-display text-xs font-bold uppercase tracking-[0.3em] text-gold">— {t('or')} —</p>
          {choiceCard('B', card.b)}
        </div>
      ) : card.kind === 'never' ? (
        <div className="space-y-2">
          <p className="text-center font-display text-lg font-bold leading-snug text-cream">
            {t('neverPrompt')} {card.text}
          </p>
          {choiceCard('A', t('neverDid'))}
          {choiceCard('B', t('neverNever'))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-center font-display text-lg font-bold leading-snug text-cream">
            {t('whoPrompt')} {card.text}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {view.players.filter((p) => !p.leftAt && p.id !== user.id).map((p) => {
              const chosen = view.myVote === p.id
              const votesFor = view.phase === 'reveal' ? revealCount(p.id) : 0
              return (
                <button
                  key={p.id}
                  onClick={() => view.phase === 'vote' && !view.myVote && void sendAction({ action: 'vote', choice: p.id })}
                  disabled={view.phase !== 'vote' || Boolean(view.myVote) || busy}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border border-[#D8CCAE] bg-cream px-3 py-2.5 text-left text-sm font-bold text-[#24201A] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.6)] transition-all',
                    view.phase === 'vote' && !view.myVote && 'hover:-translate-y-0.5 active:scale-95',
                    chosen && 'ring-2 ring-gold'
                  )}
                >
                  <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {view.phase === 'reveal' && votesFor > 0 && (
                    <span className="shrink-0 font-display text-base font-black text-suit-red">{votesFor}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Statut / continuer */}
      {view.phase === 'vote' && (
        <p className="text-center text-sm font-semibold text-white/60">
          {view.myVote ? t('voted', { count: votedCount, total: activeCount }) : t('votePrompt')}
        </p>
      )}
      {view.phase === 'reveal' && (
        <div className="space-y-2">
          {!isSoft && (
            <p className="text-center text-sm font-bold text-amber-200">
              {card?.kind === 'who' ? t('whoDrinks') : t('minorityDrinks')}
            </p>
          )}
          <Button
            onClick={() => void sendAction({ action: 'continue' })}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-r from-rose-700 to-amber-600 py-4 text-sm font-bold"
          >
            {view.round + 1 >= view.totalRounds ? t('seeEnd') : t('nextCard')}
          </Button>
        </div>
      )}

      {/* Joueurs */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {view.players.map((p) => (
          <span
            key={p.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
              view.phase === 'vote' && p.hasVoted
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                : 'border-white/10 bg-white/5 text-white/70'
            )}
          >
            <PlayerAvatarGlyph value={iconOf(p)} />
            <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
          </span>
        ))}
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="dilemmes" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
