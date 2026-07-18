"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, RefreshCw, Trophy, Hand, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PBC_WRITE_MS, type PbcClientView } from '@/lib/petit-bac/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * PETIT BAC en ligne (serveur-autoritaire). Chacun tape ses cinq réponses en
 * local ; le premier qui a tout rempli crie STOP et gèle la table (les autres
 * clients envoient leur brouillon dans la fenêtre de flush). Comptage
 * automatique, contestations à la majorité au reveal.
 */

function parseView(json: string | null | undefined): PbcClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as PbcClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

export function PetitBacOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.petit-bac.game')
  const [busy, setBusy] = useState(false)

  const inGame = room?.gameId === 'petit-bac' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('petit-bac', inGame)
  const cosmetics = useMemberCosmetics(room)

  // Brouillon local (jamais envoyé pendant l'écriture — anti-triche serveur).
  const [draft, setDraft] = useState<string[]>([])
  const draftRef = useRef(draft)
  draftRef.current = draft
  const roundKey = view ? `${view.round}` : ''
  useEffect(() => {
    setDraft(Array.from({ length: view?.categories.length ?? 5 }, () => ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, inGame])

  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phaseEndsAt === null || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 500)
    return () => clearInterval(timer)
  }, [view])

  // Tick advance générique (tous les clients, jitter).
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

  // Flush : quelqu'un a crié STOP (ou chrono) → j'envoie mon brouillon tel quel.
  // PAS de verrou de version : tous les clients déposent en même temps, le
  // premier bump de version rendrait les autres périmés (409) et leurs réponses
  // seraient perdues. Le moteur valide la phase ; on retente à chaque nouvelle
  // version serveur tant que `hasSubmitted` n'est pas confirmé.
  const flushSentRef = useRef<string | null>(null)
  useEffect(() => {
    if (!view || !room || !user || view.phase !== 'flush') return
    const me = view.players.find((p) => p.id === user.id)
    if (!me || me.leftAt || me.hasSubmitted) return
    const key = `${view.round}:${view.phaseSeq}:${room.stateVersion}`
    if (flushSentRef.current === key) return
    flushSentRef.current = key
    void fetch(`/api/online/rooms/${room.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'submit', answers: draftRef.current }),
    }).catch(() => {
      // Réseau en échec → réautorise une tentative au prochain rafraîchissement.
      flushSentRef.current = null
    })
  }, [view, room, user])

  // Arbitre humain : bots (meneur du reveal) + remplacement des partis.
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
      view.phase === 'reveal' && view.players.find((p) => p.id === room.currentTurnUserId)?.isBot
    if (actorIsBot) {
      botTimer = setTimeout(() => send({ action: 'bot' }), 5000)
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
    return <GameOnlineLobby gameId="petit-bac" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  const sendAction = async (body: Record<string, unknown>) => {
    if (!room || busy) return
    setBusy(true)
    try {
      // Intention joueur : pas de verrou de version (le moteur valide la
      // phase) — un verrou ferait perdre l'action sur écritures simultanées.
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
  const me = view.players.find((p) => p.id === user.id)
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const catLabel = (id: string) => t(`categories.${id}`)

  // ── Fin de partie ────────────────────────────────────────────────────────
  if (finished) {
    const podium = [...view.players].sort((a, b) => b.total - a.total)
    const best = podium[0]?.total ?? 0
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-white">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <Trophy className="h-14 w-14 text-gold" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('finished.title')}</h2>
          <p className="max-w-xs text-sm text-white/60">{t('finished.subtitle')}</p>
        </motion.div>

        <div className="w-full max-w-sm space-y-1.5">
          {podium.map((p, i) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                p.total === best && best > 0
                  ? 'border-gold/50 bg-gold/10'
                  : 'border-white/10 bg-white/5'
              )}
            >
              <span className="w-5 text-center font-display text-sm font-black text-white/50">{i + 1}</span>
              <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              <span className={cn('flex-1 truncate text-sm font-bold', p.id === user.id && 'text-gold')}>
                {p.name}
              </span>
              <span className="font-display text-lg font-black tabular-nums text-cream">{p.total}</span>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-sky-700 to-amber-600 py-5 text-base font-bold"
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
        <p className="text-sm font-bold uppercase tracking-widest text-sky-300/80">{t('countdown.title')}</p>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={secondsLeft}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="text-8xl font-black tabular-nums text-sky-200"
          >
            {secondsLeft}
          </motion.span>
        </AnimatePresence>
        <p className="text-xs font-semibold text-white/50">{t('countdown.hint')}</p>
      </div>
    )
  }

  const canStop =
    view.phase === 'write' && !me?.hasSubmitted && draft.every((a) => a.trim().length > 0)
  const submittedCount = view.players.filter((p) => p.hasSubmitted && !p.leftAt).length
  const activeCount = view.players.filter((p) => !p.leftAt).length

  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      {/* Bandeau : manche + lettre + chrono */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('round', { n: view.round + 1, total: view.totalRounds })}
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-0.5 font-display text-xl font-black text-gold">
              {view.letter}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {timeLeftMs !== null && view.phase === 'write' && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500 ease-linear', timeLeftMs < 15_000 ? 'bg-suit-red' : 'bg-gold')}
              style={{ width: `${Math.min(100, (timeLeftMs / PBC_WRITE_MS) * 100)}%` }}
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

      {/* ── Écriture ── */}
      {(view.phase === 'write' || view.phase === 'flush') && (
        <>
          <div className="space-y-2">
            {view.categories.map((cat, i) => (
              <label
                key={cat}
                className="block rounded-2xl border border-[#D8CCAE] bg-cream px-4 py-2.5 shadow-[0_8px_18px_-10px_rgba(0,0,0,0.65)]"
              >
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A7A55]">
                  {catLabel(cat)}
                </span>
                <input
                  type="text"
                  value={draft[i] ?? ''}
                  maxLength={40}
                  autoComplete="off"
                  disabled={view.phase !== 'write' || Boolean(me?.hasSubmitted)}
                  onChange={(e) => {
                    const next = [...draft]
                    next[i] = e.target.value
                    setDraft(next)
                  }}
                  placeholder={`${view.letter}…`}
                  className="mt-0.5 w-full bg-transparent text-sm font-bold text-[#24201A] placeholder:text-[#B7A87F] focus:outline-none"
                />
              </label>
            ))}
          </div>

          {view.phase === 'write' ? (
            me?.hasSubmitted ? (
              <p className="text-center text-sm font-semibold text-white/60">
                {t('submitted', { count: submittedCount, total: activeCount })}
              </p>
            ) : (
              <Button
                onClick={() => void sendAction({ action: 'stop', answers: draft })}
                disabled={!canStop || busy}
                className="w-full rounded-2xl bg-gradient-to-r from-sky-700 to-amber-600 py-5 text-base font-black tracking-wide disabled:opacity-50"
              >
                <Hand className="mr-2 h-5 w-5" /> {t('stop')}
              </Button>
            )
          ) : (
            <p className="text-center text-sm font-bold text-amber-200">
              {view.stopperId ? t('stopBy', { name: nameOf(view.stopperId) }) : t('flushHint')}
            </p>
          )}
        </>
      )}

      {/* ── Révélation ── */}
      {view.phase === 'reveal' && view.revealGrid && (
        <div className="space-y-3">
          {view.categories.map((cat, i) => (
            <div key={cat} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-sky-300/80">
                {catLabel(cat)}
              </p>
              <div className="space-y-1.5">
                {(view.revealGrid?.[i] ?? []).map((cell) => {
                  const cellPlayer = view.players.find((p) => p.id === cell.playerId)
                  const canContest =
                    cell.playerId !== user.id && cell.points > 0 && !cell.rejected && !cell.iContested
                  return (
                    <div
                      key={cell.playerId}
                      className="flex items-center gap-2 rounded-xl border border-[#D8CCAE] bg-cream px-3 py-1.5"
                    >
                      <span aria-hidden className="shrink-0">
                        <PlayerAvatarGlyph value={iconOf({ id: cell.playerId, isBot: cellPlayer?.isBot ?? false })} />
                      </span>
                      <span className="w-16 shrink-0 truncate text-[11px] font-bold text-[#8A7A55]">
                        {nameOf(cell.playerId)}
                      </span>
                      <span
                        className={cn(
                          'flex-1 truncate text-sm font-bold',
                          cell.rejected ? 'text-[#B7A87F] line-through' : 'text-[#24201A]',
                          !cell.answer.trim() && 'text-[#B7A87F]'
                        )}
                      >
                        {cell.answer.trim() || t('empty')}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-md px-1.5 py-0.5 font-display text-sm font-black tabular-nums',
                          cell.points === 2 && 'bg-gold/20 text-[#8A6A1B]',
                          cell.points === 1 && 'bg-sky-600/15 text-sky-800',
                          cell.points === 0 && 'text-[#B7A87F]'
                        )}
                      >
                        {cell.points}
                      </span>
                      {(canContest || cell.contestCount > 0) && (
                        <button
                          type="button"
                          disabled={!canContest || busy}
                          onClick={() =>
                            void sendAction({ action: 'contest', targetId: cell.playerId, category: i })
                          }
                          title={t('contest')}
                          className={cn(
                            'flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11px] font-bold transition-colors',
                            cell.rejected
                              ? 'border-suit-red/40 bg-suit-red/15 text-suit-red'
                              : cell.iContested
                                ? 'border-amber-500/50 bg-amber-500/15 text-amber-700'
                                : 'border-[#D8CCAE] text-[#8A7A55] hover:bg-amber-500/10'
                          )}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {cell.contestCount > 0 ? cell.contestCount : ''}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Totaux */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {[...view.players]
                .sort((a, b) => b.total + (view.roundTotals?.[b.id] ?? 0) - (a.total + (view.roundTotals?.[a.id] ?? 0)))
                .map((p) => (
                  <span key={p.id} className="flex items-center gap-1.5 text-sm">
                    <span className={cn('font-bold', p.id === user.id ? 'text-gold' : 'text-white/70')}>
                      {p.name}
                    </span>
                    <span className="font-display font-black tabular-nums text-cream">
                      {p.total + (view.roundTotals?.[p.id] ?? 0)}
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-300/80">
                      +{view.roundTotals?.[p.id] ?? 0}
                    </span>
                  </span>
                ))}
            </div>
          </div>

          <Button
            onClick={() => void sendAction({ action: 'continue' })}
            disabled={busy}
            className="w-full rounded-2xl bg-gradient-to-r from-sky-700 to-amber-600 py-4 text-sm font-bold"
          >
            {view.round + 1 >= view.totalRounds ? t('seeEnd') : t('nextRound')}
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
              (view.phase === 'write' || view.phase === 'flush') && p.hasSubmitted
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
      {tutorial.open && <GameTutorialModal gameId="petit-bac" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
