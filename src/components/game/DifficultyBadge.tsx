import { useTranslations } from 'next-intl'
import type { GameDifficulty } from '@/lib/games'
import { cn } from '@/lib/utils'

/**
 * Couleur des barres par niveau. `felt` : sur le feutre sombre (Soirée, lobby,
 * vitrine, Supervision) ; `card` : sur la crème des cartes du hub et de la
 * landing — plus soutenue pour garder le contraste.
 */
const BAR_COLORS = {
  felt: { 1: 'text-emerald-300', 2: 'text-amber-300', 3: 'text-red-300' },
  card: { 1: 'text-emerald-700', 2: 'text-amber-700', 3: 'text-suit-red' },
} as const

const LABEL_COLORS = { felt: 'text-amber-100', card: 'text-[#4A443A]' } as const

/** Trois barres montantes, comme un indicateur de réseau : une, deux ou trois pleines. */
const BARS = [
  { x: 0, y: 7, height: 5 },
  { x: 5.5, y: 4, height: 8 },
  { x: 11, y: 1, height: 11 },
] as const

export function DifficultyBars({ level, className }: { level: GameDifficulty; className?: string }) {
  return (
    <svg viewBox="0 0 14 12" fill="currentColor" aria-hidden className={cn('h-3 w-3.5 shrink-0', className)}>
      {BARS.map((bar, index) => (
        <rect key={index} x={bar.x} y={bar.y} width="3" height={bar.height} rx="1" opacity={index < level ? 1 : 0.28} />
      ))}
    </svg>
  )
}

type DifficultyBadgeProps = {
  level: GameDifficulty
  tone?: keyof typeof BAR_COLORS
  /** `bars` : barres seules, là où la place manque (le niveau passe au lecteur d'écran et à l'infobulle). */
  variant?: 'label' | 'bars'
  className?: string
}

/**
 * Niveau de difficulté d'un jeu (GameMeta.difficulty) : barres + mot. Sans
 * état ni effet : rendu aussi bien par une page serveur (landing, règles) que
 * par un écran client (hub, Soirée, lobby).
 */
export function DifficultyBadge({ level, tone = 'felt', variant = 'label', className }: DifficultyBadgeProps) {
  const t = useTranslations('common.difficulty')
  const word = t(`levels.${level}`)
  const spoken = t('aria', { level: word })

  if (variant === 'bars') {
    return (
      <span role="img" aria-label={spoken} title={spoken} className={cn('inline-flex items-center', BAR_COLORS[tone][level], className)}>
        <DifficultyBars level={level} />
      </span>
    )
  }

  return (
    <span
      title={spoken}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold leading-none', LABEL_COLORS[tone], className)}
    >
      <DifficultyBars level={level} className={BAR_COLORS[tone][level]} />
      <span aria-hidden>{word}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}
