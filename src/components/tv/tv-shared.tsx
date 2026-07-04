import { cn } from '@/lib/utils'

/** Palette d'avatars TV (lisible de loin, contrastée sur fond sombre). */
export const TV_PALETTE = [
  '#f472b6', '#60a5fa', '#34d399', '#fbbf24',
  '#a78bfa', '#fb7185', '#22d3ee', '#facc15',
]

export function tvColor(index: number): string {
  return TV_PALETTE[((index % TV_PALETTE.length) + TV_PALETTE.length) % TV_PALETTE.length]
}

/** Avatar TV : pastille colorée + initiale, lisible à distance. */
export function TvAvatar({
  name,
  index,
  size = 56,
  active = false,
}: {
  name: string
  index: number
  size?: number
  active?: boolean
}) {
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-black text-black/80 shadow-lg',
        active && 'ring-4 ring-white/80',
      )}
      style={{ width: size, height: size, backgroundColor: tvColor(index), fontSize: size * 0.44 }}
      aria-hidden
    >
      {initial}
    </span>
  )
}
