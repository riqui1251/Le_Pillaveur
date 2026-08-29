"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, RefreshCw, X } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { GameOnlineLobby } from './GameOnlineLobby'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parsePurpleState, type PurpleSyncedState, type SerializedCard } from '@/lib/online-game-state'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'

/** Purple en ligne : jeu tour par tour, cagnotte « patate chaude ». Aucune
 * info cachée (tirage public dès qu'il a lieu). */

type BetType = 'rouge' | 'double-rouge' | 'noir' | 'double-noir' | 'purple' | 'double-purple'

const BET_META: Record<BetType, { cards: number; gulps: number; labelKey: string; emoji: string }> = {
  'rouge':         { cards: 1, gulps: 1, labelKey: 'rouge',        emoji: '🔴' },
  'double-rouge':  { cards: 2, gulps: 2, labelKey: 'doubleRouge',  emoji: '🔴🔴' },
  'noir':          { cards: 1, gulps: 1, labelKey: 'noir',         emoji: '⚫' },
  'double-noir':   { cards: 2, gulps: 2, labelKey: 'doubleNoir',   emoji: '⚫⚫' },
  'purple':        { cards: 2, gulps: 2, labelKey: 'purple',       emoji: '🟣' },
  'double-purple': { cards: 4, gulps: 4, labelKey: 'doublePurple', emoji: '🟣🟣' },
}

const BET_STYLE: Record<BetType, { from: string; to: string; border: string }> = {
  'rouge':         { from: 'from-red-600',    to: 'to-red-800',     border: 'border-red-500/40' },
  'double-rouge':  { from: 'from-red-500',    to: 'to-rose-700',    border: 'border-red-400/40' },
  'noir':          { from: 'from-zinc-700',   to: 'to-zinc-900',    border: 'border-zinc-500/40' },
  'double-noir':   { from: 'from-zinc-600',   to: 'to-neutral-900', border: 'border-zinc-400/40' },
  'purple':        { from: 'from-violet-600', to: 'to-purple-800',  border: 'border-violet-500/40' },
  'double-purple': { from: 'from-violet-500', to: 'to-fuchsia-800', border: 'border-violet-400/40' },
}

const BET_TYPES: BetType[] = ['rouge', 'double-rouge', 'noir', 'double-noir', 'purple', 'double-purple']

function PlayingCardUI({ card, size = 'lg' }: { card: SerializedCard; size?: 'sm' | 'lg' }) {
  const isRed = card.color === 'red'
  if (size === 'sm') {
    return (
      <div className="flex h-14 w-10 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-white/20 bg-white shadow-md">
        <span className={cn('text-xs font-extrabold leading-none', isRed ? 'text-red-600' : 'text-[#24201A]')}>{card.value}</span>
        <span className={cn('text-sm leading-none', isRed ? 'text-red-600' : 'text-[#24201A]')}>{card.suit}</span>
      </div>
    )
  }
  return (
    <div className={cn(
      'flex h-32 w-20 sm:h-36 sm:w-24 flex-col items-center justify-center rounded-2xl border-2 bg-white shadow-xl',
      isRed ? 'border-red-400' : 'border-gray-800',
    )}>
      <span className={cn('text-3xl sm:text-4xl font-extrabold', isRed ? 'text-red-600' : 'text-[#24201A]')}>{card.value}</span>
      <span className={cn('text-2xl sm:text-3xl leading-tight', isRed ? 'text-red-600' : 'text-[#24201A]')}>{card.suit}</span>
    </div>
  )
}

export function PurpleOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.purple')
  const tCommon = useTranslations('common')
  const [busy, setBusy] = useState(false)

  const inGame = room?.gameId === 'purple' && room.status === 'playing'
  const tutorial = useGameTutorial('purple', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo<PurpleSyncedState | null>(
    () => (inGame ? parsePurpleState(room?.gameStateJson) : null),
    [inGame, room?.gameStateJson]
  )

  // Flash « nouveau paquet mélangé » : le serveur reboucle le paquet quand il
  // est épuisé — détecté ici quand le nombre de cartes restantes REMONTE.
  const prevDeckLenRef = useRef<number | null>(null)
  const [newDeckFlash, setNewDeckFlash] = useState(false)
  const deckLen = view?.deck.length ?? null
  useEffect(() => {
    if (deckLen === null) return
    const prev = prevDeckLenRef.current
    prevDeckLenRef.current = deckLen
    if (prev !== null && deckLen > prev) {
      setNewDeckFlash(true)
      const timer = setTimeout(() => setNewDeckFlash(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [deckLen])

  // Ticks « arbitre » (premier humain présent) : tour d'un bot → un coup ;
  // joueur parti depuis 3 min → remplacement. expectedVersion rend les ticks
  // concurrents inoffensifs (le serveur revalide tout).
  useEffect(() => {
    if (!view || !user || !room || view.phase === 'finished') return
    const referee = view.players.find((p) => !p.isBot && !p.leftAt)
    if (referee?.id !== user.id) return
    const expectedVersion = room.stateVersion
    const send = (action: 'bot' | 'replace-left') => {
      void fetch(`/api/online/rooms/${room.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, expectedVersion }),
      })
    }

    let botTimer: ReturnType<typeof setTimeout> | undefined
    const active = view.players[view.currentPlayer]
    if (active?.isBot) {
      botTimer = setTimeout(() => send('bot'), view.pendingReveal || view.canContinue ? 1600 : 1300)
    }

    let replaceTimer: ReturnType<typeof setInterval> | undefined
    if (view.players.some((p) => !p.isBot && p.leftAt)) {
      const check = () => {
        const expired = view.players.some(
          (p) => !p.isBot && p.leftAt && Date.now() - p.leftAt >= ONLINE_REPLACE_GRACE_MS
        )
        if (expired) send('replace-left')
      }
      check()
      replaceTimer = setInterval(check, 5000)
    }

    return () => {
      if (botTimer) clearTimeout(botTimer)
      if (replaceTimer) clearInterval(replaceTimer)
    }
  }, [view, user, room])

  const [clock, setClock] = useState(() => Date.now())
  const someoneLeft = Boolean(view?.players.some((p) => !p.isBot && p.leftAt)) && view?.phase !== 'finished'
  useEffect(() => {
    if (!someoneLeft) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [someoneLeft])

  if (!inGame) {
    return <GameOnlineLobby gameId="purple" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-white/60">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      </div>
    )
  }

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

  const iconOf = (p: { id: string; isBot: boolean }) =>
    p.isBot ? '🤖' : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const finished = view.phase === 'finished'
  const rematchVotes = view.rematchVotes ?? []
  const iVotedRematch = rematchVotes.includes(user.id)
  const humanCount = view.players.filter((p) => !p.isBot).length
  const currentActor = view.players[view.currentPlayer]
  const isMyTurn = currentActor?.id === user.id

  // ── Écran de fin ──────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-white">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="flex flex-col items-center gap-2 text-center"
        >
          <span className="text-5xl">🟣</span>
          <h2 className="font-display text-3xl font-bold text-gold">{t('online.finishedTitle')}</h2>
          <p className="text-sm text-white/60">{t('online.totalCards', { count: view.totalCardsDrawn })}</p>
        </motion.div>

        <div className="grid w-full max-w-sm grid-cols-1 gap-2">
          {view.players.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <RankCrest role={cosmetics.get(p.id)?.role} size="sm" />
              <span className="text-sm" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} className="min-w-0 flex-1 truncate text-xs font-semibold" />
              <span className="text-xs font-bold text-amber-300">{view.gameResults[p.id] ?? 0} 🍺</span>
            </div>
          ))}
        </div>

        <div className="flex w-full max-w-sm flex-col gap-2">
          {humanCount > 1 ? (
            <Button
              onClick={() => void voteRematch()}
              disabled={iVotedRematch}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-5 text-base font-bold hover:from-amber-400 hover:to-amber-500"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {iVotedRematch
                ? t('online.rematchWaiting', { count: rematchVotes.length, total: humanCount })
                : t('online.replay')}
            </Button>
          ) : (
            <Button
              onClick={() => void voteRematch()}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-5 text-base font-bold hover:from-amber-400 hover:to-amber-500"
            >
              <RefreshCw className="mr-2 h-4 w-4" /> {t('online.replay')}
            </Button>
          )}
          <Button
            onClick={() => void leaveRoom()}
            variant="outline"
            className="w-full rounded-2xl border-white/15 bg-white/5 py-5 text-base font-semibold text-white/80 hover:bg-white/10"
          >
            <Home className="mr-2 h-4 w-4" /> {t('online.backToMenu')}
          </Button>
        </div>
      </div>
    )
  }

  // ── Phase play ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col gap-3 p-3 pb-6 text-white sm:mx-auto sm:w-full sm:max-w-lg">
      <div className="flex justify-end">
        <TutorialReopenButton onClick={tutorial.reopen} className="h-7 w-7" />
      </div>
      {tutorial.open && <GameTutorialModal gameId="purple" onClose={tutorial.close} />}

      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          {t('online.waitingReturn', {
            name: leftPlayer.name,
            seconds: Math.max(0, Math.ceil((leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS - clock) / 1000)),
          })}
        </div>
      )}

      {/* ── Joueur actif ─────────────────────────────────────────────── */}
      {currentActor && (
        <div className="flex items-center gap-3 rounded-2xl border border-gold/15 bg-felt-deep/70 p-3">
          <RankCrest role={cosmetics.get(currentActor.id)?.role} />
          <span className="text-2xl" aria-hidden><PlayerAvatarGlyph value={iconOf(currentActor)} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/40">{isMyTurn ? t('online.yourTurn') : t('yourTurn')}</p>
            <OnlinePlayerName
              name={currentActor.name}
              cosmetics={cosmetics.get(currentActor.id)}
              className="truncate font-bold"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-1.5 text-center">
              <p className="text-[10px] uppercase tracking-wide text-violet-400/70">{t('counter')}</p>
              <p className="text-lg font-extrabold text-violet-300">
                {view.drinkCounter}<span className="ml-0.5 text-xs">🍺</span>
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-center">
              <p className="text-sm font-bold text-white/60">{t('cardsLeft', { count: view.deck.length })}</p>
              {newDeckFlash && (
                <p className="text-[10px] font-semibold text-violet-300">{t('newDeck')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cartes tirées ────────────────────────────────────────────── */}
      {view.drawnCards.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap justify-center gap-3">
            {view.drawnCards.map((card, i) => <PlayingCardUI key={i} card={card} />)}
          </div>
          {view.isCorrect === true && view.canContinue && (
            <div className="mt-4 space-y-3 text-center">
              <p className="font-semibold text-emerald-400">
                {t('correct', { count: view.lastBet ? BET_META[view.lastBet as BetType]?.gulps ?? 0 : 0 })}
              </p>
              {isMyTurn ? (
                <div className="flex justify-center gap-2">
                  <button
                    onClick={() => void sendAction({ action: 'continue' })}
                    disabled={busy}
                    className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-sm font-semibold text-white hover:from-amber-400 hover:to-amber-500 disabled:opacity-50"
                  >
                    {tCommon('continue')}
                  </button>
                  <button
                    onClick={() => void sendAction({ action: 'pass' })}
                    disabled={busy}
                    className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50"
                  >
                    {tCommon('pass')}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-white/40">{t('online.waitingDecision', { name: currentActor?.name ?? '' })}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Boutons de paris ─────────────────────────────────────────── */}
      {!view.canContinue && !view.pendingReveal && (
        <div className="space-y-2">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-gold/60">
            {isMyTurn ? t('chooseBet') : t('online.waitingBet', { name: currentActor?.name ?? '' })}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BET_TYPES.map((bet) => {
              const s = BET_STYLE[bet]
              const cfg = BET_META[bet]
              return (
                <button
                  key={bet}
                  onClick={() => void sendAction({ action: 'bet', bet })}
                  disabled={busy || !isMyTurn}
                  className={cn(
                    'relative overflow-hidden rounded-2xl border py-4 text-center font-semibold text-white transition-all active:scale-95 disabled:opacity-40',
                    s.border,
                  )}
                >
                  <div className={cn('absolute inset-0 bg-gradient-to-br opacity-80', s.from, s.to)} />
                  <div className="relative">
                    <p className="mb-1 text-lg leading-none">{cfg.emoji}</p>
                    <p className="text-xs font-bold">{t(`bets.${cfg.labelKey}` as 'bets.rouge')}</p>
                    <p className="text-[10px] text-white/60">{tCommon('sipsCount', { count: cfg.gulps })}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Historique des cartes ────────────────────────────────────── */}
      {view.cardHistory.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/30">{t('lastCards')}</p>
          <div className="flex flex-wrap gap-2">
            {view.cardHistory.map((card, i) => <PlayingCardUI key={i} card={card} size="sm" />)}
          </div>
        </div>
      )}

      <div className="sticky bottom-3">
        <Button
          onClick={() => void sendAction({ action: 'end' })}
          disabled={busy}
          variant="outline"
          className="w-full rounded-2xl border-white/15 bg-white/5 py-3 text-sm font-semibold text-white/70 hover:bg-white/10"
        >
          {t('online.endGame')}
        </Button>
      </div>

      {/* ── Dialog mauvaise réponse ──────────────────────────────────── */}
      <AnimatePresence>
        {view.pendingReveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          >
            <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-red-500/20 bg-[#0d0814] p-6 shadow-2xl">
              <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(ellipse at 50% 0%, #ef4444, transparent 70%)' }} />
              <div className="relative space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/15 text-3xl">
                  😬
                </div>
                <div>
                  <p className="text-lg font-extrabold text-white">{t('wrongCombo')}</p>
                  <p className="mt-1 text-sm text-white/60">
                    {t('mustDrink', { name: currentActor?.name ?? '', count: view.amountToDrink })}
                  </p>
                </div>
                {isMyTurn ? (
                  <button
                    onClick={() => void sendAction({ action: 'close-reveal' })}
                    disabled={busy}
                    className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-sm font-bold text-white hover:from-amber-400 hover:to-amber-500 disabled:opacity-50"
                  >
                    {tCommon('understoodNext')}
                  </button>
                ) : (
                  <p className="text-xs text-white/40">{t('online.waitingDecision', { name: currentActor?.name ?? '' })}</p>
                )}
              </div>
              {isMyTurn && (
                <button
                  onClick={() => void sendAction({ action: 'close-reveal' })}
                  className="absolute right-4 top-4 text-white/30 hover:text-white/60"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
