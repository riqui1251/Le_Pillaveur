"use client"

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Dices, Hourglass } from 'lucide-react'
import type { TvRoomDto } from '@/lib/online-room'
import type { Game1220SyncedState } from '@/lib/online-game-state'
import type { Band1220 } from '@/lib/game-1220'
import { cn } from '@/lib/utils'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { rematchCounter } from '@/components/online/end-screen'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { Game1220SpeechFeed } from '@/components/online/game-1220/Game1220SpeechFeed'

/**
 * 1220 sur grand écran : jeu de paris simultané, sans tour. La vue spectateur
 * porte aussi les brouillons de la mise en place, que les téléphones ne
 * montrent qu'à leur auteur : la TV n'affiche que qui est prêt. En jeu, les
 * paris verrouillés et le dernier lancer sont publics ; un lancer reçu roule
 * d'abord, comme sur les téléphones.
 */

type Game1220TvState = Game1220SyncedState & { phaseEndsAt?: number | null }

type Config = NonNullable<Game1220SyncedState['configs']>[number]
type RollResult = NonNullable<Game1220SyncedState['lastRoll']>['results'][number]

/**
 * Les téléphones font rouler les dés 700 ms avant d'afficher un lancer reçu
 * (ROLL_MS de Game1220Online) : la TV tient le lancer précédent au moins
 * autant, quel que soit son réglage d'animation, pour ne pas le devancer.
 */
export const TV_1220_ROLL_MS = 700

export type Game1220RollShow = { sig: string | null; rolling: boolean }

/** Signature des lancers (celle des téléphones) en phase de jeu ; null hors de cette phase. */
export function game1220RollSig(state: Pick<Game1220SyncedState, 'phase' | 'history'>): string | null {
  return state.phase === 'play' ? (state.history ?? []).map((h) => `${h.d12}-${h.d20}`).join(',') : null
}

/** Seul un lancer arrivé en cours de jeu roule : au montage ou au retour en jeu, le dernier tel quel. */
export function game1220RollOnSig(show: Game1220RollShow, sig: string | null): Game1220RollShow {
  if (sig === show.sig) return show
  if (sig === null || show.sig === null) return { sig, rolling: false }
  return { sig, rolling: true }
}

/** Lancer affiché et lancers précédents : tant que les dés roulent, encore ceux d'avant. */
export function game1220ShownRolls<T>(
  lastRoll: T | null,
  history: readonly T[],
  rolling: boolean
): { roll: T | null; previous: T[]; previousCount: number } {
  if (!rolling) return { roll: lastRoll, previous: history.slice(1, 4), previousCount: history.length - 1 }
  return { roll: history[1] ?? null, previous: history.slice(2, 5), previousCount: Math.max(0, history.length - 2) }
}

function useGame1220Rolling(sig: string | null): boolean {
  const [show, setShow] = useState<Game1220RollShow>({ sig, rolling: false })
  const current = game1220RollOnSig(show, sig)
  if (current !== show) setShow(current)
  const { sig: currentSig, rolling } = current
  useEffect(() => {
    if (!rolling) return
    const timer = setTimeout(
      () => setShow((s) => (s.sig === currentSig ? { ...s, rolling: false } : s)),
      TV_1220_ROLL_MS
    )
    return () => clearTimeout(timer)
  }, [currentSig, rolling])
  return rolling
}

/** Gabarit selon le nombre de joueurs : 16 au plus doivent tenir sur la toile 80×39 rem. */
function playTier(n: number) {
  if (n <= 4) {
    return {
      cols: n === 3 ? 3 : 2,
      card: 'gap-3 px-6 py-4',
      glyph: 'text-4xl',
      name: 'text-4xl',
      chip: 'px-3 py-1 text-2xl',
      chipRow: 'gap-2',
      result: 'px-4 py-1 text-3xl',
      emoji: 'text-4xl',
      inlineResult: false,
      partialReplacesEmoji: false,
      dice: 'px-7 py-3 text-7xl',
      total: 'text-8xl',
    }
  }
  if (n <= 9) {
    return {
      cols: 3,
      card: 'gap-1 px-4 py-1.5',
      glyph: 'text-3xl',
      name: 'text-2xl',
      chip: 'px-2 text-xl',
      chipRow: 'gap-1',
      result: 'px-3 py-0.5 text-2xl',
      emoji: 'text-3xl',
      inlineResult: false,
      partialReplacesEmoji: true,
      dice: 'px-6 py-2 text-6xl',
      total: 'text-7xl',
    }
  }
  return {
    cols: 4,
    card: 'gap-1 px-2.5 py-1.5',
    glyph: 'text-2xl',
    name: 'text-xl',
    chip: 'px-1 text-lg',
    chipRow: 'gap-0.5',
    result: 'px-2 text-xl',
    emoji: 'text-3xl',
    inlineResult: true,
    partialReplacesEmoji: true,
    dice: 'px-6 py-2 text-6xl',
    total: 'text-7xl',
  }
}

function setupTier(n: number) {
  if (n <= 4) return { cols: 2, pill: 'gap-4 px-6 py-4 text-3xl', icon: 'h-9 w-9' }
  if (n <= 9) return { cols: 3, pill: 'gap-3 px-5 py-3 text-2xl', icon: 'h-8 w-8' }
  return { cols: 4, pill: 'gap-3 px-4 py-3 text-xl', icon: 'h-7 w-7' }
}

function bandOf(total: number): Band1220 | null {
  if (total >= 2 && total <= 10) return '2-10'
  if (total >= 11 && total <= 20) return '11-20'
  if (total >= 21 && total <= 30) return '21-30'
  return null
}

export function TvGame1220({ room, state }: { room: TvRoomDto; state: Game1220TvState }) {
  const t = useTranslations('games.1220')
  const tTv = useTranslations('tv')
  const format = useFormatter()
  const reduced = useReducedMotion()

  const iconOf = (userId: string) => {
    const player = state.players.find((p) => p.id === userId)
    if (player?.isBot) return botAvatarFromName(player.name)
    return room.members.find((m) => m.userId === userId)?.preferences?.icon ?? '👤'
  }
  const parityLabel = (even: boolean) => (even ? t('pair') : t('impair'))
  const lastRoll = state.lastRoll
  const rolling = useGame1220Rolling(game1220RollSig(state))

  if (state.phase === 'finished') {
    const counter = rematchCounter(room.members, state.rematchVotes ?? [], null)
    const total = lastRoll ? lastRoll.d12 + lastRoll.d20 : null
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-8 text-center">
        <Dices aria-hidden className="h-24 w-24 text-teal-300" />
        <p className="font-display text-7xl font-bold text-gold">{t('online.finishedTitle')}</p>
        <p className="text-3xl font-semibold text-white/80">{t('online.totalRolls', { count: state.rollCount ?? state.history.length })}</p>
        {lastRoll && total !== null && (
          <div className="flex items-center gap-4 text-4xl font-black tabular-nums">
            <span className="rounded-2xl border-2 border-amber-300/60 bg-amber-500/20 px-5 py-2 text-amber-100">{lastRoll.d12}</span>
            <span className="text-white/70">+</span>
            <span className="rounded-2xl border-2 border-teal-300/60 bg-teal-500/20 px-5 py-2 text-teal-100">{lastRoll.d20}</span>
            <span className="text-white/70">=</span>
            <span className="text-5xl text-white">{total}</span>
          </div>
        )}
        {counter.total > 1 && counter.count > 0 && (
          <p className="rounded-full border-2 border-gold/50 bg-gold/10 px-8 py-3 text-2xl font-bold text-gold">
            {tTv('rematchPending')} {counter.count}/{counter.total}
          </p>
        )}
      </div>
    )
  }

  if (state.phase === 'setup') {
    const tier = setupTier(state.players.length)
    const readyCount = state.players.filter((p) => state.setupReady.includes(p.id)).length
    const endsAt = state.phaseEndsAt ?? null
    return (
      <div className="flex h-full min-h-0 w-full flex-col justify-center gap-5 px-8 py-5">
        <div className="flex w-full items-center justify-between gap-8">
          <p className="min-w-0 text-4xl font-black leading-tight text-cream">{t('online.waitingSetup')}</p>
          <p className="flex shrink-0 items-center gap-3 text-5xl font-black tabular-nums text-gold">
            <Check aria-hidden className="h-10 w-10" />
            {readyCount}/{state.players.length}
          </p>
        </div>
        {endsAt !== null && (
          <div className="rounded-2xl border-2 border-amber-300/50 bg-amber-500/10 px-6 py-3 text-center text-2xl font-semibold text-amber-100">
            <PhaseCountdown endsAt={endsAt}>{({ seconds }) => t('online.setupDeadline', { seconds })}</PhaseCountdown>
          </div>
        )}
        <div className="grid w-full gap-3" style={{ gridTemplateColumns: `repeat(${tier.cols}, minmax(0, 1fr))` }}>
          {state.players.map((p) => {
            const ready = state.setupReady.includes(p.id)
            return (
              <div
                key={p.id}
                className={cn(
                  'flex min-w-0 items-center rounded-2xl border-2 font-bold',
                  tier.pill,
                  ready ? 'border-teal-300/60 bg-teal-500/20 text-white' : 'border-white/20 bg-white/5 text-white/80'
                )}
              >
                <span className="shrink-0" aria-hidden>
                  <PlayerAvatarGlyph value={iconOf(p.id)} />
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {ready ? (
                  <Check aria-label={tTv('ready')} className={cn('shrink-0 text-teal-200', tier.icon)} />
                ) : (
                  <Hourglass aria-label={tTv('notReady')} className={cn('shrink-0 text-white/70', tier.icon)} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const configs = state.configs ?? []
  const tier = playTier(configs.length)
  const rows = Math.max(1, Math.ceil(configs.length / tier.cols))
  // Trois lancers précédents : au-delà, le bandeau grandit et serre la grille des 16 joueurs.
  const { roll: shownRoll, previous, previousCount } = game1220ShownRolls(lastRoll, state.history, rolling)
  const total = shownRoll ? shownRoll.d12 + shownRoll.d20 : null
  const totalBand = total !== null ? bandOf(total) : null
  const leftPlayer = state.players.find((p) => !p.isBot && p.leftAt)

  // Emojis porteurs de sens (boit, donne, ⚡) en text-3xl minimum, le texte garde sa taille de gabarit.
  const emoji = (e: string) => (
    <span aria-hidden className={cn('leading-none', tier.emoji)}>
      {e}
    </span>
  )

  const resultBadges = (r: RollResult | undefined) => {
    if (!r || (r.drinkSips === 0 && r.giveReasons.length === 0)) return null
    const badge = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border-2 leading-none text-white'
    return (
      <div className="flex shrink-0 items-center gap-2 font-black">
        {r.drinkSips > 0 && (
          <span className={cn(badge, 'border-teal-200 bg-teal-500/40', tier.result)} aria-label={tTv('drinkVerb')}>
            {emoji('🍺')}
            {!tier.inlineResult && <span>{tTv('drinkVerb')}</span>}
          </span>
        )}
        {r.giveReasons.length > 0 && (
          <span className={cn(badge, 'border-gold bg-gold/25', tier.result)}>
            {emoji('🎁')}
            <span>
              {!tier.inlineResult && `${tTv('giveVerb')} `}
              {format.number(r.giveEffective)}
            </span>
          </span>
        )}
      </div>
    )
  }

  const card = (cfg: Config) => {
    const r = shownRoll?.results.find((x) => x.playerId === cfg.playerId)
    const reasons = r?.giveReasons ?? []
    const partial = r?.partialNumbers ?? []
    const drinks = Boolean(r && r.drinkSips > 0)
    const gives = reasons.length > 0
    // Chiffre sorti sur un seul dé : ⚡ comme sur le téléphone. Sur 3 et 4 colonnes
    // il remplace l'emoji (la couleur garde le sens) : quatre pastilles doivent
    // tenir sur une ligne, sinon la carte déborde de sa rangée.
    const chip = (hit: boolean, base: string, on: string, icon: string, label: string | number, isPartial = false) => (
      <span
        className={cn(
          'inline-flex items-center gap-0.5 whitespace-nowrap rounded-lg border-2 font-bold leading-none',
          tier.chip,
          hit ? on : base,
          isPartial && 'border-dashed border-gold/80'
        )}
      >
        {isPartial && emoji('⚡')}
        {icon && !(isPartial && tier.partialReplacesEmoji) && emoji(icon)}
        <span>{label}</span>
      </span>
    )
    return (
      <div
        key={cfg.playerId}
        className={cn(
          'flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-2xl border-2',
          tier.card,
          gives ? 'border-gold/70 bg-gold/10' : drinks ? 'border-teal-300/70 bg-teal-500/10' : 'border-white/10 bg-black/20'
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('shrink-0 leading-none', tier.glyph)} aria-hidden>
            <PlayerAvatarGlyph value={iconOf(cfg.playerId)} />
          </span>
          <span className={cn('min-w-0 flex-1 truncate font-bold leading-tight text-white', tier.name)}>{cfg.name}</span>
          {tier.inlineResult && resultBadges(r)}
        </div>
        <div className={cn('flex min-w-0 flex-wrap', tier.chipRow)}>
          {chip(reasons.includes('parity'), 'border-white/20 bg-white/5 text-white/80', 'border-gold bg-gold/25 text-white', '', parityLabel(cfg.parity === 'pair'))}
          {chip(reasons.includes('band'), 'border-white/20 bg-white/5 text-white/80', 'border-gold bg-gold/25 text-white', '', t(`bands.${cfg.band}`))}
          {chip(
            drinks,
            'border-teal-300/40 bg-teal-500/10 text-teal-100',
            'border-teal-200 bg-teal-500/40 text-white',
            '🍺',
            cfg.drinkNumber,
            partial.includes(cfg.drinkNumber)
          )}
          {chip(
            reasons.includes('giveNum'),
            'border-amber-300/40 bg-amber-500/10 text-amber-100',
            'border-gold bg-gold/25 text-white',
            '🎁',
            cfg.giveNumber,
            partial.includes(cfg.giveNumber)
          )}
        </div>
        {!tier.inlineResult && resultBadges(r)}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 p-4">
      <div className="flex shrink-0 items-center gap-8 rounded-3xl border-2 border-white/10 bg-black/20 px-8 py-3">
        {rolling ? (
          <div className="flex min-w-0 items-center gap-5 py-2">
            <Dices aria-hidden className={cn('h-16 w-16 shrink-0 text-gold', !reduced && 'animate-spin')} />
            <p className="text-4xl font-black text-cream">{t('rolling')}</p>
          </div>
        ) : shownRoll && total !== null ? (
          <motion.div
            // Le moteur garde 15 lancers : passé ce cap, la longueur ne bouge plus, le contenu si.
            key={state.history.map((h) => `${h.d12}-${h.d20}`).join('|')}
            initial={reduced ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex shrink-0 items-center gap-5 font-black tabular-nums"
          >
            <span className={cn('rounded-2xl border-2 border-amber-300/60 bg-amber-500/20 leading-none text-amber-100', tier.dice)}>{shownRoll.d12}</span>
            <span className="text-5xl text-white/70">+</span>
            <span className={cn('rounded-2xl border-2 border-teal-300/60 bg-teal-500/20 leading-none text-teal-100', tier.dice)}>{shownRoll.d20}</span>
            <span className="text-5xl text-white/70">=</span>
            <span className={cn('leading-none text-white', tier.total)}>{total}</span>
            <span className="ml-2 flex flex-col gap-1 text-2xl font-bold text-gold">
              <span>{parityLabel(total % 2 === 0)}</span>
              {totalBand && <span>{t(`bands.${totalBand}`)}</span>}
            </span>
          </motion.div>
        ) : (
          <div className="flex min-w-0 items-center gap-5 py-2">
            <Dices aria-hidden className="h-16 w-16 shrink-0 text-gold" />
            <p className="text-4xl font-black text-cream">{t('online.anyoneRolls')}</p>
          </div>
        )}

        {/* Réactions des bots au lancer affiché, entre les dés et l'historique :
            celles du précédent tant que les dés roulent, comme les téléphones. */}
        <div className="flex max-h-[7rem] min-w-0 flex-1 flex-col justify-end self-stretch overflow-hidden">
          <Game1220SpeechFeed
            view={state}
            roll={(state.rollCount ?? state.history.length) - (rolling ? 1 : 0)}
            iconOf={(p) => iconOf(p.id)}
            variant="tv"
          />
        </div>

        <div className="ml-auto flex min-w-0 flex-col items-end gap-1.5 text-right">
          {previous.length > 0 && (
            <>
              <p className="text-base font-semibold uppercase tracking-widest text-white/70">
                {t('history', { count: previousCount })}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                {previous.map((h, i) => (
                  <span key={previousCount - i} className="rounded-lg border-2 border-white/20 bg-white/5 px-2 text-lg font-bold tabular-nums text-white/80">
                    <span className="text-amber-200">{h.d12}</span> + <span className="text-teal-200">{h.d20}</span> ={' '}
                    <span className="text-white">{h.d12 + h.d20}</span>
                  </span>
                ))}
              </div>
            </>
          )}
          {lastRoll && <p className="text-lg text-white/70">{t('online.anyoneRolls')}</p>}
        </div>
      </div>

      {leftPlayer?.leftAt && (
        <p className="shrink-0 truncate rounded-2xl border-2 border-amber-300/50 bg-amber-500/10 px-6 py-0.5 text-center text-xl font-semibold text-amber-100">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </p>
      )}

      <div
        className={cn('grid min-h-0 flex-1 gap-2 transition-opacity', rolling && 'opacity-50')}
        style={{
          gridTemplateColumns: `repeat(${tier.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {configs.map(card)}
      </div>
    </div>
  )
}
