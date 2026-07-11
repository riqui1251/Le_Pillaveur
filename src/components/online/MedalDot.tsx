import { cn } from '@/lib/utils'

/** Plaques du podium : or patiné, argent, bronze — pastille + chiffre. */
const MEDAL_STYLES = [
  'bg-gradient-to-br from-[#E7C97D] to-[#B8862F] text-[#3D2B08]',
  'bg-gradient-to-br from-[#DDE3E8] to-[#9AA4AE] text-[#2C3238]',
  'bg-gradient-to-br from-[#D3A275] to-[#8C5F35] text-[#33200E]',
]

export function MedalDot({ position, className }: { position: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black shadow-[0_2px_6px_-2px_rgba(0,0,0,0.6)]',
        MEDAL_STYLES[position - 1],
        className
      )}
      aria-label={`#${position}`}
    >
      {position}
    </span>
  )
}
