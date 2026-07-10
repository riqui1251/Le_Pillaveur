import type { GameSuit } from '@/lib/games'
import { cn } from '@/lib/utils'

/**
 * Carte à jouer « Cartes sur Table » — LE composant signature de l'identité.
 * Fond crème, coins rang + enseigne (♠♥♦♣), ombre de table. Utilisée par le
 * hub (tuiles de jeux), les cartes de rôle et le mode TV.
 */

const SUIT_GLYPH: Record<GameSuit, string> = {
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
}

const SUIT_IS_RED: Record<GameSuit, boolean> = {
  spade: false,
  club: false,
  heart: true,
  diamond: true,
}

export function suitGlyph(suit: GameSuit): string {
  return SUIT_GLYPH[suit]
}

export function suitIsRed(suit: GameSuit): boolean {
  return SUIT_IS_RED[suit]
}

export function PlayingCard({
  suit,
  rank,
  corners = true,
  className,
  children,
}: {
  suit?: GameSuit
  rank?: string
  /** Afficher les coins rang+enseigne (haut-gauche + bas-droite inversé). */
  corners?: boolean
  className?: string
  children?: React.ReactNode
}) {
  const glyph = suit ? SUIT_GLYPH[suit] : null
  const red = suit ? SUIT_IS_RED[suit] : false

  return (
    <div
      className={cn(
        'relative rounded-xl border border-[#D8CCAE] bg-cream text-[#24201A]',
        'shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]',
        className
      )}
    >
      {corners && glyph && (
        <>
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute left-1.5 top-1 select-none text-center font-display text-[10px] font-bold leading-[1.05]',
              red ? 'text-suit-red' : 'text-[#24201A]'
            )}
          >
            {rank}
            <br />
            {glyph}
          </span>
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute bottom-1 right-1.5 rotate-180 select-none text-center font-display text-[10px] font-bold leading-[1.05]',
              red ? 'text-suit-red' : 'text-[#24201A]'
            )}
          >
            {rank}
            <br />
            {glyph}
          </span>
        </>
      )}
      {children}
    </div>
  )
}

/**
 * Dos de carte — motif treillis or sur feutre. Sert de face « cachée »
 * (rôle masqué, carte retournée sur la TV).
 */
export function PlayingCardBack({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-gold/50 bg-felt-deep',
        'shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]',
        className
      )}
    >
      <div
        aria-hidden
        className="absolute inset-1.5 rounded-lg border border-gold/40"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgb(var(--gold-rgb) / 0.16) 0 1.5px, transparent 1.5px 7px),' +
            'repeating-linear-gradient(-45deg, rgb(var(--gold-rgb) / 0.16) 0 1.5px, transparent 1.5px 7px)',
        }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <span aria-hidden className="font-display text-lg text-gold/80">
          ♠
        </span>
      </div>
    </div>
  )
}
