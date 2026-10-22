"use client"

import { useRef, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Beer, Layers, Loader2, X } from 'lucide-react'
import { PlayingCard as PlayingCardFace, PlayingCardBack } from '@/components/ui/PlayingCard'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { GameSuit } from '@/lib/games'
import { cn } from '@/lib/utils'

/**
 * Habillage commun du Purple, local et en ligne : mêmes cartes crème, mêmes
 * paris, même compteur, même verdict. Le joueur qui passe d'un mode à l'autre
 * retrouve ses repères (le « noir » était zinc en ligne, encre en local).
 */

export type PurpleBetType = 'rouge' | 'double-rouge' | 'noir' | 'double-noir' | 'purple' | 'double-purple'

/** Forme commune d'une carte : celle du jeu local et la SerializedCard en ligne. */
export type PurpleCardData = { value: string; suit: string; color: 'red' | 'black' }

type BetLabelKey = 'rouge' | 'doubleRouge' | 'noir' | 'doubleNoir' | 'purple' | 'doublePurple'

export const PURPLE_BET_META: Record<PurpleBetType, { cards: number; gulps: number; labelKey: BetLabelKey }> = {
  'rouge':         { cards: 1, gulps: 1, labelKey: 'rouge' },
  'double-rouge':  { cards: 2, gulps: 2, labelKey: 'doubleRouge' },
  'noir':          { cards: 1, gulps: 1, labelKey: 'noir' },
  'double-noir':   { cards: 2, gulps: 2, labelKey: 'doubleNoir' },
  'purple':        { cards: 2, gulps: 2, labelKey: 'purple' },
  'double-purple': { cards: 4, gulps: 4, labelKey: 'doublePurple' },
}

/** Ordre de la grille : sur deux colonnes, chaque pari simple à côté de son double. */
export const PURPLE_BET_TYPES: readonly PurpleBetType[] = [
  'rouge', 'double-rouge', 'noir', 'double-noir', 'purple', 'double-purple',
]

// Couleurs de contenu : rouge carreau, encre et violet signature du Purple.
// Crème dessus : 5,0:1 sur le rouge, 13,5:1 sur l'encre, 4,8:1 sur violet-600.
const BET_STYLE: Record<PurpleBetType, string> = {
  'rouge':         'border-suit-red/60 bg-suit-red',
  'double-rouge':  'border-suit-red/60 bg-suit-red',
  'noir':          'border-gold/20 bg-[#24201A]',
  'double-noir':   'border-gold/20 bg-[#24201A]',
  'purple':        'border-violet-400/40 bg-gradient-to-br from-violet-600 to-purple-800',
  'double-purple': 'border-violet-400/40 bg-gradient-to-br from-violet-600 to-fuchsia-800',
}

// Mini-cartes du bouton : un paquet par paire tirée. Les emojis 🔴 ⚫ 🟣
// prenaient la couleur de leur propre bouton (1,0 à 1,6:1) et « Rouge » ne se
// distinguait plus de « Double rouge » que par un filet d'un pixel.
const BET_GLYPH: Record<PurpleBetType, ReadonlyArray<ReadonlyArray<'heart' | 'spade'>>> = {
  'rouge':         [['heart']],
  'double-rouge':  [['heart', 'heart']],
  'noir':          [['spade']],
  'double-noir':   [['spade', 'spade']],
  'purple':        [['heart', 'spade']],
  'double-purple': [['heart', 'spade'], ['heart', 'spade']],
}

const SUIT_TO_GAME_SUIT: Record<string, GameSuit> = { '♠': 'spade', '♥': 'heart', '♦': 'diamond', '♣': 'club' }

export type PurpleCardSize = 'sm' | 'md' | 'lg'

const CARD_SIZE: Record<PurpleCardSize, string> = {
  sm: 'h-14 w-10 rounded-lg',
  md: 'h-24 w-16',
  lg: 'h-32 w-20 sm:h-36 sm:w-24',
}
const VALUE_TEXT: Record<PurpleCardSize, string> = { sm: 'text-xs', md: 'text-2xl', lg: 'text-3xl sm:text-4xl' }
const SUIT_TEXT: Record<PurpleCardSize, string> = { sm: 'text-sm', md: 'text-xl', lg: 'text-2xl sm:text-3xl' }

export function PurpleCard({ card, size = 'lg' }: { card: PurpleCardData; size?: PurpleCardSize }) {
  const ink = card.color === 'red' ? 'text-suit-red' : 'text-[#24201A]'
  return (
    <PlayingCardFace
      suit={SUIT_TO_GAME_SUIT[card.suit]}
      rank={card.value}
      corners={size !== 'sm'}
      className={cn('flex shrink-0 flex-col items-center justify-center', CARD_SIZE[size])}
    >
      <span className={cn('font-display font-bold leading-none', VALUE_TEXT[size], ink)}>{card.value}</span>
      <span className={cn('leading-tight', SUIT_TEXT[size], ink)}>{card.suit}</span>
    </PlayingCardFace>
  )
}

/**
 * Cartes du pari en cours. `hidden` : dos de carte (le temps du suspense en
 * local) ; à la révélation, chaque carte se retourne. `drawKey` change à
 * chaque tirage pour rejouer le retournement, et seulement là.
 */
export function PurpleDrawnCards({
  cards,
  hidden = false,
  drawKey,
}: {
  cards: readonly PurpleCardData[]
  hidden?: boolean
  drawKey: string | number
}) {
  const reduced = useReducedMotion()
  // Quatre cartes (double Purple) tiennent sur une rangée à 375 px en taille moyenne.
  const size: PurpleCardSize = cards.length > 2 ? 'md' : 'lg'
  return (
    <div className={cn('flex flex-wrap justify-center', size === 'md' ? 'gap-2' : 'gap-3')} style={{ perspective: 800 }}>
      {cards.map((card, i) =>
        hidden ? (
          <PlayingCardBack key={`back-${drawKey}-${i}`} className={cn('shrink-0', CARD_SIZE[size])} />
        ) : (
          <motion.div
            key={`face-${drawKey}-${i}`}
            initial={reduced ? false : { rotateY: 90 }}
            animate={{ rotateY: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08, ease: 'easeOut' }}
          >
            <PurpleCard card={card} size={size} />
          </motion.div>
        )
      )}
    </div>
  )
}

function BetGlyph({ bet }: { bet: PurpleBetType }) {
  return (
    <span aria-hidden className="flex h-10 items-center justify-center gap-1.5">
      {BET_GLYPH[bet].map((group, g) => {
        // Même enseigne : cartes presque superposées (on lit « deux cartes ») ;
        // enseignes mêlées : assez décalées pour voir le ♥ ET le ♠.
        const sameSuit = group.every((suit) => suit === group[0])
        return (
          <span key={g} className="flex items-center">
            {group.map((suit, i) => (
              <PlayingCardFace
                key={i}
                suit={suit}
                corners={false}
                className={cn(
                  'flex h-10 w-7 items-center justify-center rounded-md',
                  group.length > 1 && i === 0 && '-rotate-6',
                  i > 0 && (sameSuit ? '-ml-5 rotate-6' : '-ml-2 rotate-6')
                )}
              >
                <span className={cn('text-base leading-none', suit === 'heart' ? 'text-suit-red' : 'text-[#24201A]')}>
                  {suit === 'heart' ? '♥' : '♠'}
                </span>
              </PlayingCardFace>
            ))}
          </span>
        )
      })}
    </span>
  )
}

/** Bouton de pari : mini-cartes, nom du pari, enjeu en pastille or. */
export function PurpleBetButton({
  bet,
  onClick,
  disabled,
  pending = false,
}: {
  bet: PurpleBetType
  onClick: () => void
  disabled?: boolean
  /** Pari parti, en attente du serveur : roue, pleine lumière. */
  pending?: boolean
}) {
  const t = useTranslations('games.purple')
  const tCommon = useTranslations('common')
  const meta = PURPLE_BET_META[bet]
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={pending || undefined}
      className={cn(
        'relative flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-center text-cream transition-[transform,box-shadow] enabled:hover:ring-2 enabled:hover:ring-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep motion-safe:active:scale-95 disabled:opacity-40',
        pending && 'disabled:opacity-100',
        BET_STYLE[bet]
      )}
    >
      <BetGlyph bet={bet} />
      <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold leading-tight">{t(`bets.${meta.labelKey}`)}</span>
        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold leading-tight tabular-nums text-[#24201A]">
          {tCommon('sipsCount', { count: meta.gulps })}
        </span>
      </span>
      {pending && <Loader2 aria-hidden className="absolute right-2 top-2 h-5 w-5 motion-safe:animate-spin" />}
    </button>
  )
}

/** Grille des six paris : deux colonnes au téléphone, simples en haut et doubles en bas dès `sm`. */
export function PurpleBetGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2 sm:grid-flow-col sm:grid-cols-3 sm:grid-rows-2">
      {children}
    </div>
  )
}

/**
 * Compteur (jeton or) et paquet. Le message « nouveau paquet » s'affiche sous
 * le nombre de cartes au lieu de le remplacer.
 */
export function PurplePotRow({
  counter,
  cardsLeft,
  newDeck,
  className,
}: {
  counter: number
  cardsLeft: number
  newDeck: boolean
  className?: string
}) {
  const t = useTranslations('games.purple')
  const tCommon = useTranslations('common')
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[#24201A]/40 bg-amber-500 font-display text-2xl font-bold tabular-nums text-[#24201A] shadow-[0_8px_18px_-10px_rgba(217,164,65,0.8)]"
      >
        {counter}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('counter')}</p>
        <p className="text-sm font-semibold text-cream">{tCommon('sipsCount', { count: counter })}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <p className="inline-flex items-center gap-1.5 text-sm text-cream/70">
          <Layers aria-hidden className="h-4 w-4 shrink-0 text-gold" />
          {t('cardsLeft', { count: cardsLeft })}
        </p>
        {newDeck && (
          <p className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold">{t('newDeck')}</p>
        )}
      </div>
    </div>
  )
}

/** Dernières cartes sorties du paquet. */
export function PurpleHistory({ cards }: { cards: readonly PurpleCardData[] }) {
  const t = useTranslations('games.purple')
  if (cards.length === 0) return null
  return (
    <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('lastCards')}</h2>
      <div className="flex flex-wrap gap-2">
        {cards.map((card, i) => (
          <PurpleCard key={i} card={card} size="sm" />
        ))}
      </div>
    </section>
  )
}

/**
 * Verdict d'un pari raté : QUI boit COMBIEN, en grand, avec les cartes qui
 * l'ont fait perdre. Porté en portail (Radix) : rendu dans la scène en ligne,
 * un voile `fixed` restait sous la barre du site.
 *
 * Sans `onDismiss`, ni croix ni Échap : seul le joueur au tour ferme (en
 * ligne, les autres attendent sa décision).
 */
export function PurpleVerdictDialog({
  open,
  name,
  amount,
  cards,
  onDismiss,
  children,
}: {
  open: boolean
  name: string
  amount: number
  cards: readonly PurpleCardData[]
  onDismiss?: () => void
  /** L'action (« Compris, au tour de Léa ») ou la ligne d'attente. */
  children: ReactNode
}) {
  const t = useTranslations('games.purple')
  const tCommon = useTranslations('common')
  // Radix garde le contenu monté le temps du fondu de sortie, or l'état a
  // déjà tourné à la fermeture : sans ce gel, le verdict affichait pendant
  // 200 ms le joueur SUIVANT, « 0 gorgée » et plus aucune carte.
  const shownRef = useRef({ name, amount, cards, children, dismissible: Boolean(onDismiss) })
  if (open) shownRef.current = { name, amount, cards, children, dismissible: Boolean(onDismiss) }
  const shown = shownRef.current
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss?.()
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={onDismiss ? undefined : (e) => e.preventDefault()}
        className="max-h-[92dvh] max-w-sm gap-0 overflow-y-auto rounded-2xl border-gold/20 bg-felt-deep p-6 text-cream shadow-2xl sm:rounded-2xl"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-suit-red/40 bg-suit-red/20">
            <Beer aria-hidden className="h-8 w-8 text-red-300" />
          </span>
          <DialogTitle className="font-display text-xl font-bold text-gold">{t('wrongCombo')}</DialogTitle>
          {shown.cards.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {shown.cards.map((card, i) => (
                <PurpleCard key={i} card={card} size="sm" />
              ))}
            </div>
          )}
          <DialogDescription className="break-words font-display text-2xl font-bold leading-snug text-cream">
            {t('mustDrink', { name: shown.name, count: shown.amount })}
          </DialogDescription>
          <p className="text-sm text-cream/70">{t('counterReset')}</p>
          <div className="w-full">{shown.children}</div>
        </div>
        {shown.dismissible && (
          <button
            type="button"
            onClick={() => onDismiss?.()}
            aria-label={tCommon('close')}
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-xl text-cream/70 transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        )}
      </DialogContent>
    </Dialog>
  )
}
