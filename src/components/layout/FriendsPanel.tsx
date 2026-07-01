"use client"

import { useTranslations } from 'next-intl'
import { AnimatePresence, motion } from 'framer-motion'
import { Users, X } from 'lucide-react'
import { FriendsManager } from '@/components/friends/FriendsManager'

interface FriendsPanelProps {
  open: boolean
  onClose: () => void
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

            <div className="max-h-[70vh] overflow-y-auto p-3">
              <FriendsManager compact />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
