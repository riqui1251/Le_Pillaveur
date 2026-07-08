"use client"

import { useMemo } from 'react'
import type { RoomDto } from '@/lib/online-room'
import type { OnlinePreferences } from '@/lib/online-preferences'
import { crestTierForRole, roleLabel, type CrestTier } from '@/lib/roles'
import { DEFAULT_ONLINE_ICON } from '@/lib/online/cosmetics'
import { cn } from '@/lib/utils'

/**
 * SYSTÈME UNIQUE d'affichage des joueurs en ligne : écusson de rang, icône
 * encadrée, pseudo avec effet animé et badge de niveau — identique dans le
 * lobby et dans TOUS les jeux. Rendu via les classes CSS dédiées
 * `on-fx-*`/`on-frame-*`/`on-crest-*` (src/styles/online-cosmetics.css),
 * séparées du système local. Les données viennent des membres de la salle
 * (RoomDto), déjà validées serveur (équipement gated par la progression).
 */

export type MemberCosmetics = {
  preferences: OnlinePreferences
  level: number
  /** Rôle brut du compte — dérive l'écusson de rang (crestTierForRole). */
  role: string
}

/** Map userId → cosmétiques, à construire une fois par écran de jeu. */
export function useMemberCosmetics(room: RoomDto | null): Map<string, MemberCosmetics> {
  return useMemo(() => {
    const map = new Map<string, MemberCosmetics>()
    for (const m of room?.members ?? []) {
      map.set(m.userId, { preferences: m.preferences, level: m.level, role: m.role })
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
  const effect = cosmetics?.preferences.specialEffect
  return (
    <span className={cn('on-fx', effect && `on-fx-${effect}`, className)}>{name}</span>
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
  const frame = cosmetics?.preferences.iconFrame
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        frame && `on-frame on-frame-${frame}`,
        className
      )}
    >
      {icon ?? cosmetics?.preferences.icon ?? DEFAULT_ONLINE_ICON}
    </span>
  )
}

const CREST_GEM: Record<CrestTier, string> = {
  mod: '◆',
  admin: '◆',
  superadmin: '◆',
  fondateur: '★',
}

/**
 * Écusson de rang — automatique, non désactivable, devant le pseudo. `null`
 * pour un joueur sans grade staff (composant ne rend rien, pas d'espace pris).
 */
export function RankCrest({
  role,
  size = 'sm',
  className,
}: {
  role?: string | null
  size?: 'sm' | 'lg'
  className?: string
}) {
  const tier = role ? crestTierForRole(role) : null
  if (!tier) return null
  return (
    <span
      role="img"
      aria-label={roleLabel(role ?? '')}
      title={roleLabel(role ?? '')}
      className={cn('on-crest', `on-crest-${tier}`, size === 'sm' && 'sm', className)}
    >
      <span className="on-crest-disc" />
      {size === 'lg' && (
        <>
          <span className="on-crest-wing l" />
          <span className="on-crest-wing r" />
        </>
      )}
      <span className="on-crest-gem">{CREST_GEM[tier]}</span>
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
      <RankCrest role={cosmetics?.role} />
      <OnlinePlayerIcon icon={icon} cosmetics={cosmetics} className={iconClassName} />
      <OnlinePlayerName name={name} cosmetics={cosmetics} className={cn('truncate', nameClassName)} />
      {showLevel && <OnlineLevelBadge cosmetics={cosmetics} />}
    </span>
  )
}
