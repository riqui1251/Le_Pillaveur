import { cn } from '@/lib/utils'

/**
 * Dé dessiné en CSS (carré arrondi + points sur grille 3×3) : les glyphes
 * Unicode ⚀-⚅ étaient illisibles sur beaucoup d'appareils (points
 * minuscules, rendu dépendant de la police système). Partagé entre le
 * Menteur mobile et son écran TV.
 */

/** Positions des points (ligne, colonne) sur une grille 3×3, par face. */
const DIE_PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [[0, 2], [2, 0]],
  3: [[0, 2], [1, 1], [2, 0]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

// xs : le dé d'une puce de l'échelle des enchères, à côté d'un avatar.
const BOX: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string> = {
  xs: 'h-5 w-5 p-[3px] rounded-md',
  sm: 'h-8 w-8 p-1',
  md: 'h-10 w-10 p-[5px]',
  lg: 'h-12 w-12 p-1.5',
  xl: 'h-20 w-20 p-2.5 rounded-2xl',
}

const PIP: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string> = {
  xs: 'h-[3px] w-[3px]',
  sm: 'h-1.5 w-1.5',
  md: 'h-[7px] w-[7px]',
  lg: 'h-2 w-2',
  xl: 'h-3.5 w-3.5',
}

export function CssDie({
  face,
  size = 'md',
  rem,
}: {
  face: number
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /**
   * Côté en rem, points et marge compris (écran TV, dont le rem suit la
   * télé) : les tailles nommées gardent des points en px, minuscules en 4K.
   * Remplace `size`.
   */
  rem?: number
}) {
  const pips = DIE_PIPS[face] ?? []
  const r = (k: number) => `${Math.round((rem ?? 0) * k * 1000) / 1000}rem`
  const boxStyle = rem === undefined ? undefined : { width: r(1), height: r(1), padding: r(0.125), borderRadius: r(0.2) }
  const pipStyle = rem === undefined ? undefined : { width: r(0.17), height: r(0.17) }
  return (
    <span
      role="img"
      aria-label={`${face}`}
      className={cn(
        'inline-grid select-none grid-cols-3 grid-rows-3 place-items-center rounded-lg border shadow-inner',
        rem === undefined && BOX[size],
        face === 1
          ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
          : 'border-white/25 bg-white/95 text-gray-900'
      )}
      style={boxStyle}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3)
        const col = i % 3
        const on = pips.some(([r, c]) => r === row && c === col)
        return (
          <span
            key={i}
            className={cn('rounded-full bg-current', rem === undefined && PIP[size], !on && 'opacity-0')}
            style={pipStyle}
          />
        )
      })}
    </span>
  )
}
