"use client"

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import { usePagePresence } from '@/hooks/usePagePresence'

const POLL_MS = 5000

export type PendingRoomInvite = {
  id: string
  roomId: string
  roomCode: string
  gameId: string | null
  hostDisplayName: string
  createdAt: string
}

/** Invitations de lobby reçues d'amis — poll léger, même pattern que useOpenLobbies. */
export function useFriendInvites() {
  const { user } = useAuth()
  const visible = usePagePresence()
  const [invites, setInvites] = useState<PendingRoomInvite[]>([])
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const fetchInvites = async () => {
      if (!user || user.playMode !== 'online') {
        setInvites([])
        setLoading(false)
        return
      }
      if (inFlightRef.current) return
      inFlightRef.current = true
      try {
        const res = await fetch('/api/online/friends/invites', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          const next = Array.isArray(data?.invites) ? data.invites : []
          setInvites((prev) => {
            const prevJson = JSON.stringify(prev)
            const nextJson = JSON.stringify(next)
            return prevJson === nextJson ? prev : next
          })
        }
      } finally {
        inFlightRef.current = false
        setLoading(false)
      }
    }

    if (!user || user.playMode !== 'online') {
      setInvites([])
      setLoading(false)
      return
    }

    // Onglet caché : sondage suspendu, repris avec un rafraîchissement
    // immédiat au retour au premier plan (voir usePagePresence).
    if (!visible) return

    void fetchInvites()
    pollRef.current = setInterval(fetchInvites, POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user?.id, user?.playMode, visible])

  const declineInvite = async (inviteId: string) => {
    setInvites((prev) => prev.filter((i) => i.id !== inviteId))
    await fetch(`/api/online/rooms/invites/${inviteId}/decline`, {
      method: 'POST',
      credentials: 'include',
    })
  }

  return { invites, loading, declineInvite }
}
