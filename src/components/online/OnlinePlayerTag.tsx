"use client"

import { useMemo } from 'react'
import type { RoomDto } from '@/lib/online-room'
import type { OnlinePreferences } from '@/lib/online-preferences'
import { PlayerName } from '@/components/ui/PlayerName'
import { getPlayerFrameClass } from '@/lib/playerUtils'
import { cn } from '@/lib/utils'

/**
 * SYSTÈME UNIQUE d'affichage des joueurs en ligne : pseudo avec effet animé,
 * icône avec cadre débloqué et badge de niveau — identique dans le lobby et
 * dans TOUS les jeux. Les données viennent des membres de la salle (RoomDto),
 * déjà validées serveur (équipement gated par la progression).
 */

export type MemberCosmetics = {
  preferences: OnlinePreferences
  level: number
}

/** Map userId → cosmétiques, à construire une fois par écran de jeu. */
export function useMemberCosmetics(room: RoomDto | null): Map<string, MemberCosmetics> {
  return useMemo(() => {
    const map = new Map<string, MemberCosmetics>()
    for (const m of room?.members ?? []) {
      map.set(m.userId, { preferences: m.preferences, level: m.level })
    }
    return map
  }, [room?.members])
}

export function OnlinePlayerName({
  name,
  cosmetics,
  className,
}: {
  name: string
  cosmetics?: MemberCosmetics | null
  className?: string
}) {
  return (
    <PlayerName
      player={{ name, preferences: { specialEffect: cosmetics?.preferences.specialEffect ?? null } }}
      className={className}
    />
  )
}

export function OnlinePlayerIcon({
  icon,
  cosmetics,
  className,
}: {
  /** Emoji à afficher (icône du moteur ou des préférences). */
  icon?: string | null
  cosmetics?: MemberCosmetics | null
  className?: string
}) {
  const frameClass = getPlayerFrameClass(cosmetics?.preferences.iconFrame)
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        frameClass,
        className
      )}
    >
      {icon ?? cosmetics?.preferences.icon ?? '👤'}
    </span>
  )
}

export function OnlineLevelBadge({
  cosmetics,
  className,
}: {
  cosmetics?: MemberCosmetics | null
  className?: string
}) {
  if (!cosmetics) return null
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-sky-400/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-sky-300',
        className
      )}
      title={`Niveau ${cosmetics.level}`}
    >
      {cosmetics.level}
    </span>
  )
}

/** Pseudo complet : icône encadrée + nom animé + niveau. */
export function OnlinePlayerTag({
  name,
  icon,
  cosmetics,
  showLevel = false,
  className,
  nameClassName,
  iconClassName,
}: {
  name: string
  icon?: string | null
  cosmetics?: MemberCosmetics | null
  showLevel?: boolean
  className?: string
  nameClassName?: string
  iconClassName?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <OnlinePlayerIcon icon={icon} cosmetics={cosmetics} className={iconClassName} />
      <OnlinePlayerName name={name} cosmetics={cosmetics} className={cn('truncate', nameClassName)} />
      {showLevel && <OnlineLevelBadge cosmetics={cosmetics} />}
    </span>
  )
}
