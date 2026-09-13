"use client"

import { useTranslations } from 'next-intl'
import { Globe, KeyRound, Unplug, UserRound, UserX, type LucideIcon } from 'lucide-react'
import { guestLastActivityAt, isGuestProbablyLost, type AccountKind } from '@/lib/account-kind'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Libellé, icône et teinte de chaque type de compte. Exporté : le journal du
 * staff traduit aussi le type d'un compte supprimé avec ces libellés.
 */
export const ACCOUNT_KIND_BADGES: Record<AccountKind, { labelKey: string; icon: LucideIcon; className: string }> = {
  password: {
    labelKey: 'accountKind.password',
    icon: KeyRound,
    className: 'border-white/15 bg-white/[0.06] text-white/75',
  },
  google: {
    labelKey: 'accountKind.google',
    icon: Globe,
    className: 'border-sky-500/30 bg-sky-500/15 text-sky-200',
  },
  guest: {
    labelKey: 'accountKind.guest',
    icon: UserRound,
    className: 'border-violet-500/30 bg-violet-500/15 text-violet-200',
  },
  guest_orphan: {
    labelKey: 'accountKind.guestOrphan',
    icon: Unplug,
    className: 'border-orange-500/35 bg-orange-500/15 text-orange-200',
  },
  legacy: {
    labelKey: 'accountKind.legacy',
    icon: UserX,
    className: 'border-white/10 bg-white/[0.03] text-white/50',
  },
}

/**
 * Badge du TYPE de compte (lot 2), partagé par la liste, la fiche et
 * l'analyse d'IP. Le type vient du serveur (account-kind). Un invité inactif
 * depuis plus de GUEST_STALE_DAYS garde parfois une session valide en base
 * alors que son cookie a disparu : on l'écrit à côté du badge, sans quoi il
 * passerait pour un joueur qui peut revenir. Rendu en fragment : le parent
 * est toujours une rangée `flex-wrap`.
 */
export function AccountKindBadge({
  kind,
  lastSeenAt,
  createdAt,
  sessionExpiresAt,
  compact,
}: {
  kind: AccountKind
  lastSeenAt: string | null
  /** Sans date de référence, pas de mention « cookie perdu ». */
  createdAt: string | null
  /**
   * Jour d'échéance de la session : un renouvellement récent prouve l'usage
   * même quand le ping, seul à écrire lastSeenAt, est bloqué.
   */
  sessionExpiresAt?: string | null
  compact?: boolean
}) {
  const t = useTranslations('supervision')
  const badge = ACCOUNT_KIND_BADGES[kind]
  // Réponse d'un serveur antérieur au lot 2 : pas de type, pas de badge.
  if (!badge) return null
  const Icon = badge.icon
  const reference = lastSeenAt ?? createdAt
  const activity = reference ? { lastSeenAt, createdAt: reference, sessionExpiresAt } : null
  const lastActivity = activity && isGuestProbablyLost({ kind, ...activity }) ? guestLastActivityAt(activity) : null
  const staleDays = lastActivity !== null ? Math.floor((Date.now() - lastActivity) / DAY_MS) : null
  return (
    <>
      <Badge className={cn(badge.className, compact && 'px-1.5 py-0 text-[10px]')}>
        <Icon className={compact ? 'mr-0.5 h-2.5 w-2.5' : 'mr-1 h-3 w-3'} />
        {t(badge.labelKey)}
      </Badge>
      {staleDays != null && (
        <span className="min-w-0 text-[11px] leading-tight text-amber-200/80">
          {t('accountKind.staleGuest', { days: staleDays })}
        </span>
      )}
    </>
  )
}
