"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'

const POLL_MS = 10000

export type ChatUnread = {
  total: number
  room: number
  friends: Record<string, number>
}

const EMPTY: ChatUnread = { total: 0, room: 0, friends: {} }

/** Compteur de messages de chat non lus (badge du header) — poll léger. */
export function useChatUnread() {
  const { user } = useAuth()
  const [unread, setUnread] = useState<ChatUnread>(EMPTY)
  const inFlightRef = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch('/api/chat/unread', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setUnread({
          total: data?.total ?? 0,
          room: data?.room ?? 0,
          friends: data?.friends ?? {},
        })
      }
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setUnread(EMPTY)
      return
    }
    void refresh()
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [user?.id, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  return { unread, refresh }
}
