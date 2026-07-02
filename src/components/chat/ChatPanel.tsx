"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Gamepad2, MessageCircle, Send, Users, X } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useFriends } from '@/hooks/useFriends'
import type { ChatUnread } from '@/hooks/useChatUnread'
import { cn } from '@/lib/utils'

const POLL_MS = 3000

type ChatMessage = {
  id: string
  senderId: string
  senderName: string
  senderIcon: string | null
  body: string
  createdAt: string
  self: boolean
}

type ChatScope = { scope: 'room' } | { scope: 'friend'; friendUserId: string }

/** Conversation (partie ou ami) : polling léger tant qu'elle est affichée. */
function ChatConversation({ target, onRead }: { target: ChatScope; onRead?: () => void }) {
  const t = useTranslations('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [noRoom, setNoRoom] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inFlightRef = useRef(false)
  const lastIdRef = useRef<string | null>(null)

  const query =
    target.scope === 'room' ? 'scope=room' : `scope=friend&friend=${encodeURIComponent(target.friendUserId)}`

  const fetchMessages = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch(`/api/chat/messages?${query}`, { credentials: 'include' })
      if (res.status === 404) {
        setNoRoom(true)
        setMessages([])
        return
      }
      if (!res.ok) return
      setNoRoom(false)
      const data = await res.json()
      const next: ChatMessage[] = Array.isArray(data?.messages) ? data.messages : []
      const nextLastId = next[next.length - 1]?.id ?? null
      if (nextLastId !== lastIdRef.current) {
        lastIdRef.current = nextLastId
        setMessages(next)
        // Le serveur vient de marquer la conversation lue → rafraîchit le badge.
        onRead?.()
      }
    } finally {
      inFlightRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    lastIdRef.current = null
    setMessages([])
    setNoRoom(false)
    void fetchMessages()
    const timer = setInterval(fetchMessages, POLL_MS)
    return () => clearInterval(timer)
  }, [fetchMessages])

  // Colle la liste en bas à chaque nouveau message.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(
          target.scope === 'room'
            ? { scope: 'room', body }
            : { scope: 'friend', friendUserId: target.friendUserId, body }
        ),
      })
      if (res.ok) {
        setDraft('')
        await fetchMessages()
      }
    } finally {
      setSending(false)
    }
  }

  if (noRoom) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-white/40">
        {t('noRoom')}
      </div>
    )
  }

  return (
    <div className="flex h-[50vh] flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="pt-10 text-center text-sm text-white/35">{t('empty')}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex', m.self ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3 py-2',
                  m.self
                    ? 'rounded-br-sm bg-amber-500/20 text-amber-50'
                    : 'rounded-bl-sm bg-white/[0.07] text-white/90'
                )}
              >
                {!m.self && (
                  <p className="mb-0.5 text-[10px] font-semibold text-violet-300">
                    {m.senderIcon ? `${m.senderIcon} ` : ''}
                    {m.senderName}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                <p className={cn('mt-0.5 text-right text-[9px]', m.self ? 'text-amber-200/40' : 'text-white/30')}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-white/10 p-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          maxLength={500}
          placeholder={t('placeholder')}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => { void send() }}
          disabled={!draft.trim() || sending}
          aria-label={t('send')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  unread?: ChatUnread
  onRead?: () => void
}

/** Panneau de chat (bouton header) : onglet Partie (salle en cours) + onglet Amis (conversations privées). */
export function ChatPanel({ open, onClose, unread, onRead }: ChatPanelProps) {
  const t = useTranslations('chat')
  const tNav = useTranslations('nav')
  const { user } = useAuth()
  const { friends } = useFriends()
  const [tab, setTab] = useState<'game' | 'friends'>('game')
  const [friendId, setFriendId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setFriendId(null)
  }, [open])

  if (!user) return null

  const activeFriend = friends.find((f) => f.userId === friendId) ?? null

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
            aria-label={t('title')}
            className="fixed left-3 right-3 top-16 z-[61] mx-auto max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0c0b12]/98 shadow-2xl backdrop-blur-xl sm:left-16 sm:right-auto sm:top-[4.25rem] sm:w-96 sm:max-w-[24rem]"
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-br from-violet-600/15 to-transparent px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {activeFriend ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setFriendId(null)}
                      aria-label={t('back')}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h2 className="truncate text-sm font-bold text-white">{activeFriend.displayName}</h2>
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4 shrink-0 text-violet-300" />
                    <h2 className="text-sm font-bold text-white">{t('title')}</h2>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={tNav('closeMenu')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!activeFriend && (
              <div className="grid grid-cols-2 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setTab('game')}
                  className={cn(
                    'flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
                    tab === 'game'
                      ? 'border-b-2 border-violet-400 text-violet-200'
                      : 'text-white/40 hover:text-white/70'
                  )}
                >
                  <Gamepad2 className="h-3.5 w-3.5" />
                  {t('tabGame')}
                  {(unread?.room ?? 0) > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {unread!.room > 9 ? '9+' : unread!.room}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('friends')}
                  className={cn(
                    'flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
                    tab === 'friends'
                      ? 'border-b-2 border-violet-400 text-violet-200'
                      : 'text-white/40 hover:text-white/70'
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  {t('tabFriends')}
                  {Object.values(unread?.friends ?? {}).some((n) => n > 0) && (
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              </div>
            )}

            {activeFriend ? (
              <ChatConversation target={{ scope: 'friend', friendUserId: activeFriend.userId }} onRead={onRead} />
            ) : tab === 'game' ? (
              <ChatConversation target={{ scope: 'room' }} onRead={onRead} />
            ) : friends.length === 0 ? (
              <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-white/40">
                {t('noFriends')}
              </div>
            ) : (
              <ul className="max-h-[50vh] space-y-1 overflow-y-auto p-2">
                {[...friends]
                  .sort((a, b) => Number(b.isOnline) - Number(a.isOnline))
                  .map((f) => (
                    <li key={f.friendshipId}>
                      <button
                        type="button"
                        onClick={() => setFriendId(f.userId)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
                      >
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', f.isOnline ? 'bg-emerald-400' : 'bg-white/20')} />
                        <span className={cn('truncate text-sm font-medium', f.isOnline ? 'text-white' : 'text-white/60')}>
                          {f.displayName}
                        </span>
                        {(unread?.friends?.[f.userId] ?? 0) > 0 ? (
                          <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                            {unread!.friends[f.userId] > 9 ? '9+' : unread!.friends[f.userId]}
                          </span>
                        ) : (
                          <MessageCircle className="ml-auto h-3.5 w-3.5 shrink-0 text-white/25" />
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
