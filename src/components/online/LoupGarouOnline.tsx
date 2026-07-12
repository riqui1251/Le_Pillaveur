"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import ReactConfetti from 'react-confetti'
import {
  Beer,
  Bird,
  BookOpen,
  Eye,
  EyeOff,
  FlaskConical,
  Heart,
  Home,
  Hourglass,
  Medal,
  MessageCircle,
  Moon,
  RefreshCw,
  Send,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Vote,
  Wheat,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { PlayingCard, PlayingCardBack } from '@/components/ui/PlayingCard'
import { WolfIcon } from '@/components/icons/GameIcons'
import { cn } from '@/lib/utils'
import { lgTeamOf } from '@/lib/loup-garou/engine'
import type { LGClientView, LGPlayerView, LGRole } from '@/lib/loup-garou/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'

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

/**
 * Icône SVG + couleurs de chaque rôle : `color` sur feutre (fond sombre),
 * `ink` sur carte crème (encre foncée) — les cosmétiques clairs des pseudos
 * ne s'affichent QUE sur feutre, jamais sur crème (contraste).
 */
const ROLE_META: Record<
  LGRole,
  { Icon: ComponentType<{ className?: string }>; color: string; ink: string }
> = {
  loup: { Icon: WolfIcon, color: 'text-red-300', ink: 'text-suit-red' },
  voyante: { Icon: Sparkles, color: 'text-purple-300', ink: 'text-purple-800' },
  sorciere: { Icon: FlaskConical, color: 'text-emerald-300', ink: 'text-emerald-800' },
  chasseur: { Icon: Target, color: 'text-amber-300', ink: 'text-amber-700' },
  salvateur: { Icon: Shield, color: 'text-cyan-300', ink: 'text-cyan-800' },
  corbeau: { Icon: Bird, color: 'text-slate-300', ink: 'text-slate-600' },
  ancien: { Icon: Hourglass, color: 'text-orange-300', ink: 'text-orange-800' },
  villageois: { Icon: Wheat, color: 'text-sky-300', ink: 'text-sky-800' },
}

/** Ordre d'affichage de la légende. */
const LEGEND_ROLES: LGRole[] = [
  'loup',
  'voyante',
  'sorciere',
  'chasseur',
  'salvateur',
  'corbeau',
  'ancien',
  'villageois',
]

const PHASE_TOTAL_MS: Record<string, number> = {
  'reveal-role': 10_000,
  'mayor-election': 30_000,
  'night-guard': 25_000,
  'night-seer': 30_000,
  'night-raven': 25_000,
  'night-wolves': 45_000,
  'night-witch': 30_000,
  dawn: 10_000,
  'hunter-shot': 20_000,
  'day-vote': 60_000,
  'day-revote': 45_000,
}

const NIGHT_PHASES = new Set([
  'night-guard',
  'night-seer',
  'night-raven',
  'night-wolves',
  'night-witch',
])

/**
 * Grille de cibles (sonde / vote loup / potion / tir / vote du jour) —
 * chaque cible est une mini-carte crème qu'on « abat » sur la table. Noms en
 * encre pure (pas de cosmétiques : illisibles sur crème).
 */
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
              'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[#24201A] transition-all',
              'shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
              chosen
                ? '-translate-y-0.5 border-gold bg-cream ring-2 ring-gold'
                : 'border-[#D8CCAE] bg-cream',
              !disabled && !excluded && 'hover:-translate-y-0.5 active:scale-95',
              excluded && 'opacity-35'
            )}
          >
            <span className="text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
            <span className="min-w-0 flex-1 truncate text-xs font-bold">
              {p.name}
              {p.id === selfId && <span className="text-[#6B6455]"> {youLabel}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const WOLF_CHAT_POLL_MS = 3000

type WolfChatMessage = {
  id: string
  senderId: string
  senderName: string
  senderIcon: string | null
  body: string
  createdAt: string
  self: boolean
}

/**
 * Chat privé des loups. Canal `wolves:<roomId>`, gardé côté serveur (le
 * viewer doit avoir role==='loup' dans l'état RÉEL) — ce composant se fie au
 * serveur (404/403 = rien ne s'affiche), il ne fait qu'ouvrir/fermer.
 */
function WolfChatPanel({ open }: { open: boolean }) {
  const t = useTranslations('games.loup-garou.game')
  const tChat = useTranslations('chat')
  const [messages, setMessages] = useState<WolfChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inFlightRef = useRef(false)
  const lastIdRef = useRef<string | null>(null)

  const fetchMessages = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch('/api/chat/messages?scope=wolves', { credentials: 'include' })
      if (!res.ok) return
      const data = await res.json()
      const next: WolfChatMessage[] = Array.isArray(data?.messages) ? data.messages : []
      const nextLastId = next[next.length - 1]?.id ?? null
      if (nextLastId !== lastIdRef.current) {
        lastIdRef.current = nextLastId
        setMessages(next)
      }
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void fetchMessages()
    const timer = setInterval(fetchMessages, WOLF_CHAT_POLL_MS)
    return () => clearInterval(timer)
  }, [open, fetchMessages])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scope: 'wolves', body }),
      })
      if (res.ok) {
        setDraft('')
        await fetchMessages()
      }
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div className="space-y-2 rounded-2xl border border-suit-red/40 bg-felt-deep/90 p-3">
      <p className="flex items-center justify-center gap-1.5 text-center text-xs font-bold uppercase tracking-wide text-red-200">
        <WolfIcon className="h-4 w-4" /> {t('wolfChatTitle')}
      </p>
      <div ref={listRef} className="max-h-40 min-h-[3rem] space-y-1.5 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="py-3 text-center text-xs text-white/35">{tChat('empty')}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex', m.self ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-xl px-2.5 py-1.5',
                  m.self
                    ? 'rounded-br-sm bg-suit-red/25 text-red-50'
                    : 'rounded-bl-sm bg-white/[0.07] text-white/90'
                )}
              >
                {!m.self && (
                  <p className="mb-0.5 text-[9px] font-semibold text-red-300">
                    {m.senderIcon ? `${m.senderIcon} ` : ''}
                    {m.senderName}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-xs">{m.body}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          maxLength={500}
          placeholder={tChat('placeholder')}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-suit-red/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            void send()
          }}
          disabled={!draft.trim() || sending}
          aria-label={tChat('send')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-suit-red text-white transition-colors hover:bg-red-600 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export function LoupGarouOnline() {
  const { user } = useAuth()
  const isSoft = user?.ambianceMode === 'soft'
  const { room, voteRematch, leaveRoom, fetchRoom } = useOnlineRoom()
  const t = useTranslations('games.loup-garou.game')
  const [busy, setBusy] = useState(false)
  const [hideRole, setHideRole] = useState(false)
  const reducedMotion = useReducedMotion()
  const [showLegend, setShowLegend] = useState(false)
  const [showWolfChat, setShowWolfChat] = useState(false)
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
  const tutorial = useGameTutorial('loup-garou', inGame)
  const cosmetics = useMemberCosmetics(room)

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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
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
      const post = (expectedVersion: number) =>
        fetch(`/api/online/rooms/${room.id}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...body, expectedVersion }),
        })
      const res = await post(room.stateVersion)
      if (res.status === 409) {
        // Version périmée (ex: un loup coéquipier ou un bot a agi entre-temps) —
        // resynchronise puis retente une fois avec la version fraîche, sinon un
        // changement de cible loup pouvait silencieusement ne rien faire.
        const fresh = await fetchRoom()
        if (fresh) await post(fresh.stateVersion)
      }
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
  const iAmActingGuard = Boolean(
    myRole === 'salvateur' && me?.alive && view.phase === 'night-guard'
  )
  const iAmActingRaven = Boolean(
    myRole === 'corbeau' && me?.alive && view.phase === 'night-raven'
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
          <Trophy className="h-14 w-14 text-gold" />
          <h2 className={cn('font-display text-3xl font-bold', villageWon ? 'text-emerald-200' : 'text-red-200')}>
            {villageWon ? t('victory.village') : t('victory.loups')}
          </h2>
          {!isSoft && (
            <p className="text-sm text-white/60">
              {villageWon ? t('victory.villageDrinks') : t('victory.loupsDrinks')}
            </p>
          )}
        </motion.div>

        <XpGainBanner
          won={(() => {
            const meFinal = view.players.find((p) => p.id === user.id)
            return Boolean(
              meFinal?.role && view.winnerTeam !== null && lgTeamOf(meFinal.role) === view.winnerTeam
            )
          })()}
          playerIds={view.players.map((p) => p.id)}
          className="w-full max-w-sm"
        />

        <div className="w-full max-w-sm space-y-2">
          <p className="text-center text-[10px] font-semibold uppercase tracking-wide text-gold/60">
            {t('victory.fullReveal')}
          </p>
          {view.players.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                p.role === 'loup' ? 'border-suit-red/40 bg-suit-red/10' : 'border-gold/10 bg-felt-deep/60',
                !p.alive && 'opacity-60'
              )}
            >
              <RankCrest role={cosmetics.get(p.id)?.role} />
              <span className="text-xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-bold">
                  <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
                  {!p.alive && <Skull aria-hidden className="h-3.5 w-3.5 shrink-0 text-white/40" />}
                </p>
                {p.role && (
                  <p className={cn('flex items-center gap-1 text-xs font-semibold', ROLE_META[p.role].color)}>
                    {(() => {
                      const RoleIcon = ROLE_META[p.role].Icon
                      return <RoleIcon className="h-3.5 w-3.5 shrink-0" />
                    })()}
                    {roleName(p.role)}
                  </p>
                )}
              </div>
              {!isSoft && (
                <span className="flex items-center gap-1 text-xs text-white/50">
                  <Beer className="h-3.5 w-3.5 text-amber-300" /> {p.sips}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-5 text-base font-bold hover:from-amber-400 hover:to-amber-500"
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
    <>
    <div
      className={cn(
        'flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg',
        isNight && 'bg-gradient-to-b from-chip-blue/25 to-transparent'
      )}
    >
      {/* Bandeau : nuit/jour + phase + timer (filet d'or qui se consume) */}
      <div className="rounded-2xl border border-gold/15 bg-felt-deep/70 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold text-cream/85">
            {isNight || view.phase === 'reveal-role' ? (
              <Moon className="h-4 w-4 text-sky-300" />
            ) : (
              <Sun className="h-4 w-4 text-gold" />
            )}
            {t('round', { n: Math.max(1, view.round) })}
          </span>
          <span className="flex items-center gap-2">
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-gold">
              {t(`phases.${view.phase}`)}
            </span>
            <button
              onClick={() => setShowLegend((v) => !v)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
                showLegend
                  ? 'border-gold/50 bg-gold/15 text-gold'
                  : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
              )}
              aria-label={t('legend.title')}
              aria-expanded={showLegend}
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
            {myRole === 'loup' && (
              <button
                onClick={() => setShowWolfChat((v) => !v)}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
                  showWolfChat
                    ? 'border-suit-red/60 bg-suit-red/15 text-red-200'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                )}
                aria-label={t('wolfChatTitle')}
                aria-expanded={showWolfChat}
              >
                <MessageCircle className="h-3.5 w-3.5" />
              </button>
            )}
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
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

      {/* Légende des rôles (repliable) */}
      <AnimatePresence>
        {showLegend && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/80 p-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-gold">
                  <BookOpen className="h-3.5 w-3.5" /> {t('legend.title')}
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
                {LEGEND_ROLES.map(
                  (role) => {
                    const RoleIcon = ROLE_META[role].Icon
                    return (
                      <li
                        key={role}
                        className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2"
                      >
                        <RoleIcon aria-hidden className={cn('h-5 w-5 shrink-0', ROLE_META[role].color)} />
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
                  }
                )}
              </ul>
              <p className="text-[10px] text-white/40">{t('legend.hint')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat privé des loups (loups uniquement, repliable) */}
      {myRole === 'loup' && (
        <AnimatePresence>
          {showWolfChat && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <WolfChatPanel open={showWolfChat} />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Fantôme */}
      {view.ghost && (
        <div className="rounded-2xl border border-cream/25 bg-cream/10 px-4 py-2 text-center text-xs font-bold text-cream/90">
          {t('ghostBanner')}
        </div>
      )}

      {/* Le maire (une fois élu, visible de tous en permanence) */}
      {view.mayorId && view.phase !== 'mayor-election' && (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-center text-xs font-bold text-amber-100">
          {view.mayorId === user.id
            ? t('youAreMayor')
            : t('mayorBanner', { name: nameOf(view.mayorId) })}
        </div>
      )}

      {/* Ma carte de rôle : carte à jouer retournable — face crème quand
          visible, dos treillis or quand masquée (rien du rôle dans le DOM). */}
      {myRole && (
        <AnimatePresence mode="wait" initial={false}>
          {hideRole ? (
            <motion.div
              key="role-back"
              initial={{ rotateY: reducedMotion ? 0 : 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: reducedMotion ? 0 : 90, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
              className="relative"
            >
              <PlayingCardBack className="h-[5.75rem]" />
              <button
                onClick={() => setHideRole(false)}
                className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold transition-colors hover:bg-gold/20"
                aria-label={t('showRole')}
              >
                <Eye className="h-4 w-4" />
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="role-face"
              initial={{ rotateY: reducedMotion ? 0 : 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: reducedMotion ? 0 : 90, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
              className="relative"
            >
              <PlayingCard
                suit={lgTeamOf(myRole) === 'loups' ? 'spade' : 'heart'}
                rank="A"
                className={cn('min-h-[5.75rem]', !me?.alive && 'opacity-70')}
              >
                <div className="flex items-center gap-3 py-3 pl-7 pr-12">
                  {(() => {
                    const RoleIcon = ROLE_META[myRole].Icon
                    return (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#24201A]/15 bg-[#24201A]/5">
                        <RoleIcon aria-hidden className={cn('h-6 w-6', ROLE_META[myRole].ink)} />
                      </div>
                    )
                  })()}
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#6B6455]">
                      {t('yourRole')}
                    </p>
                    <p className={cn('truncate font-display text-xl font-bold', ROLE_META[myRole].ink)}>
                      {roleName(myRole)}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-snug text-[#6B6455]">
                      {t(`roles.${myRole}.desc`)}
                    </p>
                    {myRole === 'loup' && wolves.length > 1 && (
                      <p className="mt-1 text-[10px] font-semibold text-suit-red">
                        {t('accomplices')} : {wolves.filter((w) => w.id !== user.id).map((w) => w.name).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              </PlayingCard>
              <button
                onClick={() => setHideRole(true)}
                className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-xl border border-[#24201A]/15 bg-[#24201A]/5 text-[#24201A]/60 transition-colors hover:bg-[#24201A]/10"
                aria-label={t('hideRole')}
              >
                <EyeOff className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Bannière du dernier lynchage (persiste pendant la nuit) */}
      {view.lastVoteResult && view.phase !== 'day-vote' && view.phase !== 'day-revote' && (
        <div className="rounded-2xl border border-gold/10 bg-felt-deep/60 px-4 py-2 text-center text-xs font-semibold text-cream/75">
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
            <div className="rounded-2xl border border-gold/25 bg-felt-deep/80 p-5 text-center">
              <p className="font-display text-lg font-bold text-gold">{t('revealPrompt')}</p>
              <p className="mt-1 text-xs text-white/50">{t('revealHint')}</p>
            </div>
          )}

          {view.phase === 'mayor-election' && (
            <div className="space-y-2 rounded-2xl border border-amber-400/30 bg-felt-deep/80 p-4">
              <p className="text-center text-sm font-bold text-amber-200">
                {!me?.alive ? t('spectatorVote') : view.myMayorVote ? t('mayorVoted') : t('mayorPrompt')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {alive.map((p) => {
                  const chosen = view.myMayorVote === p.id
                  const disabled = !me?.alive || Boolean(view.myMayorVote) || busy
                  return (
                    <button
                      key={p.id}
                      onClick={() => void sendAction({ action: 'mayor-vote', targetId: p.id })}
                      disabled={disabled}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[#24201A] transition-all',
                        'shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)]',
                        chosen
                          ? '-translate-y-0.5 border-gold bg-cream ring-2 ring-gold'
                          : 'border-[#D8CCAE] bg-cream',
                        !disabled && 'hover:-translate-y-0.5 active:scale-95'
                      )}
                    >
                      <span className="text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">
                        {p.name}
                        {p.id === user.id && <span className="text-[#6B6455]"> {t('you')}</span>}
                      </span>
                      {view.hasVotedMayor[p.id] && (
                        <span className="shrink-0 text-[10px] font-bold text-emerald-700">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* NUIT : acteurs — ou écran de sommeil IDENTIQUE pour tous */}
          {isNight &&
            (iAmActingGuard ? (
              <div className="space-y-2 rounded-2xl border border-cyan-400/30 bg-felt-deep/80 p-4">
                <p className="text-center text-sm font-bold text-cyan-200">
                  {view.guardProtectedId
                    ? t('guardDone', { name: nameOf(view.guardProtectedId) })
                    : t('guardPrompt')}
                </p>
                {!view.guardProtectedId && (
                  <>
                    <TargetGrid
                      players={alive}
                      iconOf={iconOf}
                      onPick={(id) => void sendAction({ action: 'guard-protect', targetId: id })}
                      disabled={busy}
                      excludeIds={view.guardLastProtectedId ? [view.guardLastProtectedId] : []}
                      youLabel={t('you')}
                      selfId={user.id}
                    />
                    {view.guardLastProtectedId && (
                      <p className="text-center text-[10px] text-white/45">
                        {t('guardForbidden', { name: nameOf(view.guardLastProtectedId) })}
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : iAmActingRaven ? (
              <div className="space-y-2 rounded-2xl border border-slate-400/30 bg-felt-deep/80 p-4">
                <p className="text-center text-sm font-bold text-slate-200">
                  {view.ravenTargetId
                    ? t('ravenDone', { name: nameOf(view.ravenTargetId) })
                    : t('ravenPrompt')}
                </p>
                {!view.ravenTargetId && (
                  <TargetGrid
                    players={alive.filter((p) => p.id !== user.id)}
                    iconOf={iconOf}
                    onPick={(id) => void sendAction({ action: 'raven-mark', targetId: id })}
                    disabled={busy}
                    youLabel={t('you')}
                    selfId={user.id}
                  />
                )}
              </div>
            ) : iAmActingSeer ? (
              <div className="space-y-2 rounded-2xl border border-purple-400/30 bg-felt-deep/80 p-4">
                <p className="text-center text-sm font-bold text-purple-200">
                  {myPeek ? t('seerDone') : t('seerPrompt')}
                </p>
                {myPeek ? (
                  <p className="rounded-xl bg-purple-500/15 px-3 py-2 text-center text-sm font-black">
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
              <div className="space-y-2 rounded-2xl border border-suit-red/40 bg-felt-deep/80 p-4">
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
              <div className="space-y-2.5 rounded-2xl border border-emerald-400/30 bg-felt-deep/80 p-4">
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
                        <Heart className="mr-2 h-4 w-4" /> {t('witchSave', { name: nameOf(view.nightVictimId) })}
                      </Button>
                    )}
                    {view.witchPotions?.kill && (
                      <Button
                        onClick={() => setWitchKillMode(true)}
                        disabled={busy}
                        className="w-full rounded-xl bg-gradient-to-r from-suit-red to-red-700 py-3 text-sm font-bold"
                      >
                        <Skull className="mr-2 h-4 w-4" /> {t('witchKill')}
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
              <div className="rounded-2xl border border-chip-blue/40 bg-felt-deep/80 p-6 text-center">
                <Moon className="mx-auto h-10 w-10 animate-pulse text-sky-300" />
                <p className="mt-2 font-display text-lg font-bold text-cream">{t('sleep')}</p>
                <p className="mt-1 text-xs text-white/40">{t('sleepHint')}</p>
              </div>
            ))}

          {view.phase === 'dawn' && (
            <div className="rounded-2xl border border-amber-400/25 bg-felt-deep/80 p-4 text-center">
              <Sun className="mx-auto h-8 w-8 text-gold" />
              {view.lastNightDeaths.length === 0 ? (
                <p className="mt-2 font-display text-base font-bold text-emerald-200">{t('dawnNobody')}</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {view.lastNightDeaths.map((d) => (
                    <p key={d.playerId} className="text-sm font-bold text-red-200">
                      {t(isSoft ? 'dawnDeathSoft' : 'dawnDeath', {
                        name: nameOf(d.playerId),
                        role: roleName(d.role),
                      })}
                    </p>
                  ))}
                </div>
              )}
              {view.ravenTargetId && (
                <p className="mt-2 rounded-xl bg-slate-500/15 px-3 py-1.5 text-xs font-bold text-slate-200">
                  {t('ravenMarkBanner', { name: nameOf(view.ravenTargetId) })}
                </p>
              )}
              {view.elderAttackedRound === view.round && (
                <p className="mt-2 rounded-xl border border-orange-400/25 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-200">
                  {t('elderAttackedBanner')}
                </p>
              )}
            </div>
          )}

          {view.phase === 'hunter-shot' &&
            (iAmHunter ? (
              <div className="space-y-2 rounded-2xl border border-amber-400/30 bg-felt-deep/80 p-4">
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
              <div className="rounded-2xl border border-amber-400/25 bg-felt-deep/80 p-5 text-center">
                <p className="font-display text-lg font-bold text-gold">
                  {t('hunterWaiting', { name: nameOf(view.pendingHunterId) })}
                </p>
              </div>
            ))}

          {view.phase === 'day-debate' && (
            <div className="space-y-2.5 rounded-2xl border border-gold/15 bg-felt-deep/70 p-4">
              <p className="text-center text-sm font-bold">{t('debatePrompt')}</p>
              <p className="text-center text-[11px] text-white/45">{t('debateHint')}</p>
              {view.ravenTargetId && (
                <p className="rounded-xl bg-slate-500/15 px-3 py-1.5 text-center text-xs font-bold text-slate-200">
                  {t('ravenMarkBanner', { name: nameOf(view.ravenTargetId) })}
                </p>
              )}
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
                  className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-sm font-bold hover:from-amber-400 hover:to-amber-500"
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
            <div className="space-y-2 rounded-2xl border border-gold/15 bg-felt-deep/70 p-4">
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
                          'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[#24201A] transition-all',
                          'shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
                          chosen
                            ? '-translate-y-0.5 border-suit-red bg-cream ring-2 ring-suit-red'
                            : 'border-[#D8CCAE] bg-cream',
                          !disabled && 'hover:-translate-y-0.5 active:scale-95',
                          isMe && 'opacity-40'
                        )}
                      >
                        <span className="text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                        <span className="min-w-0 flex-1 truncate text-xs font-bold">
                          {p.name}
                          {isMe && <span className="text-[#6B6455]"> {t('you')}</span>}
                        </span>
                        {view.ravenTargetId === p.id && view.phase === 'day-vote' && (
                          <span
                            className="flex shrink-0 items-center gap-0.5 text-[10px] font-black text-slate-600"
                            title={t('ravenMarkBadge')}
                            aria-label={t('ravenMarkBadge')}
                          >
                            <Bird aria-hidden className="h-3 w-3" />
                            +2
                          </span>
                        )}
                        {view.hasVoted[p.id] && (
                          <span className="shrink-0 text-[10px] font-bold text-emerald-700">✓</span>
                        )}
                      </button>
                    )
                  })}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Le village : mini-cartes posées sur la table — crème pour les
          vivants, retournées côté feutre pour les morts. */}
      <div className="space-y-1.5 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gold/60">
          {t('village', { alive: alive.length, total: view.players.length })}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {view.players.map((p) => {
            const RoleIcon = p.role ? ROLE_META[p.role].Icon : null
            return p.alive ? (
              <div
                key={p.id}
                className="flex items-center gap-1.5 rounded-lg border border-[#D8CCAE] bg-cream px-2 py-1.5 text-[#24201A] shadow-[0_4px_10px_-6px_rgba(0,0,0,0.5)]"
              >
                <span className="text-sm" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
                  {p.name}
                  {p.id === user.id && <span className="text-[#6B6455]"> {t('you')}</span>}
                </span>
                {view.mayorId === p.id && (
                  <Medal className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-label={t('mayorBadge')} />
                )}
                {p.role && RoleIcon && (
                  <RoleIcon
                    aria-label={roleName(p.role)}
                    className={cn('h-3.5 w-3.5 shrink-0', ROLE_META[p.role].ink)}
                  />
                )}
                {!isSoft && p.sips > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5 text-[9px] font-semibold text-amber-700">
                    <Beer aria-hidden className="h-3 w-3" />
                    {p.sips}
                  </span>
                )}
              </div>
            ) : (
              <div
                key={p.id}
                className="flex items-center gap-1.5 rounded-lg border border-gold/25 bg-felt-deep px-2 py-1.5 opacity-80"
              >
                <Skull aria-hidden className="h-3.5 w-3.5 shrink-0 text-cream/50" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-cream/60">
                  {p.name}
                  {p.id === user.id && <span className="text-cream/40"> {t('you')}</span>}
                </span>
                {view.mayorId === p.id && (
                  <Medal className="h-3.5 w-3.5 shrink-0 text-gold/70" aria-label={t('mayorBadge')} />
                )}
                {p.role && RoleIcon && (
                  <RoleIcon
                    aria-label={roleName(p.role)}
                    className={cn('h-3.5 w-3.5 shrink-0', ROLE_META[p.role].color)}
                  />
                )}
                {!isSoft && p.sips > 0 && (
                  <span className="flex shrink-0 items-center gap-0.5 text-[9px] font-semibold text-amber-200/80">
                    <Beer aria-hidden className="h-3 w-3" />
                    {p.sips}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="loup-garou" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
