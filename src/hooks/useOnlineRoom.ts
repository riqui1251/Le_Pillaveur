"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { RoomDto } from '@/lib/online-room'
import { parseApiJson } from '@/lib/api-response'
import { isOnlineGameFinished, parseOnlineGameState } from '@/lib/online-game-state'
import { useAuth } from '@/components/providers/AuthProvider'

/** Lobby en attente */
const POLL_LOBBY_MS = 2000
/** Partie en cours — en attente du tour adverse (filet de secours ; le SSE assure la réactivité) */
const POLL_PLAYING_WAIT_MS = 1500
/** Partie en cours — c'est notre tour (secours si push raté) */
const POLL_PLAYING_ACTIVE_MS = 1500

/**
 * TOUTE la logique salon (état, polling, SSE, actions) vit dans CE hook, mais
 * il n'est instancié qu'UNE fois — par OnlineRoomProvider. Les composants
 * consomment l'état PARTAGÉ via useOnlineRoom() (contexte). Historiquement
 * chaque composant avait sa propre instance : états divergents (lobby qui
 * restait affiché après le lancement), 4-6 pollings et flux SSE dupliqués.
 */
export function useOnlineRoomState() {
  const { user } = useAuth()
  const [room, setRoom] = useState<RoomDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const roomRef = useRef<RoomDto | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userIdRef = useRef<string | undefined>(undefined)

  roomRef.current = room
  userIdRef.current = user?.id

  const fetchRoom = useCallback(async () => {
    if (!user || user.playMode !== 'online') {
      setRoom(null)
      return null
    }
    try {
      const res = await fetch('/api/online/rooms/me', { credentials: 'include' })
      if (!res.ok) return null
      const data = await parseApiJson<{ room?: RoomDto }>(res)
      setRoom(data.room ?? null)
      return data.room as RoomDto | null
    } catch {
      // Raté réseau ponctuel : on retentera au tick de polling suivant.
      return null
    }
  }, [user])

  const refreshRoom = useCallback(async (roomId: string) => {
    try {
      const res = await fetch(`/api/online/rooms/${roomId}`, { credentials: 'include' })
      if (!res.ok) {
        // Salon quitté/supprimé : on purge l'état, sinon le polling boucle
        // en 403/404 sur l'ancien id jusqu'au rechargement de la page.
        if (res.status === 403 || res.status === 404) setRoom(null)
        return null
      }
      const data = await parseApiJson<{ room?: RoomDto }>(res)
      setRoom(data.room ?? null)
      return data.room as RoomDto | null
    } catch {
      return null
    }
  }, [])

  /** Polling léger — uniquement l'état de partie (plus rapide qu'un refresh complet) */
  const refreshGameState = useCallback(async (roomId: string) => {
    try {
      const res = await fetch(`/api/online/rooms/${roomId}/state`, { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) setRoom(null)
        return null
      }
      const data = await parseApiJson<{
        stateVersion: number
        currentTurnUserId: string | null
        gameStateJson: string | null
      }>(res)
      setRoom((prev) => {
        if (!prev || prev.id !== roomId) return prev
        if (
          prev.stateVersion === data.stateVersion &&
          prev.gameStateJson === data.gameStateJson &&
          prev.currentTurnUserId === data.currentTurnUserId
        ) {
          return prev
        }
        return {
          ...prev,
          stateVersion: data.stateVersion,
          gameStateJson: data.gameStateJson,
          currentTurnUserId: data.currentTurnUserId,
        }
      })
      return data
    } catch {
      return null
    }
  }, [])

  const getPollDelay = useCallback((r: RoomDto | null) => {
    if (!r || r.status !== 'playing') return POLL_LOBBY_MS
    const uid = userIdRef.current
    if (uid && r.currentTurnUserId && r.currentTurnUserId !== uid) {
      return POLL_PLAYING_WAIT_MS
    }
    return POLL_PLAYING_ACTIVE_MS
  }, [])

  const pollTick = useCallback(async () => {
    const r = roomRef.current
    if (r?.status === 'playing' && r.id) {
      const gameId = r.gameId ?? ''
      const state = gameId ? parseOnlineGameState(gameId, r.gameStateJson) : null
      const finished = state && gameId ? isOnlineGameFinished(gameId, state) : false
      if (finished) {
        await refreshRoom(r.id)
      } else {
        await refreshGameState(r.id)
      }
    } else if (r?.id) {
      await refreshRoom(r.id)
    } else {
      await fetchRoom()
    }
  }, [fetchRoom, refreshRoom, refreshGameState])

  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    const delay = getPollDelay(roomRef.current)
    pollTimerRef.current = setTimeout(async () => {
      // Un raté réseau ponctuel (Wi-Fi qui coupe, onglet mis en veille…) ne
      // doit JAMAIS arrêter la boucle : sans ce filet, une seule requête en
      // échec tue le polling pour le reste de la session (plus aucune mise à
      // jour tant que la page n'est pas rechargée manuellement).
      try {
        await pollTick()
      } catch {
        // Ignoré : on retente au prochain tick, à la cadence normale.
      } finally {
        schedulePoll()
      }
    }, delay)
  }, [getPollDelay, pollTick])

  const createRoom = useCallback(
    async (gameId: string, options?: { visibility?: 'public' | 'private' }) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/online/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ gameId, visibility: options?.visibility ?? 'private' }),
        })
        const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
        if (!res.ok) {
          setError(data.error ?? 'Impossible de créer le lobby')
          return null
        }
        setRoom(data.room ?? null)
        return data.room as RoomDto
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur réseau'
        setError(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const joinRoom = useCallback(async (opts: { code?: string; roomId?: string }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/online/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(opts),
      })
      const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
      if (!res.ok) {
        setError(data.error ?? 'Impossible de rejoindre le lobby')
        return null
      }
      setRoom(data.room ?? null)
      return data.room as RoomDto
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const leaveRoom = useCallback(async () => {
    if (!room) return
    await fetch(`/api/online/rooms/${room.id}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    setRoom(null)
  }, [room])

  const voteRematch = useCallback(async () => {
    if (!room) return null
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/online/rooms/${room.id}/rematch`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
      if (!res.ok) {
        setError(data.error ?? 'Impossible de voter pour rejouer')
        return null
      }
      setRoom(data.room ?? null)
      return data.room as RoomDto
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [room])

  const setReady = useCallback(async (isReady: boolean) => {
    if (!room) return
    const res = await fetch(`/api/online/rooms/${room.id}/ready`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isReady }),
    })
    const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
    if (res.ok) setRoom(data.room ?? null)
    else setError(data.error ?? 'Erreur')
  }, [room])

  const launchGame = useCallback(async () => {
    if (!room) return null
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/online/rooms/${room.id}/launch`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
      if (!res.ok) {
        setError(data.error ?? 'Impossible de lancer la partie')
        return null
      }
      setRoom(data.room ?? null)
      return data.room as RoomDto
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau'
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [room])

  const updateSettings = useCallback(
    async (settings: {
      difficulty?: string
      plinkoDifficulty?: string
      hiLoMode?: 'standard' | 'traversee'
      visibility?: 'public' | 'private' | 'invite'
      tcMode?: '1v1' | '2v2' | '3v3' | '4v4'
      tcPowerups?: boolean
      quizCount?: number
      lgDebateMin?: number
      lgExtraWolf?: boolean
      botsCount?: number
      menteurPalifico?: boolean
      menteurCalza?: boolean
      imposteurCount?: number
      bluffRounds?: number
      espionDiscussionMin?: number
      espionRoundsToWin?: number
      tabouTargetScore?: number
      crobardRounds?: number
      sfRounds?: number
      dilRounds?: number
      pbcRounds?: number
    }) => {
      if (!room) return null
      const res = await fetch(`/api/online/rooms/${room.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      })
      const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
      if (res.ok) {
        setRoom(data.room ?? null)
        return data.room as RoomDto
      }
      setError(data.error ?? 'Erreur')
      return null
    },
    [room]
  )

  const setTeam = useCallback(
    async (team: 'A' | 'B') => {
      if (!room) return null
      const res = await fetch(`/api/online/rooms/${room.id}/team`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ team }),
      })
      const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
      if (res.ok) {
        setRoom(data.room ?? null)
        return data.room as RoomDto
      }
      setError(data.error ?? 'Erreur')
      return null
    },
    [room]
  )

  const inviteFriend = useCallback(
    async (friendUserId: string) => {
      if (!room) return false
      setError(null)
      const res = await fetch(`/api/online/rooms/${room.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ friendUserId }),
      })
      const data = await parseApiJson<{ error?: string }>(res)
      if (!res.ok) {
        setError(data.error ?? "Impossible d'inviter cet ami")
        return false
      }
      return true
    },
    [room]
  )

  const pushGameState = useCallback(
    async (gameStateJson: string, expectedVersion: number) => {
      if (!room) return false
      const res = await fetch(`/api/online/rooms/${room.id}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          gameStateJson,
          expectedVersion,
          pushedByUserId: room.members.find((m) => m.isSelf)?.userId,
        }),
      })
      const data = await parseApiJson<{ room?: RoomDto }>(res)
      if (res.ok) {
        setRoom(data.room ?? null)
        return true
      }
      if (res.status === 409) {
        await refreshGameState(room.id)
      }
      return false
    },
    [room, refreshGameState]
  )

  useEffect(() => {
    if (!user || user.playMode !== 'online') {
      setRoom(null)
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      return
    }

    void fetchRoom().then(() => schedulePoll())

    const onVisible = () => {
      if (document.visibilityState === 'visible') void pollTick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, user?.playMode, fetchRoom, schedulePoll, pollTick])

  /** Ré-accélère le polling quand le tour ou le statut change */
  useEffect(() => {
    if (!user || user.playMode !== 'online') return
    schedulePoll()
  }, [room?.status, room?.currentTurnUserId, room?.stateVersion, user, user?.playMode, schedulePoll])

  /** Temps réel : SSE pousse les changements ; on rafraîchit immédiatement (polling = secours) */
  useEffect(() => {
    const roomId = room?.id
    if (!roomId || !user || user.playMode !== 'online') return
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

    const es = new EventSource(`/api/online/rooms/${roomId}/stream`)
    const onEvent = () => {
      void pollTick()
    }
    es.addEventListener('changed', onEvent)
    es.addEventListener('lobby', onEvent)
    es.addEventListener('finished', onEvent)

    return () => {
      es.close()
    }
  }, [room?.id, user, user?.playMode, pollTick])

  return {
    room,
    loading,
    error,
    setError,
    createRoom,
    joinRoom,
    leaveRoom,
    voteRematch,
    setReady,
    launchGame,
    updateSettings,
    setTeam,
    inviteFriend,
    pushGameState,
    fetchRoom,
    refreshRoom,
    refreshGameState,
  }
}

export type OnlineRoomApi = ReturnType<typeof useOnlineRoomState>

export const OnlineRoomContext = createContext<OnlineRoomApi | null>(null)

/** État salon PARTAGÉ (une seule instance, fournie par OnlineRoomProvider). */
export function useOnlineRoom(): OnlineRoomApi {
  const ctx = useContext(OnlineRoomContext)
  if (!ctx) {
    throw new Error('useOnlineRoom doit être utilisé sous <OnlineRoomProvider>')
  }
  return ctx
}
