import { Player } from '@/lib/players'
import { getPlayerFrameClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'

type PlayerIconSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<PlayerIconSize, string> = {
  sm: 'h-6 w-6 text-sm',
  md: 'h-8 w-8 text-base',
  lg: 'h-11 w-11 text-xl',
}

const ICON_TEXT: Record<PlayerIconSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
}

interface PlayerIconProps {
  player: Pick<Player, 'name'> & { preferences?: Player['preferences'] }
  size?: PlayerIconSize
  className?: string
}

export function PlayerIcon({ player, size = 'md', className }: PlayerIconProps) {
  const icon = player.preferences?.icon || player.name.charAt(0).toUpperCase()
  const frameClass = getPlayerFrameClass(player.preferences?.iconFrame)

  const iconContent = (
    <span className={cn('leading-none select-none', frameClass ? ICON_TEXT[size] : '')}>{icon}</span>
  )

  if (!frameClass) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl bg-transparent',
          SIZE_CLASSES[size],
          className
        )}
        aria-hidden
      >
        {iconContent}
      </div>
    )
  }

  return (
    <div
      className={cn('inline-flex shrink-0 items-center justify-center', frameClass, SIZE_CLASSES[size], className)}
      aria-hidden
    >
      <div className="player-icon-frame-inner">
        {iconContent}
      </div>
    </div>
  )
}
