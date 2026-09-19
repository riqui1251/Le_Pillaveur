"use client"

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import { usePagePresence } from '@/hooks/usePagePresence'

/**
 * Cadence du sondage. Il tournait à 5 s : deuxième poste de requêtes du hub
 * connecté (derrière le sondage de salle, cf. online-room-polling), pour un
 * événement rare — l'invitation d'un ami. À 15 s, trois fois moins de
 * requêtes par joueur resté sur /jeux ou en lobby un samedi soir. Le prix :
 * une invitation reçue met au pire 15 s à apparaître au lieu de 5, ce qui
 * reste acceptable — l'invité ne fixe pas l'écran en l'attendant, et l'hôte
 * a de toute façon le code de table à donner de vive voix ou par le chat.
 * Sondage suspendu onglet caché, repris avec un rafraîchissement immédiat au
 * retour (usePagePresence, ci-dessous) : le retour sur la page ne paie pas
 * ces 15 s.
 */
const POLL_MS = 15_000

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
  // Le sondage ne dépend que de l'identité et du mode de jeu : l'objet `user`
  // change de référence à chaque rafraîchissement de session, pas ces deux-là.
  const userId = user?.id
  const playMode = user?.playMode
  const visible = usePagePresence()
  const [invites, setInvites] = useState<PendingRoomInvite[]>([])
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const fetchInvites = async () => {
      if (!userId || playMode !== 'online') {
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

    if (!userId || playMode !== 'online') {
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
  }, [userId, playMode, visible])

  const declineInvite = async (inviteId: string) => {
    setInvites((prev) => prev.filter((i) => i.id !== inviteId))
    await fetch(`/api/online/rooms/invites/${inviteId}/decline`, {
      method: 'POST',
      credentials: 'include',
    })
  }

  return { invites, loading, declineInvite }
}
