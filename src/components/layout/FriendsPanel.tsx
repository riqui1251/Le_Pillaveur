"use client"

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion } from 'framer-motion'
import { Users, X } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import type { Friend } from '@/hooks/useFriends'
import { cn } from '@/lib/utils'

interface FriendsPanelProps {
  open: boolean
  onClose: () => void
  friends: Friend[]
  onRefresh: () => void
}

/** Panneau compact (amis + statut en ligne) ouvert depuis le bouton du header, à côté du menu. */
export function FriendsPanel({ open, onClose, friends, onRefresh }: FriendsPanelProps) {
  const tFriends = useTranslations('account.friends')
  const tNav = useTranslations('nav')

  useEffect(() => {
    if (open) onRefresh()
  }, [open, onRefresh])

  const sorted = [...friends].sort((a, b) => Number(b.isOnline) - Number(a.isOnline))

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
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-br from-violet-600/15 to-transparent px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-300" />
                <h2 className="text-sm font-bold text-white">{tFriends('title')}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={tNav('closeMenu')}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2">
              {sorted.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-white/40">{tFriends('empty')}</p>
              ) : (
                <ul className="space-y-1">
                  {sorted.map((f) => (
                    <li
                      key={f.friendshipId}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', f.isOnline ? 'bg-emerald-400' : 'bg-white/20')}
                      />
                      <span className={cn('truncate text-sm font-medium', f.isOnline ? 'text-white' : 'text-white/50')}>
                        {f.displayName}
                      </span>
                      {f.isOnline && (
                        <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">
                          {tFriends('online')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Link
              href="/compte"
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 border-t border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold text-violet-300 transition-colors hover:bg-white/[0.06] hover:text-violet-200"
            >
              {tNav('manageFriends')}
            </Link>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
