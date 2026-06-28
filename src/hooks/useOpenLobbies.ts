"use client"

import { useEffect, useRef, useState } from 'react'
import type { LobbyListItem } from '@/lib/online-room'
import { useAuth } from '@/components/providers/AuthProvider'

const POLL_MS = 4000

export function useOpenLobbies() {
  const { user } = useAuth()
  const [lobbies, setLobbies] = useState<LobbyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const initializedRef = useRef(false)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const fetchLobbies = async () => {
      if (!user || user.playMode !== 'online') {
        setLobbies([])
        setLoading(false)
        initializedRef.current = true
        return
      }
      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const res = await fetch('/api/online/lobbies', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          const next = Array.isArray(data?.lobbies) ? data.lobbies : []
          setLobbies((prev) => {
            const prevJson = JSON.stringify(prev)
            const nextJson = JSON.stringify(next)
            return prevJson === nextJson ? prev : next
          })
        }
      } finally {
        inFlightRef.current = false
        if (!initializedRef.current) {
          initializedRef.current = true
          setLoading(false)
        }
      }
    }

    if (!user || user.playMode !== 'online') {
      setLobbies([])
      setLoading(false)
      initializedRef.current = true
      return
    }

    void fetchLobbies()
    pollRef.current = setInterval(fetchLobbies, POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user?.id, user?.playMode])

  const refresh = async () => {
    if (!user || user.playMode !== 'online' || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch('/api/online/lobbies', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setLobbies(Array.isArray(data?.lobbies) ? data.lobbies : [])
      }
    } finally {
      inFlightRef.current = false
    }
  }

  return { lobbies, loading, refresh }
}
