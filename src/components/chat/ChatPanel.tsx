"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Flag, Gamepad2, MessageCircle, Send, UserX, Users, X } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import type { Friend } from '@/hooks/useFriends'
import { usePagePresence } from '@/hooks/usePagePresence'
import type { ChatUnread } from '@/hooks/useChatUnread'
import { ReportDialog, type ReportTarget } from '@/components/chat/ReportDialog'
import { chatCursorQuery, mergeMessages } from '@/lib/chat-delta'
import { chatSendError } from '@/lib/chat-send-error'
import { cn } from '@/lib/utils'

/** Cadence conservée : une relève en delta ne coûte presque rien au repos. */
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

/**
 * Conversation (partie ou ami) : sondage léger tant qu'elle est affichée ET
 * que l'onglet est au premier plan. Chaque relève ne demande que le delta
 * derrière le dernier message connu, fondu dans la liste tenue en état.
 * À monter avec une `key` par cible : changer de conversation remonte le
 * composant, qui repart d'une liste vide et d'un chargement complet.
 */
function ChatConversation({
  target,
  onRead,
  onReport,
}: {
  target: ChatScope
  onRead?: () => void
  onReport: (report: ReportTarget) => void
}) {
  const t = useTranslations('chat')
  const tErrors = useTranslations('onlineLobby.errors')
  const visible = usePagePresence()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [noRoom, setNoRoom] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Envoi refusé (quota, ban, erreur réseau) : sans retour visible, le message
  // reste dans la zone de saisie sans explication.
  const [sendError, setSendError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inFlightRef = useRef(false)
  // Miroir de `messages` : le curseur se lit au moment de la requête sans
  // recréer `fetchMessages` (et relancer l'intervalle) à chaque message.
  const messagesRef = useRef<ChatMessage[]>([])

  const query =
    target.scope === 'room' ? 'scope=room' : `scope=friend&friend=${encodeURIComponent(target.friendUserId)}`

  const fetchMessages = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch(`/api/chat/messages?${query}${chatCursorQuery(messagesRef.current)}`, {
        credentials: 'include',
      })
      if (res.status === 404) {
        setNoRoom(true)
        messagesRef.current = []
        setMessages([])
        return
      }
      if (!res.ok) return
      setNoRoom(false)
      const data = await res.json()
      const incoming: ChatMessage[] = Array.isArray(data?.messages) ? data.messages : []
      // Rien de neuf : ni rendu, ni badge — le cas courant d'une relève.
      if (incoming.length === 0) return
      const merged = mergeMessages(messagesRef.current, incoming)
      // Tout déjà connu (recouvrement du curseur, cf. la route) : idem.
      if (merged === messagesRef.current) return
      messagesRef.current = merged
      setMessages(merged)
      // Le serveur vient de marquer la conversation lue → rafraîchit le badge.
      onRead?.()
    } finally {
      inFlightRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    // Onglet caché : sondage suspendu, repris avec une relève immédiate au
    // retour au premier plan (voir usePagePresence) — le curseur fait que
    // cette relève ne coûte que le delta accumulé pendant l'absence.
    if (!visible) return
    void fetchMessages()
    const timer = setInterval(fetchMessages, POLL_MS)
    return () => clearInterval(timer)
  }, [fetchMessages, visible])

  // Colle la liste en bas à chaque nouveau message.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)
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
        return
      }
      // Le brouillon est conservé pour un nouvel essai (voir chatSendError).
      const data = (await res.json().catch(() => null)) as { error?: unknown } | null
      const kind = chatSendError(res.status, data?.error)
      setSendError(
        kind === 'tooFast' ? t('tooFast') : kind === 'readOnly' ? tErrors('chat_read_only') : t('sendFailed')
      )
    } catch {
      setSendError(t('sendFailed'))
    } finally {
      setSending(false)
    }
  }

  if (noRoom) {
    return (
      <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-cream/70">
        {t('noRoom')}
      </div>
    )
  }

  return (
    <div className="flex h-[50vh] flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="pt-10 text-center text-sm text-cream/60">{t('empty')}</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn('flex', m.self ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3 py-2',
                  m.self
                    ? 'rounded-br-sm bg-gold/[0.18] text-cream'
                    : 'rounded-bl-sm bg-white/[0.07] text-cream'
                )}
              >
                {!m.self && (
                  <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold text-gold">
                    {m.senderIcon && (
                      <span aria-hidden>
                        <PlayerAvatarGlyph value={m.senderIcon} />
                      </span>
                    )}
                    {m.senderName}
                    {/* Seule prise de la victime sur un abus : un signalement
                        par message, à portée de pouce. */}
                    <button
                      type="button"
                      onClick={() =>
                        onReport({
                          messageId: m.id,
                          reportedUserId: m.senderId,
                          displayName: m.senderName,
                          scope: target.scope,
                          friendUserId:
                            target.scope === 'friend' ? target.friendUserId : undefined,
                        })
                      }
                      aria-label={t('report')}
                      title={t('report')}
                      className="touch-target ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-cream/60 transition-colors hover:bg-red-500/[0.15] hover:text-red-300"
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                <p className={cn('mt-0.5 text-right text-[11px] tabular-nums', m.self ? 'text-amber-100/70' : 'text-cream/60')}>
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      {sendError && (
        <p role="status" className="border-t border-gold/20 px-3 py-1.5 text-center text-xs text-red-300">
          {sendError}
        </p>
      )}
      <div className="flex items-center gap-2 border-t border-gold/20 p-2.5">
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (sendError) setSendError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          maxLength={500}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gold/20 bg-black/20 px-3 py-2 text-sm text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <button
          type="button"
          onClick={() => { void send() }}
          disabled={!draft.trim() || sending}
          aria-label={t('send')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-[#24201A] transition-colors hover:bg-amber-400 disabled:opacity-40"
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
  /**
   * Liste d'amis et son rafraîchissement, fournis par la Navbar : elle tient
   * déjà `useFriends()` pour son badge, un second abonnement ici doublait les
   * requêtes /api/friends au montage de chaque page.
   */
  friends: Friend[]
  refreshFriends: () => Promise<void> | void
}

/** Panneau de chat (bouton header) : onglet Partie (salle en cours) + onglet Amis (conversations privées). */
export function ChatPanel({ open, onClose, unread, onRead, friends, refreshFriends }: ChatPanelProps) {
  const t = useTranslations('chat')
  const tNav = useTranslations('nav')
  const { user } = useAuth()
  const tCommon = useTranslations('common')
  const [tab, setTab] = useState<'game' | 'friends'>('game')
  const [friendId, setFriendId] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [confirmBlockId, setConfirmBlockId] = useState<string | null>(null)
  const [blocking, setBlocking] = useState(false)

  useEffect(() => {
    if (!open) {
      setFriendId(null)
      setReportTarget(null)
      setConfirmBlockId(null)
    }
  }, [open])

  if (!user) return null

  const activeFriend = friends.find((f) => f.userId === friendId) ?? null

  /**
   * Blocage depuis la conversation : coupe l'amitié ET toute relance. On
   * revient à la liste, la conversation n'a plus lieu d'être.
   */
  const blockActiveFriend = async () => {
    if (!activeFriend || blocking) return
    setBlocking(true)
    try {
      const res = await fetch('/api/friends/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: activeFriend.userId }),
      })
      if (res.ok) {
        setConfirmBlockId(null)
        setFriendId(null)
        await refreshFriends()
      }
    } finally {
      setBlocking(false)
    }
  }

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
            className="fixed left-3 right-3 top-16 z-[61] mx-auto max-w-sm overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep/95 text-cream shadow-2xl backdrop-blur-xl sm:left-16 sm:right-auto sm:top-[4.25rem] sm:w-96 sm:max-w-[24rem]"
          >
            <div className="flex items-center justify-between border-b border-gold/20 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                {activeFriend ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setFriendId(null)}
                      aria-label={t('back')}
                      className="touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <h2 className="truncate text-sm font-bold text-cream">{activeFriend.displayName}</h2>
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-4 w-4 shrink-0 text-gold" />
                    <h2 className="font-display text-base font-bold text-cream">{t('title')}</h2>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {activeFriend && (
                  <button
                    type="button"
                    onClick={() => setConfirmBlockId(activeFriend.userId)}
                    aria-label={t('block')}
                    title={t('block')}
                    className="touch-target flex h-7 w-7 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-red-500/[0.15] hover:text-red-300"
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={tNav('closeMenu')}
                  className="touch-target flex h-7 w-7 items-center justify-center rounded-lg text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {confirmBlockId && activeFriend && (
              <div className="border-b border-red-400/20 bg-red-500/10 px-3 py-2.5">
                <p className="text-xs text-red-100">{t('blockConfirm')}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void blockActiveFriend()}
                    disabled={blocking}
                    className="min-h-[44px] flex-1 rounded-lg bg-suit-red py-1.5 text-xs font-bold text-cream transition-colors hover:bg-[#9E2F26] disabled:opacity-50"
                  >
                    {t('block')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBlockId(null)}
                    className="min-h-[44px] flex-1 rounded-lg border border-gold/25 bg-felt-deep/60 py-1.5 text-xs font-semibold text-cream transition-colors hover:bg-gold/10"
                  >
                    {tCommon('cancel')}
                  </button>
                </div>
              </div>
            )}

            {!activeFriend && (
              <div className="grid grid-cols-2 border-b border-gold/20">
                <button
                  type="button"
                  onClick={() => setTab('game')}
                  className={cn(
                    'flex min-h-[44px] items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
                    tab === 'game'
                      ? 'border-b-2 border-gold text-gold'
                      : 'border-b-2 border-transparent text-cream/70 hover:text-cream'
                  )}
                >
                  <Gamepad2 className="h-3.5 w-3.5" />
                  {t('tabGame')}
                  {(unread?.room ?? 0) > 0 && (
                    <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-suit-red px-1 text-[11px] font-bold tabular-nums text-cream">
                      {unread!.room > 9 ? '9+' : unread!.room}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab('friends')}
                  className={cn(
                    'flex min-h-[44px] items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors',
                    tab === 'friends'
                      ? 'border-b-2 border-gold text-gold'
                      : 'border-b-2 border-transparent text-cream/70 hover:text-cream'
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  {t('tabFriends')}
                  {Object.values(unread?.friends ?? {}).some((n) => n > 0) && (
                    <span className="h-2.5 w-2.5 rounded-full bg-suit-red" />
                  )}
                </button>
              </div>
            )}

            {/* `key` par cible : les deux conversations occupent le même
                emplacement, sans elle React réutiliserait l'instance (et sa
                liste) en passant d'un ami à la partie. */}
            {activeFriend ? (
              <ChatConversation
                key={`friend:${activeFriend.userId}`}
                target={{ scope: 'friend', friendUserId: activeFriend.userId }}
                onRead={onRead}
                onReport={setReportTarget}
              />
            ) : tab === 'game' ? (
              <ChatConversation
                key="room"
                target={{ scope: 'room' }}
                onRead={onRead}
                onReport={setReportTarget}
              />
            ) : friends.length === 0 ? (
              <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-cream/70">
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
                        className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gold/10"
                      >
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', f.isOnline ? 'bg-emerald-400' : 'bg-cream/30')} />
                        <span className={cn('truncate text-sm font-medium', f.isOnline ? 'text-cream' : 'text-cream/70')}>
                          {f.displayName}
                        </span>
                        {(unread?.friends?.[f.userId] ?? 0) > 0 ? (
                          <span className="ml-auto flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-suit-red px-1 text-[11px] font-bold tabular-nums text-cream">
                            {unread!.friends[f.userId] > 9 ? '9+' : unread!.friends[f.userId]}
                          </span>
                        ) : (
                          <MessageCircle aria-hidden className="ml-auto h-3.5 w-3.5 shrink-0 text-cream/40" />
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            )}

            {reportTarget && (
              <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
