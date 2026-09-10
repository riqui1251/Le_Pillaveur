"use client"

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, ShieldOff, UserPlus, Users, X } from 'lucide-react'
import { FriendsManager } from '@/components/friends/FriendsManager'
import { useAuth } from '@/components/providers/AuthProvider'
import { useFriends } from '@/hooks/useFriends'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { cn } from '@/lib/utils'

interface FriendsPanelProps {
  open: boolean
  onClose: () => void
}

type BlockedUser = {
  userId: string
  displayName: string
  accountCode: string | null
  createdAt: string
}

/** Panneau amis (ajout, demandes, liste + statut en ligne) ouvert depuis le bouton du header, à côté du menu. */
export function FriendsPanel({ open, onClose }: FriendsPanelProps) {
  const tFriends = useTranslations('account.friends')
  const tNav = useTranslations('nav')

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            role="dialog"
            aria-modal="true"
            aria-label={tFriends('title')}
            className="fixed left-3 right-3 top-16 z-[61] mx-auto max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0c0b12]/98 shadow-2xl backdrop-blur-xl sm:left-16 sm:right-auto sm:top-[4.25rem]"
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-br from-amber-600/15 to-transparent px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-bold text-white">{tFriends('title')}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={tNav('closeMenu')}
                className="touch-target flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto p-3">
              <InviteToTable />
              <FriendsManager compact />
              <BlockedList open={open} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * « Inviter à ma table » — la liste d'amis n'ouvrait sur aucune action : on
 * voyait qui était en ligne sans pouvoir rien en faire. La section n'apparaît
 * que quand l'invitation a un sens : on est l'hôte d'une table encore en
 * attente et fermée (une table publique se rejoint par son code, sans invite).
 */
function InviteToTable() {
  const tFriends = useTranslations('account.friends')
  const { user } = useAuth()
  const { room, inviteFriend } = useOnlineRoom()
  const { friends } = useFriends()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())

  const canInvite =
    Boolean(room) &&
    room?.status === 'waiting' &&
    room?.visibility !== 'public' &&
    room?.hostUserId === user?.id

  if (!canInvite || !room) return null

  const memberIds = new Set(room.members.map((m) => m.userId))
  const invitable = friends.filter((f) => !memberIds.has(f.userId))
  if (invitable.length === 0) return null

  const invite = async (friendUserId: string) => {
    setPendingId(friendUserId)
    const ok = await inviteFriend(friendUserId)
    setPendingId(null)
    if (ok) setInvitedIds((prev) => new Set(prev).add(friendUserId))
  }

  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.07] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-300/80">
        {tFriends('inviteSection')}
      </p>
      <ul className="space-y-1.5">
        {[...invitable]
          .sort((a, b) => Number(b.isOnline) - Number(a.isOnline))
          .map((f) => {
            const invited = invitedIds.has(f.userId)
            return (
              <li key={f.friendshipId} className="flex items-center gap-2">
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', f.isOnline ? 'bg-emerald-400' : 'bg-white/20')}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-white/85">{f.displayName}</span>
                <button
                  type="button"
                  onClick={() => void invite(f.userId)}
                  disabled={invited || pendingId === f.userId}
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    invited
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-emerald-500/25 text-emerald-50 hover:bg-emerald-500/40 disabled:opacity-50'
                  )}
                >
                  {pendingId === f.userId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : invited ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  {invited ? tFriends('invited') : tFriends('inviteToTable')}
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}

/** Joueurs bloqués — sans cette liste, un blocage serait irréversible. */
function BlockedList({ open }: { open: boolean }) {
  const tFriends = useTranslations('account.friends')
  const [blocked, setBlocked] = useState<BlockedUser[]>([])
  const [pendingId, setPendingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/friends/blocks', { credentials: 'include' })
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    setBlocked(Array.isArray(data?.blocked) ? data.blocked : [])
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  if (blocked.length === 0) return null

  const unblock = async (userId: string) => {
    setPendingId(userId)
    const res = await fetch(`/api/friends/blocks/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    setPendingId(null)
    if (res.ok) setBlocked((prev) => prev.filter((b) => b.userId !== userId))
  }

  return (
    <div className="border-t border-white/10 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/40">
        <ShieldOff className="h-3.5 w-3.5" />
        {tFriends('blockedTitle')}
      </p>
      <ul className="space-y-1.5">
        {blocked.map((b) => (
          <li key={b.userId} className="flex items-center gap-2 px-1">
            <span className="min-w-0 flex-1 truncate text-sm text-white/55">{b.displayName}</span>
            <button
              type="button"
              onClick={() => void unblock(b.userId)}
              disabled={pendingId === b.userId}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {pendingId === b.userId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {tFriends('unblock')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
