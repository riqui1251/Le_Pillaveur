"use client"

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, RefreshCw, Crown } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  preRankOf,
  preSuitOf,
  PRE_RANKS,
  PRE_SUITS,
  PRE_TURN_MS,
  type PreClientView,
} from '@/lib/president/engine'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/**
 * PRÉSIDENT en ligne (serveur-autoritaire). Main triée en éventail
 * horizontal, sélection par rang (tap = lever la carte), Poser/Passer en
 * zone pouce. Les mains adverses ne circulent jamais — seulement les comptes.
 */

function parseView(json: string | null | undefined): PreClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as PreClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

function CardFace({ card, raised, onClick }: { card: number; raised?: boolean; onClick?: () => void }) {
  const rank = PRE_RANKS[preRankOf(card)]
  const suit = PRE_SUITS[preSuitOf(card)]
  const red = suit === '♥' || suit === '♦'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex h-16 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-[#D8CCAE] bg-cream shadow-[0_6px_12px_-6px_rgba(0,0,0,0.7)] transition-transform',
        raised && '-translate-y-3 ring-2 ring-gold',
        onClick && 'active:scale-95'
      )}
    >
      <span className={cn('font-display text-base font-black leading-none', red ? 'text-suit-red' : 'text-[#24201A]')}>
        {rank}
      </span>
      <span className={cn('text-lg leading-none', red ? 'text-suit-red' : 'text-[#24201A]')} aria-hidden>
        {suit}
      </span>
    </button>
  )
}

export function PresidentOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.president.game')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number[]>([])

  const inGame = room?.gameId === 'president' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('president', inGame)
  const cosmetics = useMemberCosmetics(room)
  const isSoft = user?.ambianceMode === 'soft'

  // La sélection se vide à chaque changement de pli/tour.
  const turnKey = view ? `${view.phaseSeq}` : ''
  useEffect(() => {
    setSelected([])
  }, [turnKey])

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

  // Arbitre humain : tours des bots + remplacement des partis.
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
    const actorIsBot = view.players.find((p) => p.id === room.currentTurnUserId)?.isBot
    if (actorIsBot && (view.phase === 'playing' || view.phase === 'interlude')) {
      botTimer = setTimeout(() => send({ action: 'bot' }), view.phase === 'interlude' ? 5000 : 1600)
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
    return <GameOnlineLobby gameId="president" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
      </div>
    )
  }

  const finished = view.phase === 'finished'
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '—'
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
        // Intention joueur : pas de verrou de version (le moteur valide le
        // tour et la légalité du combo).
        body: JSON.stringify(body),
      })
    } finally {
      setBusy(false)
    }
  }

  const timeLeftMs = view.phaseEndsAt === null ? null : Math.max(0, view.phaseEndsAt - clock)
  const me = view.players.find((p) => p.id === user.id)
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const myTurn = view.phase === 'playing' && view.currentTurnId === user.id
  const iAmOut = view.outOrder.includes(user.id)
  const myOutRank = view.outOrder.indexOf(user.id) + 1

  const toggleCard = (card: number) => {
    if (!myTurn || busy) return
    setSelected((prev) => {
      if (prev.includes(card)) return prev.filter((c) => c !== card)
      // Sélection homogène : un rang différent redémarre la sélection.
      if (prev.length > 0 && preRankOf(prev[0]) !== preRankOf(card)) return [card]
      return [...prev, card]
    })
  }

  const canPlaySelection =
    myTurn &&
    selected.length > 0 &&
    (!view.lastPlay ||
      (selected.length === view.lastPlay.cards.length &&
        preRankOf(selected[0]) > preRankOf(view.lastPlay.cards[0])))

  // ── Fin de partie ────────────────────────────────────────────────────────
  if (finished) {
    const ranking = view.lastRanking ?? []
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-white">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <Crown className="h-14 w-14 text-gold" />
          <h2 className="font-display text-3xl font-bold text-gold">{t('finished.title')}</h2>
          <p className="max-w-xs text-sm text-white/60">
            {t('finished.subtitle', { name: nameOf(ranking[0] ?? null) })}
          </p>
        </motion.div>

        <div className="w-full max-w-sm space-y-1.5">
          {ranking.map((id, i) => {
            const p = view.players.find((x) => x.id === id)
            if (!p) return null
            const isTrou = i === ranking.length - 1
            return (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  i === 0 ? 'border-gold/50 bg-gold/10' : isTrou ? 'border-suit-red/40 bg-suit-red/10' : 'border-white/10 bg-white/5'
                )}
              >
                <span className="w-5 text-center font-display text-sm font-black text-white/50">{i + 1}</span>
                <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <span className={cn('flex-1 truncate text-sm font-bold', p.id === user.id && 'text-gold')}>
                  {p.name}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-white/50">
                  {i === 0 ? t('roles.president') : isTrou ? t('roles.trou') : ''}
                </span>
              </div>
            )
          })}
        </div>

        {!isSoft && <p className="text-sm font-bold text-amber-200">{t('trouDrinks')}</p>}

        <div className="flex w-full max-w-sm flex-col gap-2">
          <Button
            onClick={() => void voteRematch()}
            disabled={iVotedRematch && humanCount > 1}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-800 to-amber-600 py-5 text-base font-bold"
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

  // ── Interlude (fin de manche) ────────────────────────────────────────────
  if (view.phase === 'interlude') {
    const ranking = view.lastRanking ?? []
    return (
      <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-white sm:mx-auto sm:w-full sm:max-w-lg">
        <h2 className="font-display text-2xl font-bold text-gold">
          {t('mancheEnd', { n: view.manche + 1 })}
        </h2>
        <div className="w-full max-w-sm space-y-1.5">
          {ranking.map((id, i) => {
            const p = view.players.find((x) => x.id === id)
            if (!p) return null
            const isTrou = i === ranking.length - 1
            return (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2',
                  i === 0 ? 'border-gold/50 bg-gold/10' : isTrou ? 'border-suit-red/40 bg-suit-red/10' : 'border-white/10 bg-white/5'
                )}
              >
                <span className="w-5 text-center font-display text-sm font-black text-white/50">{i + 1}</span>
                <span aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
                <span className={cn('flex-1 truncate text-sm font-bold', p.id === user.id && 'text-gold')}>
                  {p.name}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-white/50">
                  {i === 0 ? t('roles.president') : isTrou ? t('roles.trou') : ''}
                </span>
              </div>
            )
          })}
        </div>
        <p className="max-w-xs text-center text-xs font-semibold text-white/50">{t('exchangeInfo')}</p>
        {!isSoft && <p className="text-sm font-bold text-amber-200">{t('trouDrinks')}</p>}
        <Button
          onClick={() => void sendAction({ action: 'continue' })}
          disabled={busy}
          className="w-full max-w-sm rounded-2xl bg-gradient-to-r from-emerald-800 to-amber-600 py-4 text-sm font-bold"
        >
          {t('nextManche')}
          {timeLeftMs !== null && ` (${Math.max(0, Math.ceil(timeLeftMs / 1000))}s)`}
        </Button>
      </div>
      <AnimatePresence>
        {tutorial.open && <GameTutorialModal gameId="president" onClose={tutorial.close} />}
      </AnimatePresence>
      </>
    )
  }

  // ── Manche en cours ──────────────────────────────────────────────────────
  const exchange = view.lastExchange
  const iSeeExchange = exchange && (exchange.fromTrou.length > 0 || exchange.fromPresident.length > 0)

  return (
    <>
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      {/* Bandeau */}
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white/80">
            {t('manche', { n: view.manche + 1, total: view.totalManches })}
          </span>
          <span className="flex items-center gap-2">
            <span className={cn('text-xs font-bold', myTurn ? 'text-gold' : 'text-white/60')}>
              {myTurn ? t('yourTurn') : t('turnOf', { name: nameOf(view.currentTurnId) })}
            </span>
            <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
          </span>
        </div>
        {timeLeftMs !== null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full rounded-full transition-[width] duration-500 ease-linear', timeLeftMs < 8_000 ? 'bg-suit-red' : 'bg-gold')}
              style={{ width: `${Math.min(100, (timeLeftMs / PRE_TURN_MS) * 100)}%` }}
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

      {/* Échange (visible seulement du Président et du Trou) */}
      {iSeeExchange && exchange && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {user.id === exchange.trouId
            ? t('exchangeAsTrou', { cards: exchange.fromPresident.map((card) => `${PRE_RANKS[preRankOf(card)]}${PRE_SUITS[preSuitOf(card)]}`).join(' ') })
            : t('exchangeAsPresident', { cards: exchange.fromTrou.map((card) => `${PRE_RANKS[preRankOf(card)]}${PRE_SUITS[preSuitOf(card)]}`).join(' ') })}
        </div>
      )}

      {/* Joueurs */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {view.players.map((p) => {
          const outIdx = view.outOrder.indexOf(p.id)
          return (
            <span
              key={p.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                view.currentTurnId === p.id
                  ? 'border-gold/60 bg-gold/15 text-gold'
                  : outIdx !== -1
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
                    : 'border-white/10 bg-white/5 text-white/70'
              )}
            >
              <PlayerAvatarGlyph value={iconOf(p)} />
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              {p.role === 'president' && <span aria-hidden>👑</span>}
              {p.role === 'trou' && <span aria-hidden>🕳️</span>}
              <span className="tabular-nums text-white/50">
                {outIdx !== -1 ? `#${outIdx + 1}` : p.handCount}
              </span>
            </span>
          )
        })}
      </div>

      {/* Tapis : dernier combo posé */}
      <div className="flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        {view.lastPlay ? (
          <>
            <div className="flex gap-1.5">
              {view.lastPlay.cards.map((card) => (
                <CardFace key={card} card={card} />
              ))}
            </div>
            <p className="text-[11px] font-semibold text-white/50">
              {t('lastPlayBy', { name: nameOf(view.lastPlay.playerId) })}
            </p>
          </>
        ) : (
          <p className="text-sm font-bold text-white/50">{t('freeTrick')}</p>
        )}
      </div>

      {/* Ma main */}
      {iAmOut ? (
        <p className="text-center text-sm font-bold text-emerald-200">
          {t('out', { rank: myOutRank })}
        </p>
      ) : (
        <>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 py-4">
            {view.myHand.map((card) => (
              <CardFace
                key={card}
                card={card}
                raised={selected.includes(card)}
                onClick={() => toggleCard(card)}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                void sendAction({ action: 'play', cards: selected })
                setSelected([])
              }}
              disabled={!canPlaySelection || busy}
              className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-800 to-amber-600 py-5 text-base font-black disabled:opacity-50"
            >
              {t('play', { count: selected.length })}
            </Button>
            <Button
              onClick={() => void sendAction({ action: 'pass' })}
              disabled={!myTurn || !view.lastPlay || busy}
              variant="outline"
              className="flex-1 rounded-2xl border-white/15 bg-white/5 py-5 text-base font-bold text-white/80 hover:bg-white/10 disabled:opacity-50"
            >
              {t('pass')}
            </Button>
          </div>
          {myTurn && !view.lastPlay && (
            <p className="text-center text-[11px] font-semibold text-white/40">{t('leadHint')}</p>
          )}
        </>
      )}
    </div>
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="president" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
