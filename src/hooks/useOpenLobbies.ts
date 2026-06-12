"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LobbyListItem } from '@/lib/online-room'
import { useAuth } from '@/components/providers/AuthProvider'

const POLL_MS = 4000

export function useOpenLobbies() {
  const { user } = useAuth()
  const [lobbies, setLobbies] = useState<LobbyListItem[]>([])
  const [loading, setLoading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLobbies = useCallback(async () => {
    if (!user || user.playMode !== 'online') {
      setLobbies([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/online/lobbies', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setLobbies(Array.isArray(data.lobbies) ? data.lobbies : [])
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user || user.playMode !== 'online') {
      setLobbies([])
      return
    }

    fetchLobbies()
    pollRef.current = setInterval(fetchLobbies, POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user, user?.playMode, fetchLobbies])

  return { lobbies, loading, refresh: fetchLobbies }
}
