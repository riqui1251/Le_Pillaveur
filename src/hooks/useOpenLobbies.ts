"use client"

import { useEffect, useRef, useState } from 'react'
import type { LiveGameItem, LobbyListItem } from '@/lib/online-room'
import type { RecentLaunchItem } from '@/lib/online/game-sessions'
import { useAuth } from '@/components/providers/AuthProvider'
import { usePagePresence } from '@/hooks/usePagePresence'

const POLL_MS = 4000

export function useOpenLobbies() {
  const { user } = useAuth()
  const visible = usePagePresence()
  const [lobbies, setLobbies] = useState<LobbyListItem[]>([])
  // Parties en cours : détail des tables PUBLIQUES, et total anonyme (toutes
  // visibilités) — une table privée ne se voit que dans ce compteur.
  const [liveGames, setLiveGames] = useState<LiveGameItem[]>([])
  const [liveGamesTotal, setLiveGamesTotal] = useState(0)
  // Dernières parties LANCÉES (journal, 10 max) : la table privée y est
  // anonyme — voir summarizeRecentLaunches.
  const [recentLaunches, setRecentLaunches] = useState<RecentLaunchItem[]>([])
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const initializedRef = useRef(false)
  const inFlightRef = useRef(false)

  useEffect(() => {
    const fetchLobbies = async () => {
      if (!user || user.playMode !== 'online') {
        setLobbies([])
        setLiveGames([])
        setLiveGamesTotal(0)
        setRecentLaunches([])
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
          // Même garde d'identité que pour les lobbys : le poll tourne toutes
          // les 4 s, on évite de re-rendre le guichet quand rien n'a bougé.
          const nextLive = Array.isArray(data?.liveGames) ? data.liveGames : []
          setLiveGames((prev) => (JSON.stringify(prev) === JSON.stringify(nextLive) ? prev : nextLive))
          setLiveGamesTotal(typeof data?.liveGamesTotal === 'number' ? data.liveGamesTotal : 0)
          const nextRecent = Array.isArray(data?.recentLaunches) ? data.recentLaunches : []
          setRecentLaunches((prev) =>
            JSON.stringify(prev) === JSON.stringify(nextRecent) ? prev : nextRecent
          )
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
      setLiveGames([])
      setLiveGamesTotal(0)
      setRecentLaunches([])
      setLoading(false)
      initializedRef.current = true
      return
    }

    // Onglet caché : on ne sonde plus. L'effet est relancé au retour au
    // premier plan (`visible` est une dépendance), donc avec un
    // rafraîchissement immédiat — voir usePagePresence.
    if (!visible) return

    void fetchLobbies()
    pollRef.current = setInterval(fetchLobbies, POLL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user?.id, user?.playMode, visible])

  const refresh = async () => {
    if (!user || user.playMode !== 'online' || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch('/api/online/lobbies', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setLobbies(Array.isArray(data?.lobbies) ? data.lobbies : [])
        setLiveGames(Array.isArray(data?.liveGames) ? data.liveGames : [])
        setLiveGamesTotal(typeof data?.liveGamesTotal === 'number' ? data.liveGamesTotal : 0)
        setRecentLaunches(Array.isArray(data?.recentLaunches) ? data.recentLaunches : [])
      }
    } finally {
      inFlightRef.current = false
    }
  }

  return { lobbies, liveGames, liveGamesTotal, recentLaunches, loading, refresh }
}
