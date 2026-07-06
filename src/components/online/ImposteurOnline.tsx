"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Eye, EyeOff, Home, RefreshCw, Send, Trophy, UserX } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  isValidClue,
  IMPOSTEUR_CLUE_MAX_LEN,
  type ImposteurClientView,
} from '@/lib/imposteur/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'

/**
 * L'IMPOSTEUR en ligne (serveur-autoritaire). La vue est déjà filtrée par le
 * serveur : SEUL mon mot m'arrive — les camps des vivants ne quittent JAMAIS
 * le serveur (personne ne sait s'il est l'imposteur). Votes réduits à des
 * booléens « a voté ». Phases chronométrées : le compte à rebours est
 * décoratif côté client, l'échéance fait foi côté serveur (tick `advance`).
 */

function parseView(json: string | null | undefined): ImposteurClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as ImposteurClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

export function ImposteurOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.imposteur.game')
  const [busy, setBusy] = useState(false)
  const [hideWord, setHideWord] = useState(false)
  const [clueInput, setClueInput] = useState('')
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'imposteur' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const stateVersion = room?.stateVersion ?? -1

  // Horloge locale pour le compte à rebours de phase (décoratif).
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phaseEndsAt === null || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 500)
    return () => clearInterval(timer)
  }, [view])

  // ÉCHÉANCE DE PHASE : TOUS les clients envoient le tick « advance »
  // (idempotent, jitter) — un arbitre unique au téléphone verrouillé
  // laissait la partie bloquée jusqu'au refresh.
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

  // Ticks « arbitre » (bots + remplacement) : premier humain restant,
  // éliminé inclus (un spectateur peut encore piloter les ticks).
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

    // Bot au tour (indice / continuer) ou bots retardataires au vote.
    let botTimer: ReturnType<typeof setTimeout> | undefined
    const actor = view.players.find((p) => p.id === room.currentTurnUserId)
    const botsPendingVote =
      view.phase === 'vote' &&
      view.players.some((p) => p.isBot && !p.eliminated && !p.hasVoted)
    if (actor?.isBot || botsPendingVote) {
      botTimer = setTimeout(() => send({ action: 'bot' }), view.phase === 'reveal' ? 3200 : 1500)
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

  // Anti-AFK (phase indices uniquement — le vote a son échéance).
  const turnStartRef = useRef({ version: stateVersion, at: Date.now() })
  if (turnStartRef.current.version !== stateVersion) {
    turnStartRef.current = { version: stateVersion, at: Date.now() }
  }
  const afkTarget = view?.players.find((p) => p.id === room?.currentTurnUserId)
  const afkWatchable = Boolean(
    view &&
      view.phase === 'clue' &&
      afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      view.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  // Vide le champ d'indice à chaque nouvel état.
  useEffect(() => {
    setClueInput('')
  }, [stateVersion])

  if (!inGame) {
    return <GameOnlineLobby gameId="imposteur" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const iAmAlive = Boolean(me && !me.eliminated)
  const activeId = room.currentTurnUserId
  const isMyClueTurn = view.phase === 'clue' && activeId === user.id && iAmAlive
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const aliveCount = view.players.filter((p) => !p.eliminated).length

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

  const clueTrimmed = clueInput.trim()
  const clueOk = me ? isValidClue(clueTrimmed, me.word) && clueTrimmed !== '…' : false
  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const totalPhaseMs = view.phase === 'clue' ? 45_000 : 60_000
  const currentRoundClues = view.clues.filter((c) => c.round === view.round)
  const pastClues = view.clues.filter((c) => c.round < view.round)

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const civilWon = view.winnerTeam === 'civil'
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
          <Trophy className={cn('h-14 w-14', civilWon ? 'text-emerald-400' : 'text-fuchsia-400')} />
          <h2 className="text-3xl font-black">
            {civilWon ? t('victory.civilWin') : t('victory.imposteurWin')}
          </h2>
          <p className="text-sm text-white/60">
            {civilWon ? t('victory.civilDrinks') : t('victory.imposteurDrinks')}
          </p>
        </motion.div>

        {/* Révélation complète */}
        <div className="w-full max-w-sm space-y-2">
          <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">
            {t('victory.fullReveal')}
          </p>
          {view.players.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                p.team === 'imposteur'
                  ? 'border-fuchsia-400/40 bg-fuchsia-500/10'
                  : 'border-white/10 bg-white/5',
                p.eliminated && 'opacity-60'
              )}
            >
              <span className="text-xl" aria-hidden>{iconOf(p)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {p.name}
                  {p.eliminated && <span className="text-white/40"> 💀</span>}
                </p>
                <p className="text-xs text-white/50">« {p.word} »</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-black uppercase',
                  p.team === 'imposteur'
                    ? 'bg-fuchsia-500/30 text-fuchsia-100'
                    : 'bg-emerald-500/20 text-emerald-100'
                )}
              >
                {p.team === 'imposteur' ? t('victory.teamImposteur') : t('victory.teamCivil')}
              </span>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 py-5 text-base font-bold"
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

  // ── Partie en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  return (
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      {/* Bandeau : manche + phase + timer */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">{t('round', { n: view.round })}</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-300">
            {view.phase === 'clue' && t('phaseClue')}
            {view.phase === 'vote' && t('phaseVote')}
            {view.phase === 'reveal' && t('phaseReveal')}
          </span>
        </div>
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 10_000 ? 'bg-red-400' : 'bg-violet-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalPhaseMs) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Bannières retour / AFK */}
      {leftPlayer?.leftAt && view.phase !== 'finished' && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {t('waitingReturn', {
            name: leftPlayer.name,
            seconds: Math.max(0, Math.ceil((leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
          })}
        </div>
      )}
      {afkWatch && afkTarget && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-100">
          {afkTarget.id === user.id
            ? t('afkWarningSelf', {
                seconds: Math.max(0, Math.ceil((turnStartRef.current.at + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
              })
            : t('afkWarning', {
                name: afkTarget.name,
                seconds: Math.max(0, Math.ceil((turnStartRef.current.at + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
              })}
        </div>
      )}

      {/* Mon mot secret */}
      {me && (
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3',
            iAmAlive
              ? 'border-violet-400/30 bg-gradient-to-br from-violet-600/15 to-transparent'
              : 'border-white/10 bg-white/5 opacity-70'
          )}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {iAmAlive ? t('yourWord') : t('eliminatedYou')}
            </p>
            <p className="truncate text-xl font-black tracking-wide">
              {hideWord ? '••••••' : `« ${me.word} »`}
            </p>
            {iAmAlive && <p className="mt-0.5 text-[10px] text-white/40">{t('wordHint')}</p>}
          </div>
          <button
            onClick={() => setHideWord((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10"
            aria-label={hideWord ? t('showWord') : t('hideWord')}
          >
            {hideWord ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* Révélation */}
      <AnimatePresence>
        {view.phase === 'reveal' && reveal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl border border-violet-400/30 bg-gray-900/80 p-4 text-center"
          >
            {reveal.eliminatedId ? (
              <>
                <UserX className="mx-auto h-8 w-8 text-red-300" />
                <p className="text-lg font-black">
                  {t('reveal.outTitle', { name: nameOf(reveal.eliminatedId) })}
                </p>
                <p className="text-sm text-white/70">
                  {t('reveal.outWord', { word: reveal.word ?? '—' })}
                </p>
                <p
                  className={cn(
                    'mx-auto w-fit rounded-full px-3 py-1 text-sm font-black uppercase',
                    reveal.team === 'imposteur'
                      ? 'bg-fuchsia-500/25 text-fuchsia-100'
                      : 'bg-emerald-500/20 text-emerald-100'
                  )}
                >
                  {reveal.team === 'imposteur' ? t('reveal.wasImposteur') : t('reveal.wasCivil')}
                </p>
                <p className="text-sm font-bold text-amber-200">
                  {t('reveal.sips', { name: nameOf(reveal.eliminatedId), sips: reveal.sips })}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-black">{t('reveal.tieTitle')}</p>
                <p className="text-sm text-white/60">{t('reveal.tieMsg')}</p>
              </>
            )}
            {/* Décompte public */}
            {Object.keys(reveal.tally).length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 text-[11px] text-white/60">
                {Object.entries(reveal.tally)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, count]) => (
                    <span key={id} className="rounded-full bg-white/8 px-2 py-0.5">
                      {nameOf(id)} : {count}
                    </span>
                  ))}
              </div>
            )}
            <Button
              onClick={() => void sendAction({ action: 'continue' })}
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 py-4 text-sm font-bold"
            >
              {aliveCount <= 3 || reveal.team === 'imposteur'
                ? t('reveal.seeResult')
                : t('reveal.continue')}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vote */}
      {view.phase === 'vote' && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-center text-sm font-bold">
            {iAmAlive
              ? view.myVote
                ? t('voted')
                : t('votePrompt')
              : t('spectatorVote')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {view.players
              .filter((p) => !p.eliminated)
              .map((p) => {
                const isMe = p.id === user.id
                const chosen = view.myVote === p.id
                const disabled = !iAmAlive || Boolean(view.myVote) || isMe || busy
                return (
                  <button
                    key={p.id}
                    onClick={() => void sendAction({ action: 'vote', targetId: p.id })}
                    disabled={disabled}
                    className={cn(
                      'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all',
                      chosen
                        ? 'border-violet-400/70 bg-violet-500/20 ring-2 ring-violet-400'
                        : 'border-white/10 bg-white/5',
                      !disabled && 'hover:bg-white/10 active:scale-95',
                      isMe && 'opacity-40'
                    )}
                  >
                    <span className="text-lg" aria-hidden>{iconOf(p)}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-bold">
                      {p.name}
                      {isMe && <span className="text-white/40"> {t('you')}</span>}
                    </span>
                    {p.hasVoted && (
                      <span className="shrink-0 text-[10px] font-bold text-emerald-300">✓</span>
                    )}
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {/* Fil d'indices */}
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
          {t('cluesTitle', { n: view.round })}
        </p>
        {view.phase === 'clue' && (
          <p className="text-center text-sm font-bold text-violet-200">
            {isMyClueTurn ? t('yourTurnClue') : t('turnOf', { name: nameOf(activeId) })}
          </p>
        )}
        <ul className="space-y-1.5">
          {view.clueOrder.map((pid) => {
            const p = view.players.find((q) => q.id === pid)
            if (!p) return null
            const clue = currentRoundClues.find((c) => c.playerId === pid)
            const isActive = view.phase === 'clue' && activeId === pid
            return (
              <li
                key={pid}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2',
                  isActive
                    ? 'border-violet-400/50 bg-violet-500/10'
                    : 'border-white/8 bg-white/4',
                  p.eliminated && 'opacity-45'
                )}
              >
                <span className="text-base" aria-hidden>{iconOf(p)}</span>
                <span className="w-24 shrink-0 truncate text-xs font-semibold text-white/70">
                  {p.name}
                  {p.id === user.id && <span className="text-white/40"> {t('you')}</span>}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {clue ? `« ${clue.text} »` : isActive ? '✏️…' : ''}
                </span>
              </li>
            )
          })}
        </ul>
        {/* Manches précédentes (aide-mémoire compact) */}
        {pastClues.length > 0 && (
          <details className="text-xs text-white/50">
            <summary className="cursor-pointer font-semibold">{t('pastClues')}</summary>
            <div className="mt-1.5 space-y-1">
              {pastClues.map((c, i) => (
                <p key={i}>
                  <span className="text-white/35">M{c.round} · {nameOf(c.playerId)} :</span> « {c.text} »
                </p>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Saisie d'indice (à mon tour) */}
      {isMyClueTurn && me && (
        <div className="space-y-1.5 rounded-2xl border border-violet-400/40 bg-gray-900/85 p-3">
          <div className="flex gap-2">
            <input
              value={clueInput}
              onChange={(e) => setClueInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && clueOk && !busy) {
                  void sendAction({ action: 'clue', text: clueTrimmed })
                }
              }}
              maxLength={IMPOSTEUR_CLUE_MAX_LEN}
              placeholder={t('cluePlaceholder')}
              autoFocus
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-sm font-semibold text-white placeholder:text-white/30 focus:border-violet-400 focus:outline-none"
            />
            <Button
              onClick={() => void sendAction({ action: 'clue', text: clueTrimmed })}
              disabled={busy || !clueOk}
              className="shrink-0 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 font-bold"
              aria-label={t('clueSend')}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {clueTrimmed.length > 0 && !clueOk && (
            <p className="text-[10px] font-semibold text-red-300/80">{t('clueInvalid')}</p>
          )}
        </div>
      )}
    </div>
  )
}
