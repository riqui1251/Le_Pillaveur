import { useTranslations } from 'next-intl'
import type { GameDrinkLevel } from '@/lib/games'
import { cn } from '@/lib/utils'

/**
 * Couleurs de la jauge : la goutte, les crans vides et les trois crans pleins,
 * de l'ambre au rouge (choix de l'utilisateur du 25/11, maquette C). Couleurs
 * pleines, sans dégradé SVG : un dégradé exige un id, en double dès qu'il y a
 * deux jauges sur la page. `card` : sur la crème, assez sombre pour tenir 3:1 ;
 * `felt` : sur le feutre sombre.
 */
const GAUGE_COLORS = {
  felt: { drop: '#F2C46B', empty: 'rgba(243,234,211,0.2)', steps: ['#F2C46B', '#E8833A', '#E05547'] },
  card: { drop: '#B45309', empty: 'rgba(36,32,26,0.15)', steps: ['#B45309', '#C2410C', '#B3382E'] },
} as const

type GaugeTone = keyof typeof GAUGE_COLORS

const LABEL_COLORS: Record<GaugeTone, string> = { felt: 'text-amber-100', card: 'text-[#4A443A]' }

/** Une goutte puis trois crans : un, deux ou trois remplis. */
export function DrinkLevelGauge({ level, tone = 'felt', className }: { level: GameDrinkLevel; tone?: GaugeTone; className?: string }) {
  const colors = GAUGE_COLORS[tone]
  return (
    <svg viewBox="0 0 42 12" aria-hidden className={cn('h-3 w-[42px] shrink-0', className)}>
      <path d="M4.5 0.8C4.5 0.8 1 5 1 7.6a3.5 3.5 0 0 0 7 0C8 5 4.5 0.8 4.5 0.8z" fill={colors.drop} />
      {[0, 1, 2].map((index) => (
        <rect key={index} x={12 + index * 10.5} y={4} width={9} height={5} rx={1.5} fill={index < level ? colors.steps[index] : colors.empty} />
      ))}
    </svg>
  )
}

type DrinkLevelBadgeProps = {
  level: GameDrinkLevel
  tone?: GaugeTone
  /** `icons` : la jauge seule, là où la place manque (le niveau passe au lecteur d'écran et à l'infobulle). */
  variant?: 'label' | 'icons'
  className?: string
}

/**
 * Ce qu'un jeu fait boire (GameMeta.drinkLevel, réglable par l'équipe) : jauge
 * + mot. Sans état ni effet, comme DifficultyBadge : rendu aussi bien par une
 * page serveur que par un écran client. La classe `drink-level` le fait
 * disparaître en ambiance « Sans alcool » (règle dans globals.css).
 */
export function DrinkLevelBadge({ level, tone = 'felt', variant = 'label', className }: DrinkLevelBadgeProps) {
  const t = useTranslations('common.drinkLevel')
  const word = t(`levels.${level}`)
  const spoken = t('aria', { level: word })

  if (variant === 'icons') {
    return (
      <span role="img" aria-label={spoken} title={spoken} className={cn('drink-level inline-flex items-center', className)}>
        <DrinkLevelGauge level={level} tone={tone} />
      </span>
    )
  }

  return (
    <span
      title={spoken}
      className={cn('drink-level inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold leading-none', LABEL_COLORS[tone], className)}
    >
      <DrinkLevelGauge level={level} tone={tone} />
      <span aria-hidden>{word}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  )
}
