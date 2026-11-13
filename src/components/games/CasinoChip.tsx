import { cn } from '@/lib/utils'

/**
 * Jeton de casino « Cartes sur Table » : tranche à huit liserés, filet
 * pointillé, médaillon central à la valeur. Une couleur par valeur, comme
 * au casino : ivoire liseré bleu (1), rouge carreau liseré ivoire (2), encre
 * liseré or (3). Dessiné en CSS (dégradé conique) : net à toutes les tailles,
 * de la case de mise au lobby TV.
 */

type ChipStyle = { base: string; stripe: string; ink: string; face: string }

const CHIP_STYLES: Record<number, ChipStyle> = {
  1: { base: '#EFE4C8', stripe: '#2B5BA8', ink: '#24201A', face: '#F8F1DF' },
  2: { base: '#B3382E', stripe: '#F3EAD3', ink: '#F3EAD3', face: '#C4473C' },
  3: { base: '#1F1B16', stripe: '#D9A441', ink: '#E7BD62', face: '#2C2620' },
}

export type CasinoChipSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZE_PX: Record<CasinoChipSize, number> = { xs: 22, sm: 28, md: 40, lg: 52 }

function styleFor(value: number): ChipStyle {
  return CHIP_STYLES[value] ?? CHIP_STYLES[3]
}

export function CasinoChip({
  value,
  size = 'md',
  className,
}: {
  value: number
  size?: CasinoChipSize
  className?: string
}) {
  const px = SIZE_PX[size]
  const s = styleFor(value)
  return (
    <span
      aria-hidden
      className={cn('relative inline-block shrink-0 rounded-full', className)}
      style={{
        width: px,
        height: px,
        // Huit liserés sur la tranche : 30° de couleur, 15° de liseré.
        background: `repeating-conic-gradient(from 7.5deg, ${s.base} 0deg 30deg, ${s.stripe} 30deg 45deg)`,
        boxShadow: `inset 0 0 0 ${px > 30 ? 2 : 1}px rgba(0,0,0,0.28), 0 ${px > 30 ? 3 : 2}px 0 rgba(0,0,0,0.35), 0 6px 12px -6px rgba(0,0,0,0.7)`,
      }}
    >
      <span
        className="absolute grid place-items-center rounded-full font-display font-bold leading-none tabular-nums"
        style={{
          inset: '17%',
          background: `radial-gradient(circle at 35% 30%, ${s.face}, ${s.base} 75%)`,
          border: `${px > 30 ? 2 : 1}px dashed ${s.stripe}`,
          color: s.ink,
          fontSize: Math.round(px * 0.36),
        }}
      >
        {value}
      </span>
    </span>
  )
}

/**
 * Pile de jetons (mise doublée = deux jetons) : chaque jeton se pose un peu
 * plus haut que le précédent, comme une pile vue de face sur le feutre.
 */
export function CasinoChipStack({
  value,
  count = 1,
  size = 'md',
  className,
}: {
  value: number
  count?: number
  size?: CasinoChipSize
  className?: string
}) {
  const px = SIZE_PX[size]
  const step = Math.max(3, Math.round(px * 0.14))
  const n = Math.max(1, count)
  return (
    <span aria-hidden className={cn('relative inline-block shrink-0', className)} style={{ width: px, height: px + step * (n - 1) }}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="absolute left-0" style={{ bottom: i * step, zIndex: i }}>
          <CasinoChip value={value} size={size} />
        </span>
      ))}
    </span>
  )
}
