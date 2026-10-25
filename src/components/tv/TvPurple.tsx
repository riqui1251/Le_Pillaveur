"use client"

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import type { TvRoomDto } from '@/lib/online-room'
import type { PurpleSyncedState, SerializedCard } from '@/lib/online-game-state'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { TvAvatar } from './tv-shared'
import { serverNow } from '@/hooks/server-clock'

/**
 * Purple sur grand écran. La vue spectateur porte le paquet entier (ordre
 * compris) : seul son NOMBRE de cartes s'affiche, jamais son contenu. Les
 * cartes tirées apparaissent quand l'état les publie, comme sur les
 * téléphones ; le retournement ne fait que les montrer un peu plus tard.
 */

/** Même seuil que le téléphone : avertissement 1 min avant l'expulsion AFK. */
const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

type BetType = 'rouge' | 'double-rouge' | 'noir' | 'double-noir' | 'purple' | 'double-purple'

const BET_META: Record<BetType, { gulps: number; labelKey: string; emoji: string }> = {
  'rouge':         { gulps: 1, labelKey: 'rouge',        emoji: '🔴' },
  'double-rouge':  { gulps: 2, labelKey: 'doubleRouge',  emoji: '🔴🔴' },
  'noir':          { gulps: 1, labelKey: 'noir',         emoji: '⚫' },
  'double-noir':   { gulps: 2, labelKey: 'doubleNoir',   emoji: '⚫⚫' },
  'purple':        { gulps: 2, labelKey: 'purple',       emoji: '🟣' },
  'double-purple': { gulps: 4, labelKey: 'doublePurple', emoji: '🟣🟣' },
}

const BET_TILE: Record<BetType, string> = {
  'rouge':         'from-red-600 to-red-800 border-red-400/40',
  'double-rouge':  'from-red-500 to-rose-700 border-red-300/40',
  'noir':          'from-zinc-700 to-zinc-900 border-zinc-400/40',
  'double-noir':   'from-zinc-600 to-neutral-900 border-zinc-300/40',
  'purple':        'from-violet-600 to-purple-800 border-violet-400/40',
  'double-purple': 'from-violet-500 to-fuchsia-800 border-violet-300/40',
}

const BET_TYPES: BetType[] = ['rouge', 'double-rouge', 'noir', 'double-noir', 'purple', 'double-purple']

function betMeta(bet: string | null) {
  return bet && bet in BET_META ? BET_META[bet as BetType] : null
}

/** Taille du nom au tour : un nom long descend d'un cran au lieu d'être tronqué. */
function nameSizeClass(name: string): string {
  if (name.length <= 8) return 'text-6xl'
  if (name.length <= 12) return 'text-5xl'
  return 'text-4xl'
}

function TvCard({ card, size }: { card: SerializedCard; size: 'lg' | 'sm' }) {
  const isRed = card.color === 'red'
  const ink = isRed ? 'text-red-600' : 'text-[#24201A]'
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-center justify-center rounded-2xl bg-white shadow-xl',
        size === 'lg' ? 'h-36 w-24 border-[0.2rem]' : 'h-20 w-14 rounded-xl border-2',
        isRed ? 'border-red-400' : 'border-gray-800'
      )}
    >
      <span className={cn('font-black leading-none', size === 'lg' ? 'text-5xl' : 'text-2xl', ink)}>{card.value}</span>
      <span className={cn('leading-tight', size === 'lg' ? 'text-5xl' : 'text-2xl', ink)}>{card.suit}</span>
    </div>
  )
}

export function TvPurple({ room, state }: { room: TvRoomDto; state: PurpleSyncedState }) {
  const t = useTranslations('games.purple')
  const tCommon = useTranslations('common')
  const tv = useTranslations('tv')
  const reduced = useReducedMotion()

  // Même détection que le téléphone : le serveur reboucle le paquet épuisé,
  // le nombre de cartes restantes REMONTE.
  const deckLen = Array.isArray(state.deck) ? state.deck.length : null
  // La détection n'émet qu'un jeton : la minuterie vit dans son propre effet,
  // sinon un nouveau tirage dans les 4 s l'annulait et le flash restait affiché.
  const prevDeckLenRef = useRef<number | null>(null)
  const [flashKey, setFlashKey] = useState(0)
  useEffect(() => {
    if (deckLen === null) return
    const prev = prevDeckLenRef.current
    prevDeckLenRef.current = deckLen
    if (prev !== null && deckLen > prev) setFlashKey((k) => k + 1)
  }, [deckLen])
  const [newDeckFlash, setNewDeckFlash] = useState(false)
  useEffect(() => {
    if (flashKey === 0) return
    setNewDeckFlash(true)
    const timer = setTimeout(() => setNewDeckFlash(false), 4000)
    return () => clearTimeout(timer)
  }, [flashKey])

  // Avertissement AFK public des téléphones, recalculé ici sans réseau : même
  // départ (chaque nouvelle version d'état) et mêmes conditions qu'afkWatchable.
  const afkTarget = state.phase !== 'finished' ? state.players[state.currentPlayer] : undefined
  const afkWatchable = Boolean(
    afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      state.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  const [afkEndsAt, setAfkEndsAt] = useState<number | null>(null)
  useEffect(() => {
    setAfkEndsAt(null)
    if (!afkWatchable) return
    const turnStartedAt = serverNow()
    const timer = setTimeout(() => setAfkEndsAt(turnStartedAt + ONLINE_REPLACE_GRACE_MS), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [room.stateVersion, afkWatchable])

  const iconOf = (userId: string) => {
    const player = state.players.find((p) => p.id === userId)
    if (player?.isBot) return botAvatarFromName(player.name)
    return room.members.find((m) => m.userId === userId)?.preferences?.icon ?? '👤'
  }
  const sipsOf = (userId: string) => state.gameResults?.[userId] ?? 0

  if (state.phase === 'finished') {
    const ranking = [...state.players].sort((a, b) => sipsOf(b.id) - sipsOf(a.id))
    const n = ranking.length
    const cols = n <= 4 ? 1 : n <= 8 ? 2 : n <= 12 ? 3 : 4
    const rows = Math.ceil(n / cols)
    const counter = rematchCounter(room.members, state.rematchVotes ?? [], null)
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-6 px-10 py-6">
        <div className="flex shrink-0 flex-col items-center gap-2 text-center">
          <p className="text-6xl font-black text-gold">
            <span aria-hidden>🟣 </span>
            {t('online.finishedTitle')}
          </p>
          <p className="text-2xl font-semibold text-white/80">{t('online.totalCards', { count: state.totalCardsDrawn ?? 0 })}</p>
        </div>
        <p className="shrink-0 text-base font-bold uppercase tracking-[0.3em] text-gold/90">
          <span aria-hidden>🍺 </span>
          {tv('drinks')}
        </p>
        <div
          className={cn('grid min-h-0 flex-1 content-center gap-3', cols === 1 ? 'w-[40rem]' : 'w-full')}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 4.5rem))`,
          }}
        >
          {ranking.map((p) => (
            <div
              key={p.id}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4"
            >
              <span className="shrink-0 text-3xl" aria-hidden><PlayerAvatarGlyph value={iconOf(p.id)} /></span>
              <span className="min-w-0 flex-1 truncate text-2xl font-bold text-white">{p.name}</span>
              <span className="shrink-0 text-3xl font-black tabular-nums text-amber-300">{sipsOf(p.id)}</span>
            </div>
          ))}
        </div>
        {counter.total > 1 && counter.count > 0 && (
          <p className="shrink-0 text-2xl font-bold text-gold">
            {tv('rematchPending')} {t('online.rematchWaiting', { count: counter.count, total: counter.total })}
          </p>
        )}
      </div>
    )
  }

  const currentIdx = state.currentPlayer
  const currentActor = state.players[currentIdx]
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)
  const drawn = state.drawnCards ?? []
  const history = state.cardHistory ?? []
  const lastBet = betMeta(state.lastBet)
  const actorName = currentActor?.name ?? ''

  const n = state.players.length
  const twoCols = n > 8
  const rows = twoCols ? Math.ceil(n / 2) : n

  return (
    <div className="flex h-full min-h-0 w-full gap-6 p-6">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
        {currentActor && (
          <div className="relative flex shrink-0 items-center gap-4 rounded-3xl border border-violet-400/30 bg-violet-500/10 py-2 pl-5 pr-2">
            <span className="shrink-0 text-5xl leading-none" aria-hidden><PlayerAvatarGlyph value={iconOf(currentActor.id)} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold uppercase tracking-[0.2em] text-white/80">{t('yourTurn')}</p>
              <p className={cn('truncate font-black leading-tight text-white', nameSizeClass(currentActor.name))}>
                {currentActor.name}
              </p>
            </div>
            <div
              className={cn(
                'flex w-[10.5rem] shrink-0 flex-col items-center rounded-2xl border px-3 py-2 text-center',
                newDeckFlash ? 'border-violet-200 bg-violet-500/40' : 'border-violet-400/30 bg-violet-500/20'
              )}
            >
              <p className="max-w-full truncate text-base font-bold uppercase tracking-[0.2em] text-violet-200">{t('counter')}</p>
              <p className="text-5xl font-black leading-none tabular-nums text-violet-300">
                {state.drinkCounter}
                <span className="ml-1 text-3xl" aria-hidden>🍺</span>
              </p>
              {deckLen !== null && (
                <p className="max-w-full truncate text-lg font-semibold text-white/80">{t('cardsLeft', { count: deckLen })}</p>
              )}
            </div>
            {/* À cheval sur le bord haut (dans la marge p-6) : le flash ne décale ni le nom ni le jeu. */}
            {newDeckFlash && (
              <p className="absolute -top-[1.125rem] right-2 whitespace-nowrap rounded-full border border-violet-200 bg-violet-700 px-4 py-0.5 text-lg font-bold text-white shadow-lg">
                {t('newDeck')}
              </p>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
          {drawn.length > 0 ? (
            <>
              <div className="flex items-center justify-center gap-6">
                {lastBet && state.lastBet && (
                  <div
                    className={cn(
                      'flex w-40 shrink-0 flex-col items-center gap-1 rounded-2xl border bg-gradient-to-br px-3 py-3',
                      BET_TILE[state.lastBet as BetType]
                    )}
                  >
                    <span className="text-3xl leading-none" aria-hidden>{lastBet.emoji}</span>
                    <span className="max-w-full truncate text-xl font-black text-white">
                      {t(`bets.${lastBet.labelKey}` as 'bets.rouge')}
                    </span>
                    <span className="text-lg font-semibold text-white/80">{tCommon('sipsCount', { count: lastBet.gulps })}</span>
                  </div>
                )}
                <div className="flex gap-3">
                  {drawn.map((card, i) => (
                    <motion.div
                      key={`${state.totalCardsDrawn}-${i}`}
                      initial={reduced ? false : { rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      transition={{ duration: 0.3, delay: reduced ? 0 : i * 0.12 }}
                    >
                      <TvCard card={card} size="lg" />
                    </motion.div>
                  ))}
                </div>
              </div>
              {/* Le verdict attend que la dernière carte soit retournée à l'écran. */}
              <motion.div
                key={`verdict-${state.totalCardsDrawn}`}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: reduced ? 0 : (drawn.length - 1) * 0.12 + 0.3 }}
              >
                {state.pendingReveal ? (
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-4xl font-black text-red-300">
                      <span aria-hidden>😬 </span>
                      {t('wrongCombo')}
                    </p>
                    <p className="text-3xl font-black text-white">{t('mustDrink', { name: actorName, count: state.amountToDrink })}</p>
                  </div>
                ) : state.isCorrect === true && state.canContinue ? (
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-4xl font-black text-emerald-300">{t('correct', { count: lastBet?.gulps ?? 0 })}</p>
                    <p className="text-2xl font-semibold text-white/80">{t('online.waitingDecision', { name: actorName })}</p>
                  </div>
                ) : null}
              </motion.div>
            </>
          ) : (
            <>
              <p className="line-clamp-2 text-4xl font-black text-white">{t('online.waitingBet', { name: actorName })}</p>
              <div className="grid w-full grid-cols-3 gap-3">
                {BET_TYPES.map((bet) => {
                  const meta = BET_META[bet]
                  return (
                    <div
                      key={bet}
                      className={cn('flex min-w-0 flex-col items-center gap-1 rounded-2xl border bg-gradient-to-br px-3 py-2', BET_TILE[bet])}
                    >
                      <span className="text-3xl leading-none" aria-hidden>{meta.emoji}</span>
                      <span className="max-w-full truncate text-xl font-black leading-tight text-white">{t(`bets.${meta.labelKey}` as 'bets.rouge')}</span>
                      <span className="text-lg font-semibold leading-tight text-white/80">{tCommon('sipsCount', { count: meta.gulps })}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {history.length > 0 && (
          <div className="flex shrink-0 items-center gap-4">
            <p className="shrink-0 text-base font-bold uppercase tracking-[0.2em] text-white/70">{t('lastCards')}</p>
            <div className="flex min-w-0 gap-3 overflow-hidden">
              {history.map((card, i) => <TvCard key={i} card={card} size="sm" />)}
            </div>
          </div>
        )}
      </section>

      <aside className={cn('flex min-h-0 shrink-0 flex-col gap-3', twoCols ? 'w-[34rem]' : 'w-[26rem]')}>
        {leftPlayer?.leftAt && (
          <div className="shrink-0 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xl font-semibold leading-snug text-amber-100">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}
        {afkEndsAt !== null && afkTarget && (
          <div className="shrink-0 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-xl font-semibold leading-snug text-red-100">
            <PhaseCountdown endsAt={afkEndsAt}>
              {({ seconds }) => t('online.afkWarning', { name: afkTarget.name, seconds })}
            </PhaseCountdown>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
          <p className="shrink-0 text-base font-bold uppercase tracking-[0.3em] text-gold/90">
            <span aria-hidden>🍺 </span>
            {tv('drinks')}
          </p>
          <div
            className={cn('grid min-h-0 flex-1 grid-flow-col content-center gap-x-3 gap-y-2', twoCols ? 'grid-cols-2' : 'grid-cols-1')}
            style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 4rem))` }}
          >
            {state.players.map((p, i) => {
              const active = p.id === currentActor?.id
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex min-w-0 items-center gap-3 rounded-2xl border px-3',
                    active ? 'border-gold/50 bg-gold/20' : 'border-white/10 bg-white/5'
                  )}
                >
                  <TvAvatar name={p.name} index={i} size={twoCols ? 28 : 36} />
                  <span className={cn('min-w-0 flex-1 truncate text-xl font-bold', p.leftAt ? 'text-white/60' : 'text-white')}>
                    {p.name}
                  </span>
                  <span className="shrink-0 text-xl font-black tabular-nums text-amber-300">{sipsOf(p.id)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </aside>
    </div>
  )
}
