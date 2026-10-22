"use client"

import { useTranslations } from 'next-intl'
import { Mail, X } from 'lucide-react'
import { useFriendInvites } from '@/hooks/useFriendInvites'
import { GAMES } from '@/lib/games'
import { Button } from '@/components/ui/button'

interface FriendInviteBannerProps {
  onJoin: (roomId: string) => void
  joining?: boolean
}

/** Bannière compacte listant les invitations de lobby reçues d'amis (lobby + hub /jeux). */
export function FriendInviteBanner({ onJoin, joining }: FriendInviteBannerProps) {
  const t = useTranslations('onlineLobby.invites')
  const { invites, declineInvite } = useFriendInvites()

  if (invites.length === 0) return null

  return (
    <div className="mb-4 space-y-2">
      {invites.map((invite) => {
        const game = GAMES.find((g) => g.id === invite.gameId)
        return (
          <div
            key={invite.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                <Mail className="h-4 w-4 text-amber-300" />
              </span>
              <p className="min-w-0 text-sm text-cream">
                {t('invitedYou', { name: invite.hostDisplayName, game: game?.title ?? invite.gameId ?? '' })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="primary"
                size="game"
                disabled={joining}
                onClick={() => onJoin(invite.roomId)}
                className="rounded-xl"
              >
                {t('join')}
              </Button>
              <button
                type="button"
                onClick={() => declineInvite(invite.id)}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream"
                aria-label={t('decline')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
