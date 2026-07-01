"use client"

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'

export type Friend = {
  friendshipId: string
  userId: string
  displayName: string
  accountCode: string | null
  isOnline: boolean
}

export type FriendRequest = {
  id: string
  userId: string
  displayName: string
  accountCode: string | null
  createdAt: string
}

/**
 * Amis + demandes en attente pour la page Compte. Pas de polling — page de
 * gestion, pas d'écran temps-réel — on rafraîchit manuellement après chaque
 * mutation, comme `saveOnlineName` dans AccountInfo.tsx.
 */
export function useFriends() {
  const { user } = useAuth()
  const [friends, setFriends] = useState<Friend[]>([])
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setFriends([])
      setIncoming([])
      setOutgoing([])
      setLoading(false)
      return
    }
    const [friendsRes, requestsRes] = await Promise.all([
      fetch('/api/friends', { credentials: 'include' }),
      fetch('/api/friends/requests', { credentials: 'include' }),
    ])
    if (friendsRes.ok) {
      const data = await friendsRes.json()
      setFriends(Array.isArray(data?.friends) ? data.friends : [])
    }
    if (requestsRes.ok) {
      const data = await requestsRes.json()
      setIncoming(Array.isArray(data?.incoming) ? data.incoming : [])
      setOutgoing(Array.isArray(data?.outgoing) ? data.outgoing : [])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const sendRequest = useCallback(
    async (accountCode: string) => {
      setError(null)
      const res = await fetch('/api/friends/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accountCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Erreur')
        return null
      }
      await refresh()
      return data.status as 'sent' | 'auto-accepted' | 'already-friends' | 'already-pending'
    },
    [refresh]
  )

  const acceptRequest = useCallback(
    async (requestId: string) => {
      setError(null)
      const res = await fetch(`/api/friends/requests/${requestId}/accept`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erreur')
        return false
      }
      await refresh()
      return true
    },
    [refresh]
  )

  const declineRequest = useCallback(
    async (requestId: string) => {
      setError(null)
      const res = await fetch(`/api/friends/requests/${requestId}/decline`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erreur')
        return false
      }
      await refresh()
      return true
    },
    [refresh]
  )

  const removeFriend = useCallback(
    async (friendshipId: string) => {
      setError(null)
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) return false
      await refresh()
      return true
    },
    [refresh]
  )

  return { friends, incoming, outgoing, loading, error, sendRequest, acceptRequest, declineRequest, removeFriend, refresh }
}
