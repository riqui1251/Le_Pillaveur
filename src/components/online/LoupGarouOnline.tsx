"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import { Beer, BookOpen, Eye, EyeOff, Home, Moon, RefreshCw, Sun, Trophy, Vote, X } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LGClientView, LGPlayerView, LGRole } from '@/lib/loup-garou/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'

/**
 * LOUP-GAROU en ligne. La vue reçue est déjà filtrée par le serveur selon QUI
 * regarde (villageois / loup / fantôme omniscient) — ce composant ne fait
 * qu'afficher ce qu'on lui donne. Pendant la nuit, les joueurs SANS action
 * voient tous exactement le même écran « le village dort » (anti-leak).
 */

function parseView(json: string | null | undefined): LGClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as LGClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

const ROLE_META: Record<LGRole, { icon: string; color: string }> = {
  loup: { icon: '🐺', color: 'text-red-300' },
  voyante: { icon: '🔮', color: 'text-violet-300' },
  sorciere: { icon: '🧪', color: 'text-emerald-300' },
  chasseur: { icon: '🏹', color: 'text-amber-300' },
  villageois: { icon: '🧑‍🌾', color: 'text-sky-300' },
}

const PHASE_TOTAL_MS: Record<string, number> = {
  'reveal-role': 10_000,
  'night-seer': 30_000,
  'night-wolves': 45_000,
  'night-witch': 30_000,
  dawn: 10_000,
  'hunter-shot': 20_000,
  'day-vote': 60_000,
  'day-revote': 45_000,
}

const NIGHT_PHASES = new Set(['night-seer', 'night-wolves', 'night-witch'])

/** Grille de cibles (sonde / vote loup / potion / tir / vote du jour). */
function TargetGrid({
  players,
  iconOf,
  onPick,
  disabled,
  chosenId,
  excludeIds = [],
  youLabel,
  selfId,
}: {
  players: LGPlayerView[]
  iconOf: (p: { id: string; isBot: boolean }) => string
  onPick: (id: string) => void
  disabled: boolean
  chosenId?: string | null
  excludeIds?: string[]
  youLabel: string
  selfId: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {players.map((p) => {
        const excluded = excludeIds.includes(p.id)
        const chosen = chosenId === p.id
        return (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            disabled={disabled || excluded}
            className={cn(
              'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all',
              chosen
                ? 'border-indigo-400/70 bg-indigo-500/20 ring-2 ring-indigo-400'
                : 'border-white/10 bg-white/5',
              !disabled && !excluded && 'hover:bg-white/10 active:scale-95',
              excluded && 'opacity-35'
            )}
          >
            <span className="text-lg" aria-hidden>{iconOf(p)}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-bold">
              {p.name}
              {p.id === selfId && <span className="text-white/40"> {youLabel}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function LoupGarouOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.loup-garou.game')
  const [busy, setBusy] = useState(false)
  const [hideRole, setHideRole] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [witchKillMode, setWitchKillMode] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const updateSize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  const inGame = room?.gameId === 'loup-garou' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const stateVersion = room?.stateVersion ?? -1

  // Horloge locale (le serveur seul fait foi) + reset du mode potion.
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    if (!view || view.phaseEndsAt === null || view.phase === 'finished') return
    const timer = setInterval(() => setClock(Date.now()), 400)
    return () => clearInterval(timer)
  }, [view])
  useEffect(() => {
    setWitchKillMode(false)
  }, [stateVersion])

  // ÉCHÉANCE DE PHASE : TOUS les clients envoient le tick « advance »
  // (idempotent — 409 PHASE_CHANGED pour les retardataires, jitter pour
  // étaler). Un arbitre unique ne suffisait pas : téléphone verrouillé =
  // timers gelés = partie bloquée jusqu'au refresh.
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

  // Ticks « arbitre » (bots + remplacement) : premier humain RESTANT —
  // vivant OU fantôme (un mort peut encore piloter les ticks).
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

    // Tick bot « au cas où » : NOT_BOT_TURN (409) si aucun bot concerné.
    let botTimer: ReturnType<typeof setTimeout> | undefined
    if (view.players.some((p) => p.isBot)) {
      botTimer = setTimeout(() => send({ action: 'bot' }), 2500 + Math.random() * 3000)
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
    return <GameOnlineLobby gameId="loup-garou" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400/30 border-t-indigo-400" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const myRole = view.myRole
  const finished = view.phase === 'finished'
  const isNight = NIGHT_PHASES.has(view.phase)
  const alive = view.players.filter((p) => p.alive)
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const roleName = (role: LGRole) => t(`roles.${role}.name`)

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
  const totalPhaseMs =
    view.phase === 'day-debate' ? view.debateMs : PHASE_TOTAL_MS[view.phase] ?? 60_000

  const myPeek = view.seerPeeks?.find((p) => p.round === view.round) ?? null
  const iAmActingSeer = Boolean(myRole === 'voyante' && me?.alive && view.phase === 'night-seer')
  const iAmActingWolf = Boolean(myRole === 'loup' && me?.alive && view.phase === 'night-wolves')
  const iAmActingWitch = Boolean(
    myRole === 'sorciere' && me?.alive && view.phase === 'night-witch'
  )
  const iAmHunter = view.phase === 'hunter-shot' && view.pendingHunterId === user.id
  const wolves = view.players.filter((p) => p.role === 'loup')

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const villageWon = view.winnerTeam === 'village'
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
          <Trophy className={cn('h-14 w-14', villageWon ? 'text-emerald-400' : 'text-red-400')} />
          <h2 className="text-3xl font-black">
            {villageWon ? t('victory.village') : t('victory.loups')}
          </h2>
          <p className="text-sm text-white/60">
            {villageWon ? t('victory.villageDrinks') : t('victory.loupsDrinks')}
          </p>
        </motion.div>

        <div className="w-full max-w-sm space-y-2">
          <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">
            {t('victory.fullReveal')}
          </p>
          {view.players.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                p.role === 'loup' ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-white/5',
                !p.alive && 'opacity-60'
              )}
            >
              <span className="text-xl" aria-hidden>{iconOf(p)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {p.name}
                  {!p.alive && <span className="text-white/40"> 💀</span>}
                </p>
                {p.role && (
                  <p className={cn('text-xs font-semibold', ROLE_META[p.role].color)}>
                    {ROLE_META[p.role].icon} {roleName(p.role)}
                  </p>
                )}
              </div>
              <span className="flex items-center gap-1 text-xs text-white/50">
                <Beer className="h-3.5 w-3.5 text-amber-300" /> {p.sips}
              </span>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-slate-600 to-indigo-500 py-5 text-base font-bold"
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
  return (
    <div
      className={cn(
        'flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg',
        isNight && 'bg-gradient-to-b from-indigo-950/40 to-transparent'
      )}
    >
      {/* Bandeau : nuit/jour + phase + timer */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-white/80">
            {isNight || view.phase === 'reveal-role' ? (
              <Moon className="h-4 w-4 text-indigo-300" />
            ) : (
              <Sun className="h-4 w-4 text-amber-300" />
            )}
            {t('round', { n: Math.max(1, view.round) })}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300">
              {t(`phases.${view.phase}`)}
            </span>
            <button
              onClick={() => setShowLegend((v) => !v)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
                showLegend
                  ? 'border-indigo-400/50 bg-indigo-500/20 text-indigo-200'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
              )}
              aria-label={t('legend.title')}
              aria-expanded={showLegend}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500 ease-linear',
                timeLeftMs < 10_000 ? 'bg-red-400' : 'bg-indigo-400'
              )}
              style={{ width: `${Math.min(100, (timeLeftMs / totalPhaseMs) * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Légende des rôles (repliable) */}
      <AnimatePresence>
        {showLegend && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 rounded-2xl border border-indigo-400/25 bg-gray-900/80 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-200">
                  📖 {t('legend.title')}
                </p>
                <button
                  onClick={() => setShowLegend(false)}
                  className="flex h-6 w-6 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label={t('legend.close')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="space-y-1.5">
                {(['loup', 'voyante', 'sorciere', 'chasseur', 'villageois'] as LGRole[]).map(
                  (role) => (
                    <li
                      key={role}
                      className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2"
                    >
                      <span className="text-lg leading-none" aria-hidden>
                        {ROLE_META[role].icon}
                      </span>
                      <span className="min-w-0">
                        <span className={cn('block text-xs font-bold', ROLE_META[role].color)}>
                          {roleName(role)}
                        </span>
                        <span className="block text-[11px] leading-snug text-white/55">
                          {t(`roles.${role}.desc`)}
                        </span>
                      </span>
                    </li>
                  )
                )}
              </ul>
              <p className="text-[10px] text-white/40">{t('legend.hint')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fantôme */}
      {view.ghost && (
        <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-center text-xs font-bold text-violet-100">
          {t('ghostBanner')}
        </div>
      )}

      {/* Ma carte de rôle */}
      {myRole && (
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3',
            me?.alive
              ? 'border-indigo-400/30 bg-gradient-to-br from-indigo-600/15 to-transparent'
              : 'border-white/10 bg-white/5 opacity-70'
          )}
        >
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {t('yourRole')}
            </p>
            <p className={cn('truncate text-xl font-black', ROLE_META[myRole].color)}>
              {hideRole ? '••••••' : `${ROLE_META[myRole].icon} ${roleName(myRole)}`}
            </p>
            {!hideRole && (
              <p className="mt-0.5 text-[10px] text-white/40">{t(`roles.${myRole}.desc`)}</p>
            )}
            {!hideRole && myRole === 'loup' && wolves.length > 1 && (
              <p className="mt-1 text-[10px] font-semibold text-red-200/80">
                {t('accomplices')} : {wolves.filter((w) => w.id !== user.id).map((w) => w.name).join(', ')}
              </p>
            )}
          </div>
          <button
            onClick={() => setHideRole((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-colors hover:bg-white/10"
            aria-label={hideRole ? t('showRole') : t('hideRole')}
          >
            {hideRole ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
      )}

      {/* Bannière du dernier lynchage (persiste pendant la nuit) */}
      {view.lastVoteResult && view.phase !== 'day-vote' && view.phase !== 'day-revote' && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-center text-xs font-semibold text-white/70">
          {view.lastVoteResult.eliminatedId
            ? t('voteBanner', {
                name: nameOf(view.lastVoteResult.eliminatedId),
                role: view.lastVoteResult.role ? roleName(view.lastVoteResult.role) : '—',
              })
            : t('voteTieBanner')}
        </div>
      )}

      {/* ── Centre par phase ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${view.phase}#${view.phaseSeq}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="space-y-3"
        >
          {view.phase === 'reveal-role' && (
            <div className="rounded-2xl border border-indigo-400/25 bg-gray-900/70 p-5 text-center">
              <p className="text-lg font-black">{t('revealPrompt')}</p>
              <p className="mt-1 text-xs text-white/50">{t('revealHint')}</p>
            </div>
          )}

          {/* NUIT : acteurs — ou écran de sommeil IDENTIQUE pour tous */}
          {isNight &&
            (iAmActingSeer ? (
              <div className="space-y-2 rounded-2xl border border-violet-400/30 bg-gray-900/80 p-4">
                <p className="text-center text-sm font-bold text-violet-200">
                  {myPeek ? t('seerDone') : t('seerPrompt')}
                </p>
                {myPeek ? (
                  <p className="rounded-xl bg-violet-500/15 px-3 py-2 text-center text-sm font-black">
                    {t('seerResult', {
                      name: nameOf(myPeek.targetId),
                      team: myPeek.team === 'loups' ? t('teamLoups') : t('teamVillage'),
                    })}
                  </p>
                ) : (
                  <TargetGrid
                    players={alive.filter((p) => p.id !== user.id)}
                    iconOf={iconOf}
                    onPick={(id) => void sendAction({ action: 'seer-peek', targetId: id })}
                    disabled={busy}
                    youLabel={t('you')}
                    selfId={user.id}
                  />
                )}
              </div>
            ) : iAmActingWolf ? (
              <div className="space-y-2 rounded-2xl border border-red-400/30 bg-gray-900/80 p-4">
                <p className="text-center text-sm font-bold text-red-200">{t('wolfPrompt')}</p>
                <TargetGrid
                  players={alive.filter((p) => p.role !== 'loup')}
                  iconOf={iconOf}
                  onPick={(id) => void sendAction({ action: 'wolf-vote', targetId: id })}
                  disabled={busy}
                  chosenId={view.wolfVotes?.[user.id] ?? null}
                  youLabel={t('you')}
                  selfId={user.id}
                />
                {view.wolfVotes && Object.keys(view.wolfVotes).length > 0 && (
                  <p className="text-center text-[10px] text-red-200/70">
                    {t('wolfPack')} :{' '}
                    {Object.entries(view.wolfVotes)
                      .map(([w, target]) => `${nameOf(w)} → ${nameOf(target)}`)
                      .join(' · ')}
                  </p>
                )}
              </div>
            ) : iAmActingWitch ? (
              <div className="space-y-2.5 rounded-2xl border border-emerald-400/30 bg-gray-900/80 p-4">
                <p className="text-center text-sm font-bold text-emerald-200">
                  {view.nightVictimId
                    ? t('witchVictim', { name: nameOf(view.nightVictimId) })
                    : t('witchNoVictim')}
                </p>
                {view.witchActed ? (
                  <p className="text-center text-xs text-white/50">{t('witchDone')}</p>
                ) : witchKillMode ? (
                  <>
                    <p className="text-center text-xs font-semibold text-white/60">
                      {t('witchKillPrompt')}
                    </p>
                    <TargetGrid
                      players={alive.filter((p) => p.id !== user.id)}
                      iconOf={iconOf}
                      onPick={(id) =>
                        void sendAction({ action: 'witch', witchAction: 'kill', targetId: id })
                      }
                      disabled={busy}
                      youLabel={t('you')}
                      selfId={user.id}
                    />
                    <Button
                      onClick={() => setWitchKillMode(false)}
                      variant="outline"
                      className="w-full rounded-xl border-white/15 bg-white/5 py-2 text-xs text-white/70"
                    >
                      {t('witchCancel')}
                    </Button>
                  </>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {view.witchPotions?.save && view.nightVictimId && (
                      <Button
                        onClick={() => void sendAction({ action: 'witch', witchAction: 'save' })}
                        disabled={busy}
                        className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 py-3 text-sm font-bold"
                      >
                        💚 {t('witchSave', { name: nameOf(view.nightVictimId) })}
                      </Button>
                    )}
                    {view.witchPotions?.kill && (
                      <Button
                        onClick={() => setWitchKillMode(true)}
                        disabled={busy}
                        className="w-full rounded-xl bg-gradient-to-r from-red-700 to-rose-600 py-3 text-sm font-bold"
                      >
                        ☠️ {t('witchKill')}
                      </Button>
                    )}
                    <Button
                      onClick={() => void sendAction({ action: 'witch', witchAction: 'none' })}
                      disabled={busy}
                      variant="outline"
                      className="w-full rounded-xl border-white/15 bg-white/5 py-3 text-sm font-semibold text-white/70"
                    >
                      {t('witchNone')}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* Écran de sommeil — IDENTIQUE pour tous les non-acteurs. */
              <div className="rounded-2xl border border-indigo-400/20 bg-gray-900/70 p-6 text-center">
                <Moon className="mx-auto h-10 w-10 animate-pulse text-indigo-300" />
                <p className="mt-2 text-lg font-black text-indigo-100">{t('sleep')}</p>
                <p className="mt-1 text-xs text-white/40">{t('sleepHint')}</p>
              </div>
            ))}

          {view.phase === 'dawn' && (
            <div className="rounded-2xl border border-amber-400/25 bg-gray-900/80 p-4 text-center">
              <Sun className="mx-auto h-8 w-8 text-amber-300" />
              {view.lastNightDeaths.length === 0 ? (
                <p className="mt-2 text-sm font-black text-emerald-200">{t('dawnNobody')}</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {view.lastNightDeaths.map((d) => (
                    <p key={d.playerId} className="text-sm font-bold text-red-200">
                      {t('dawnDeath', {
                        name: nameOf(d.playerId),
                        role: roleName(d.role),
                      })}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {view.phase === 'hunter-shot' &&
            (iAmHunter ? (
              <div className="space-y-2 rounded-2xl border border-amber-400/30 bg-gray-900/80 p-4">
                <p className="text-center text-sm font-bold text-amber-200">{t('hunterPrompt')}</p>
                <TargetGrid
                  players={alive}
                  iconOf={iconOf}
                  onPick={(id) => void sendAction({ action: 'hunter-shot', targetId: id })}
                  disabled={busy}
                  youLabel={t('you')}
                  selfId={user.id}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-400/25 bg-gray-900/80 p-5 text-center">
                <p className="text-lg font-black text-amber-200">
                  {t('hunterWaiting', { name: nameOf(view.pendingHunterId) })}
                </p>
              </div>
            ))}

          {view.phase === 'day-debate' && (
            <div className="space-y-2.5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-center text-sm font-bold">{t('debatePrompt')}</p>
              <p className="text-center text-[11px] text-white/45">{t('debateHint')}</p>
              {/* Paroles des bots : accusations, défenses, alliances. */}
              {view.debateSpeech.filter((sp) => sp.round === view.round).length > 0 && (
                <ul className="space-y-1">
                  {view.debateSpeech
                    .filter((sp) => sp.round === view.round)
                    .map((sp, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-white/8 bg-white/4 px-3 py-1.5 text-xs text-white/80"
                      >
                        <span className="font-bold">🤖 {nameOf(sp.playerId)}</span>{' '}
                        {t(`botSay.${sp.kind}`, { name: nameOf(sp.targetId) })}
                      </li>
                    ))}
                </ul>
              )}
              {me?.alive && (
                <Button
                  onClick={() => void sendAction({ action: 'debate-skip' })}
                  disabled={busy || view.debateSkips.includes(user.id)}
                  className="w-full rounded-xl bg-gradient-to-r from-slate-600 to-indigo-500 py-3 text-sm font-bold"
                >
                  <Vote className="mr-2 h-4 w-4" />
                  {view.debateSkips.includes(user.id)
                    ? t('skipWaiting', { n: view.debateSkips.length, total: alive.length })
                    : t('skipToVote', { n: view.debateSkips.length, total: alive.length })}
                </Button>
              )}
            </div>
          )}

          {(view.phase === 'day-vote' || view.phase === 'day-revote') && (
            <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-center text-sm font-bold">
                {!me?.alive
                  ? t('spectatorVote')
                  : view.myVote
                    ? t('voted')
                    : view.phase === 'day-revote'
                      ? t('revotePrompt')
                      : t('votePrompt')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {alive
                  .filter((p) => !view.revoteCandidates || view.revoteCandidates.includes(p.id))
                  .map((p) => {
                    const isMe = p.id === user.id
                    const chosen = view.myVote === p.id
                    const disabled = !me?.alive || Boolean(view.myVote) || isMe || busy
                    return (
                      <button
                        key={p.id}
                        onClick={() => void sendAction({ action: 'day-vote', targetId: p.id })}
                        disabled={disabled}
                        className={cn(
                          'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all',
                          chosen
                            ? 'border-red-400/70 bg-red-500/15 ring-2 ring-red-400'
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
                        {view.hasVoted[p.id] && (
                          <span className="shrink-0 text-[10px] font-bold text-emerald-300">✓</span>
                        )}
                      </button>
                    )
                  })}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Le village (vivants + morts, rôles quand visibles) */}
      <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
          {t('village', { alive: alive.length, total: view.players.length })}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {view.players.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-2 py-1.5',
                p.alive ? 'border-white/8 bg-white/4' : 'border-white/5 bg-white/2 opacity-50'
              )}
            >
              <span className="text-sm" aria-hidden>{p.alive ? iconOf(p) : '💀'}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
                {p.name}
                {p.id === user.id && <span className="text-white/40"> {t('you')}</span>}
              </span>
              {p.role && (
                <span className="shrink-0 text-xs" title={roleName(p.role)} aria-label={roleName(p.role)}>
                  {ROLE_META[p.role].icon}
                </span>
              )}
              {p.sips > 0 && (
                <span className="shrink-0 text-[9px] text-amber-200/80">🍺{p.sips}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
