"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Trash2, UserPlus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useFriends } from '@/hooks/useFriends'
import { cn } from '@/lib/utils'

interface FriendsManagerProps {
  /** Espacements resserrés pour un usage dans une fenêtre/popover plutôt que la page Compte. */
  compact?: boolean
}

/**
 * Gestion complète des amis (ajout par code, demandes, liste, retrait) —
 * composant partagé entre la page Compte et le panneau Amis du header,
 * pour éviter de dupliquer la même logique à deux endroits.
 */
export function FriendsManager({ compact = false }: FriendsManagerProps) {
  const tFriends = useTranslations('account.friends')
  const tCommon = useTranslations('common')
  const { friends, incoming, outgoing, error, sendRequest, acceptRequest, declineRequest, removeFriend } = useFriends()
  const [codeInput, setCodeInput] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  const handleRemoveFriend = (friendshipId: string) => {
    if (confirmRemoveId !== friendshipId) {
      setConfirmRemoveId(friendshipId)
      return
    }
    setConfirmRemoveId(null)
    void removeFriend(friendshipId)
  }

  const handleAdd = async () => {
    const code = codeInput.trim()
    if (!code) return
    setFeedback(null)
    const status = await sendRequest(code)
    if (status === 'sent') setFeedback(tFriends('addSuccessSent'))
    else if (status === 'auto-accepted') setFeedback(tFriends('addSuccessAutoAccepted'))
    if (status) {
      setCodeInput('')
      window.setTimeout(() => setFeedback(null), 3000)
    }
  }

  const sortedFriends = [...friends].sort((a, b) => Number(b.isOnline) - Number(a.isOnline))

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleAdd()
          }}
          maxLength={12}
          placeholder={tFriends('addPlaceholder')}
          className="h-9 border-amber-300/25 bg-black/20 font-mono text-sm text-white placeholder:text-white/35"
        />
        <button
          type="button"
          onClick={() => { void handleAdd() }}
          disabled={!codeInput.trim()}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-500/25 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/35 disabled:opacity-40"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {tFriends('add')}
        </button>
      </div>
      {error && <p className="text-xs text-orange-300">{error}</p>}
      {feedback && <p className="text-xs text-emerald-300">{feedback}</p>}

      {incoming.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-amber-300/70">
            {tFriends('incomingRequests')}
          </p>
          <ul className="space-y-2">
            {incoming.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
              >
                <span className="truncate text-sm font-medium text-white">{r.displayName}</span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => acceptRequest(r.id)}
                    className="rounded-lg bg-emerald-500/20 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
                  >
                    {tFriends('accept')}
                  </button>
                  <button
                    onClick={() => declineRequest(r.id)}
                    className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10"
                  >
                    {tFriends('decline')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="border-t border-white/10 pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-white/40">
            {tFriends('outgoingRequests')}
          </p>
          <ul className="space-y-1.5">
            {outgoing.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-1 text-sm text-white/50">
                <span className="truncate">{r.displayName}</span>
                <button
                  onClick={() => removeFriend(r.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/30 hover:bg-white/10 hover:text-white/60"
                  aria-label={tCommon('cancel')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-white/10 pt-3">
        {sortedFriends.length === 0 ? (
          <p className="py-2 text-center text-sm text-white/40">{tFriends('empty')}</p>
        ) : (
          <ul className="space-y-2">
            {sortedFriends.map((f) => {
              const isConfirming = confirmRemoveId === f.friendshipId
              return (
                <li
                  key={f.friendshipId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', f.isOnline ? 'bg-emerald-400' : 'bg-white/20')}
                    />
                    <span className={cn('truncate text-sm font-medium', f.isOnline ? 'text-white' : 'text-white/80')}>
                      {f.displayName}
                    </span>
                    {f.isOnline && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">
                        {tFriends('online')}
                      </span>
                    )}
                  </div>
                  {isConfirming ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => handleRemoveFriend(f.friendshipId)}
                        className="rounded-lg bg-red-500/20 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30"
                      >
                        {tCommon('confirm')}
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-white/60 hover:bg-white/10"
                      >
                        {tCommon('cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRemoveFriend(f.friendshipId)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/30 transition-colors hover:bg-red-500/15 hover:text-red-400"
                      title={tFriends('remove')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
