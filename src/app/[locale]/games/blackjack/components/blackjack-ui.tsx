"use client"

import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { PlayingCard as PlayingCardFace, PlayingCardBack } from '@/components/ui/PlayingCard'
import type { GameSuit } from '@/lib/games'
import {
  BJ_STAKES,
  handTotal,
  isRedSuit,
  type BjCard,
  type BjHandResult,
  type BjOutcome,
  type BjViewCard,
} from '@/lib/blackjack/engine'
import { cn } from '@/lib/utils'

/**
 * Habillage commun du Black Jack, local, en ligne et TV : mêmes cartes crème,
 * mêmes jetons de mise, même verdict par main.
 */

const SUIT_TO_GAME_SUIT: Record<BjCard['suit'], GameSuit> = { '♠': 'spade', '♥': 'heart', '♦': 'diamond', '♣': 'club' }

export type BjCardSize = 'xs' | 'sm' | 'md' | 'lg'

const CARD_SIZE: Record<BjCardSize, string> = {
  xs: 'h-11 w-8 rounded-md',
  sm: 'h-14 w-10 rounded-lg',
  md: 'h-20 w-14',
  lg: 'h-28 w-20',
}
const RANK_TEXT: Record<BjCardSize, string> = { xs: 'text-sm', sm: 'text-base', md: 'text-xl', lg: 'text-3xl' }
const SUIT_TEXT: Record<BjCardSize, string> = { xs: 'text-xs', sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' }
/** Chevauchement des cartes d'une main : on lit les coins, la main tient sur une ligne. */
const OVERLAP: Record<BjCardSize, string> = { xs: '-ml-4', sm: '-ml-6', md: '-ml-7', lg: '-ml-10' }

export function BjCardFace({ card, size = 'md' }: { card: BjViewCard; size?: BjCardSize }) {
  if (!card) return <PlayingCardBack className={cn('shrink-0', CARD_SIZE[size])} />
  const ink = isRedSuit(card.suit) ? 'text-suit-red' : 'text-[#24201A]'
  // Petites cartes en éventail : seul le bord gauche dépasse de la suivante,
  // le rang s'y lit donc en coin plutôt qu'au centre.
  const small = size === 'sm' || size === 'xs'
  return (
    <PlayingCardFace
      suit={SUIT_TO_GAME_SUIT[card.suit]}
      rank={card.rank}
      corners={!small}
      className={cn(
        'flex shrink-0 flex-col',
        small ? 'items-start justify-start pl-[3px] pt-0.5' : 'items-center justify-center',
        CARD_SIZE[size]
      )}
    >
      <span className={cn('font-display font-bold leading-none', RANK_TEXT[size], ink)}>{card.rank}</span>
      <span className={cn('leading-tight', SUIT_TEXT[size], ink)}>{card.suit}</span>
    </PlayingCardFace>
  )
}

/**
 * Total lisible : « 7/17 » tant qu'un as compte encore 11 et que la main se
 * joue, sinon le total seul (une main finie vaut son meilleur total).
 */
export function bjTotalLabel(cards: readonly BjViewCard[], final = false): string {
  const visible = cards.filter((c): c is BjCard => c !== null)
  if (visible.length === 0) return ''
  const { total, soft } = handTotal(visible)
  return soft && total < 21 && !final ? `${total - 10}/${total}` : String(total)
}

/** Une main en éventail ; chaque nouvelle carte glisse depuis le sabot. */
export function BjCardsRow({
  cards,
  size = 'md',
  className,
}: {
  cards: readonly BjViewCard[]
  size?: BjCardSize
  className?: string
}) {
  const reduced = useReducedMotion()
  return (
    <div className={cn('flex items-center', className)} style={{ perspective: 800 }}>
      {cards.map((card, i) => (
        <motion.div
          key={`${i}-${card ? card.rank + card.suit : 'back'}`}
          initial={reduced ? false : { y: -24, opacity: 0, rotateY: card ? 90 : 0 }}
          animate={{ y: 0, opacity: 1, rotateY: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className={cn(i > 0 && OVERLAP[size])}
          style={{ zIndex: i }}
        >
          <BjCardFace card={card} size={size} />
        </motion.div>
      ))}
    </div>
  )
}

/** Pastille de total, or : la seule info qu'on cherche d'un coup d'œil. */
export function BjTotalChip({
  cards,
  final = false,
  className,
}: {
  cards: readonly BjViewCard[]
  final?: boolean
  className?: string
}) {
  const label = bjTotalLabel(cards, final)
  if (!label) return null
  const over = handTotal(cards.filter((c): c is BjCard => c !== null)).total > 21
  return (
    <span
      className={cn(
        'inline-flex min-w-[2.5rem] items-center justify-center rounded-full px-2 py-0.5 font-display text-sm font-bold tabular-nums',
        over ? 'bg-suit-red text-cream' : 'bg-amber-500 text-[#24201A]',
        className
      )}
    >
      {label}
    </span>
  )
}

/** Jeton de mise, façon plaque de casino. */
export function BjStakeChip({ count, doubled = false }: { count: number; doubled?: boolean }) {
  return (
    <span
      className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full border-2 border-dashed border-[#24201A]/40 bg-amber-500 px-1.5 font-display text-sm font-bold tabular-nums text-[#24201A]"
      aria-hidden
    >
      {doubled ? count * 2 : count}
    </span>
  )
}

const OUTCOME_STYLE: Record<BjOutcome, string> = {
  blackjack: 'border-gold/60 bg-gold/20 text-gold',
  win: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200',
  push: 'border-cream/30 bg-black/20 text-cream/80',
  lose: 'border-suit-red/50 bg-suit-red/20 text-red-200',
  bust: 'border-suit-red/50 bg-suit-red/20 text-red-200',
}

/** Verdict d'une main : l'issue et ce qu'elle coûte ou rapporte. */
export function BjOutcomeBadge({ result, className }: { result: BjHandResult; className?: string }) {
  const t = useTranslations('games.blackjack')
  const detail = result.drink > 0 ? t('drink', { count: result.drink }) : result.give > 0 ? t('give', { count: result.give }) : null
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-x-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold',
        OUTCOME_STYLE[result.outcome],
        className
      )}
    >
      {t(`outcome.${result.outcome}`)}
      {detail && <span className="font-semibold">· {detail}</span>}
    </span>
  )
}

/** Choix de la mise : trois jetons, 1 à 3 gorgées. */
export function BjStakePicker({
  onPick,
  disabled,
  pendingStake,
  label,
  chipsOnly = false,
}: {
  onPick: (stake: number) => void
  disabled?: boolean
  pendingStake?: number | null
  label: string
  /** Colonne étroite (paysage) : les jetons seuls, le nombre de gorgées en aria-label. */
  chipsOnly?: boolean
}) {
  const tCommon = useTranslations('common')
  return (
    <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
      {BJ_STAKES.map((stake) => (
        <button
          key={stake}
          type="button"
          disabled={disabled}
          onClick={() => onPick(stake)}
          aria-busy={pendingStake === stake || undefined}
          aria-label={chipsOnly ? tCommon('sipsCount', { count: stake }) : undefined}
          className={cn(
            'relative flex flex-col items-center justify-center gap-1 rounded-2xl border border-gold/30 bg-black/20 px-2 py-2 text-cream transition-[transform,box-shadow] enabled:hover:ring-2 enabled:hover:ring-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep motion-safe:active:scale-95 disabled:opacity-40',
            chipsOnly ? 'min-h-[52px]' : 'min-h-[64px]',
            pendingStake === stake && 'disabled:opacity-100'
          )}
        >
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-dashed border-[#24201A]/40 bg-amber-500 font-display text-lg font-bold text-[#24201A] shadow-[0_8px_18px_-10px_rgba(217,164,65,0.8)]"
          >
            {stake}
          </span>
          {!chipsOnly && <span className="text-sm font-semibold">{tCommon('sipsCount', { count: stake })}</span>}
          {pendingStake === stake && <Loader2 aria-hidden className="absolute right-2 top-2 h-5 w-5 motion-safe:animate-spin" />}
        </button>
      ))}
    </div>
  )
}
