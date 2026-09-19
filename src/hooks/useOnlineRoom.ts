"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { RoomDto } from '@/lib/online-room'
import { parseApiJson } from '@/lib/api-response'
import { resolveOnlineErrorCode } from '@/lib/online-errors'
import { isOnlineGameFinished, parseOnlineGameState } from '@/lib/online-game-state'
import { useAuth } from '@/components/providers/AuthProvider'
import { usePagePresence } from '@/hooks/usePagePresence'
import {
  DEFERRED_REFRESH_MAX_MS,
  mergePolledState,
  mergeServerView,
  pollDelayMs,
  roomEventDecision,
  STREAM_WATCHDOG_MS,
  type ServerView,
} from '@/hooks/online-room-polling'

// Cadences de sondage, tri des événements SSE et garde de version : logique
// pure dans ./online-room-polling.ts (testée sans React ni réseau).

/**
 * TOUTE la logique salon (état, polling, SSE, actions) vit dans CE hook, mais
 * il n'est instancié qu'UNE fois — par OnlineRoomProvider. Les composants
 * consomment l'état PARTAGÉ via useOnlineRoom() (contexte). Historiquement
 * chaque composant avait sa propre instance : états divergents (lobby qui
 * restait affiché après le lancement), 4-6 pollings et flux SSE dupliqués.
 */
export function useOnlineRoomState() {
  const { user } = useAuth()
  const t = useTranslations('onlineLobby.errors')
  const [room, setRoom] = useState<RoomDto | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const roomRef = useRef<RoomDto | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userIdRef = useRef<string | undefined>(undefined)
  /**
   * Salle que le joueur quitte VOLONTAIREMENT. Le polling l'ignore : sinon un
   * tick parti avant le DELETE la fait réapparaître juste après le départ, ou
   * annonce sa disparition alors que le joueur a lui-même cliqué « Quitter ».
   * Le verrou tombe dès qu'on y entre à nouveau (createRoom/joinRoom, ou
   * /rooms/me qui nous y remet) — sans quoi cette salle ne serait plus jamais
   * rafraîchie de la session.
   */
  const leavingRoomIdRef = useRef<string | null>(null)
  /**
   * Le flux SSE est-il VIVANT (événement `ready` reçu, aucune erreur depuis) ?
   * C'est lui qui décide de la cadence du sondage : filet lâche tant qu'il
   * porte le temps réel, cadence serrée dès qu'il tombe (cf. pollDelayMs).
   */
  const streamAliveRef = useRef(false)
  /**
   * Le sondage est-il autorisé (mode online ET page visible) ? Les handlers
   * du flux replanifient le sondage à chaque bascule vivant/mort : sans ce
   * verrou, une reconnexion SSE relancerait la boucle sur un onglet caché.
   */
  const pollEnabledRef = useRef(false)
  /**
   * Version d'état connue, tenue à jour de façon SYNCHRONE — `room` ne l'est
   * qu'au rendu suivant. L'écho SSE d'une action et la réponse de cette action
   * arrivent à quelques millisecondes d'écart : comparer à l'état rendu, c'est
   * redemander un état qu'on vient d'appliquer.
   */
  const knownVersionRef = useRef<number | null>(null)
  /** Actions joueur en vol (POST /action), cf. beginGameAction/endGameAction. */
  const actionsInFlightRef = useRef(0)
  /**
   * `changed` reçu pendant une action en vol : rafraîchissement mis en attente
   * de la réponse (qui porte la vue), borné par DEFERRED_REFRESH_MAX_MS.
   */
  const deferredRefreshRef = useRef<{
    stateVersion: number
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  /**
   * Numéros de séquence de refreshRoom : le dernier PARTI et le dernier
   * APPLIQUÉ. Un GET /rooms/{id} parti avant une relance et revenu après
   * celui que son `changed` a déclenché réécrivait la partie terminée (v9)
   * par-dessus la nouvelle (v1) — et le tick qui corrigeait ça est passé de
   * 1,5 s à 15 s. Comparer les versions ne suffit pas : la relance repart à
   * 1, le DTO périmé porte la version la plus GRANDE. Dernier parti gagne.
   */
  const roomRefreshSeqRef = useRef(0)
  const roomRefreshAppliedRef = useRef(0)

  roomRef.current = room
  userIdRef.current = user?.id
  knownVersionRef.current = room?.stateVersion ?? null

  /** Traduit le code d'erreur renvoyé par l'API (onlineLobby.errors) ;
   *  texte brut si valeur inconnue, clé de secours si champ absent.
   *  `count` accompagne les codes à trou (bornes de joueurs du lancement). */
  const apiError = useCallback(
    (raw: string | undefined, fallbackKey: string, count?: number) => {
      const code = resolveOnlineErrorCode(raw)
      if (code) return t(code, count === undefined ? undefined : { count })
      return raw ?? t(fallbackKey)
    },
    [t]
  )

  const fetchRoom = useCallback(async () => {
    if (!user || user.playMode !== 'online') {
      setRoom(null)
      return null
    }
    try {
      const res = await fetch('/api/online/rooms/me', { credentials: 'include' })
      if (!res.ok) return null
      const data = await parseApiJson<{ room?: RoomDto }>(res)
      // Le serveur nous remet dans la salle qu'on venait de quitter (retour
      // depuis un autre appareil, invitation acceptée) : le verrou de départ
      // doit tomber, sinon le polling de CETTE salle resterait figé pour de
      // bon — plus aucune mise à jour jusqu'au rechargement de la page.
      if (data.room && leavingRoomIdRef.current === data.room.id) {
        leavingRoomIdRef.current = null
      }
      setRoom(data.room ?? null)
      return data.room as RoomDto | null
    } catch {
      // Raté réseau ponctuel : on retentera au tick de polling suivant.
      return null
    }
  }, [user])

  /**
   * 403/404 sur la salle courante : on purge l'état, sinon le polling boucle
   * sur l'ancien id jusqu'au rechargement de la page. Et on DIT pourquoi — la
   * table disparaissait sans un mot et le joueur croyait à un bug. Les deux
   * codes ne racontent PAS la même histoire : 404 = la salle n'existe plus
   * (hôte parti, ménage des salles abandonnées), 403 = elle existe mais on n'en
   * est plus membre (exclusion, départ depuis un autre appareil) — annoncer
   * « table fermée » dans ce cas-là serait faux. Un 403 EN PLEINE PARTIE vient
   * presque toujours du remplacement pour inactivité : on le dit, sinon le
   * joueur revient au guichet sans rien comprendre. Reste le cas rare d'un
   * départ déclenché depuis un autre appareil, où le message est approximatif
   * — le serveur ne distingue pas les deux aujourd'hui.
   */
  const handleRoomGone = useCallback(
    (status: number) => {
      const replacedByBot = status === 403 && roomRef.current?.status === 'playing'
      setRoom(null)
      setError(
        status === 404
          ? t('roomClosed')
          : replacedByBot
            ? t('replaced_by_bot')
            : t('roomLeft')
      )
    },
    [t]
  )

  const refreshRoom = useCallback(async (roomId: string) => {
    if (leavingRoomIdRef.current === roomId) return null
    const seq = ++roomRefreshSeqRef.current
    /** Un refreshRoom plus récent a déjà répondu : cette réponse est périmée. */
    const superseded = () => seq < roomRefreshAppliedRef.current
    try {
      const res = await fetch(`/api/online/rooms/${roomId}`, { credentials: 'include' })
      if (leavingRoomIdRef.current === roomId) return null
      if (superseded()) return null
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) {
          roomRefreshAppliedRef.current = seq
          handleRoomGone(res.status)
        }
        return null
      }
      const data = await parseApiJson<{ room?: RoomDto }>(res)
      // Relu après la lecture du corps : un plus récent a pu répondre entre-temps.
      if (superseded()) return null
      roomRefreshAppliedRef.current = seq
      setRoom(data.room ?? null)
      return data.room as RoomDto | null
    } catch {
      return null
    }
  }, [handleRoomGone])

  /** Polling léger — uniquement l'état de partie (plus rapide qu'un refresh complet) */
  const refreshGameState = useCallback(async (roomId: string) => {
    if (leavingRoomIdRef.current === roomId) return null
    // Version connue AU DÉPART de la requête : si elle a bougé à l'arrivée,
    // la réponse a pu se faire doubler (cf. mergePolledState).
    const knownAtRequest = knownVersionRef.current
    try {
      const res = await fetch(`/api/online/rooms/${roomId}/state`, { credentials: 'include' })
      if (leavingRoomIdRef.current === roomId) return null
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) handleRoomGone(res.status)
        return null
      }
      const data = await parseApiJson<{
        stateVersion: number
        currentTurnUserId: string | null
        gameStateJson: string | null
      }>(res)
      // La version connue suit tout de suite (sans attendre le rendu) : la
      // trame SSE de cet état peut arriver juste derrière la réponse.
      if (mergePolledState(roomRef.current, roomId, data, knownAtRequest) !== roomRef.current) {
        knownVersionRef.current = data.stateVersion
      }
      setRoom((prev) => mergePolledState(prev, roomId, data, knownAtRequest))
      return data
    } catch {
      return null
    }
  }, [handleRoomGone])

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

  /**
   * Sondage déclenché par un ÉVÉNEMENT (flux SSE, attente soldée) — jamais
   * sur un onglet caché : le sondage y est suspendu (pollEnabledRef), et le
   * retour au premier plan refait un fetchRoom complet qui rattrape tout.
   * Sans ce verrou, chaque coup de bot poussé par le flux coûtait un GET à
   * un téléphone dans la poche — celui-là même que la boucle suspendue
   * économisait.
   */
  const pollTickIfVisible = useCallback(() => {
    if (!pollEnabledRef.current) return
    void pollTick()
  }, [pollTick])

  /**
   * (Re)planifie le prochain tick. Appelé à chaque changement de salle, de
   * tour, de version — et à chaque bascule du flux SSE : la cadence est relue
   * ICI, donc un flux qui tombe ramène le sondage à 1,5 s tout de suite, sans
   * attendre la fin d'un délai de 15 s.
   */
  const schedulePoll = useCallback(() => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    if (!pollEnabledRef.current) return
    const delay = pollDelayMs(roomRef.current, userIdRef.current, streamAliveRef.current)
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
  }, [pollTick])

  /**
   * Rafraîchissement mis en attente pendant une action : on le solde — par un
   * sondage si la version annoncée n'est toujours pas celle qu'on connaît
   * (l'événement n'était pas l'écho de notre action), par rien sinon.
   */
  const resolveDeferredRefresh = useCallback(() => {
    const deferred = deferredRefreshRef.current
    if (!deferred) return
    clearTimeout(deferred.timer)
    deferredRefreshRef.current = null
    if (deferred.stateVersion !== knownVersionRef.current) pollTickIfVisible()
  }, [pollTickIfVisible])

  /**
   * Applique une vue renvoyée par le serveur (réponse de POST /action), sans
   * repasser par GET /state. Même garde de version que le sondage : jamais de
   * retour en arrière (cf. mergeServerView). La version connue est relevée
   * tout de suite pour que l'écho SSE de cette action soit reconnu comme tel.
   */
  const applyServerView = useCallback((view: ServerView) => {
    if (leavingRoomIdRef.current === view.roomId) return
    if (mergeServerView(roomRef.current, view) !== roomRef.current) {
      knownVersionRef.current = view.stateVersion
    }
    setRoom((prev) => mergeServerView(prev, view))
  }, [])

  /**
   * Encadrement d'une action joueur (useGameAction). Entre les deux appels,
   * un `changed` du flux n'est pas sondé mais mis en attente : c'est presque
   * toujours l'écho de l'action, et sa réponse apporte la vue. À la fin, la
   * vue est appliquée (si la réponse en porte une) et l'attente est soldée.
   */
  const beginGameAction = useCallback(() => {
    actionsInFlightRef.current += 1
  }, [])

  const endGameAction = useCallback(
    (view: ServerView | null) => {
      actionsInFlightRef.current = Math.max(0, actionsInFlightRef.current - 1)
      if (view) applyServerView(view)
      if (actionsInFlightRef.current === 0) resolveDeferredRefresh()
    },
    [applyServerView, resolveDeferredRefresh]
  )

  const createRoom = useCallback(
    async (gameId: string, options?: { visibility?: 'public' | 'private' }) => {
      // Nouvelle table : le verrou de départ n'a plus lieu d'être (sinon un
      // retour dans une salle de même id resterait figé, jamais rafraîchi).
      leavingRoomIdRef.current = null
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
          setError(apiError(data.error, 'createFailed'))
          return null
        }
        setRoom(data.room ?? null)
        return data.room as RoomDto
      } catch {
        setError(t('network'))
        return null
      } finally {
        setLoading(false)
      }
    },
    [apiError, t]
  )

  const joinRoom = useCallback(async (opts: { code?: string; roomId?: string }) => {
    leavingRoomIdRef.current = null
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
        setError(apiError(data.error, 'joinFailed'))
        return null
      }
      setRoom(data.room ?? null)
      return data.room as RoomDto
    } catch {
      setError(t('network'))
      return null
    } finally {
      setLoading(false)
    }
  }, [apiError, t])

  const leaveRoom = useCallback(async () => {
    if (!room) return
    const roomId = room.id
    leavingRoomIdRef.current = roomId
    setError(null)
    try {
      const res = await fetch(`/api/online/rooms/${roomId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        // On ne vide l'état QUE si le serveur a bien enregistré le départ :
        // avant, un échec réseau vidait quand même la salle, puis le poll
        // (2 s) la faisait revenir — le joueur croyait ne pas pouvoir partir.
        leavingRoomIdRef.current = null
        const data = await parseApiJson<{ error?: string }>(res)
        setError(apiError(data.error, 'generic'))
        return
      }
      setRoom(null)
      // Le verrou n'est PAS levé ici : une requête de polling partie avant le
      // DELETE peut encore répondre 200 (salle vue avant le départ) et la
      // ressusciter. Il tombe quand le serveur nous rend cette salle dans
      // /rooms/me — c.-à-d. quand on y est vraiment de nouveau (cf. fetchRoom).
    } catch {
      leavingRoomIdRef.current = null
      setError(t('network'))
    }
  }, [room, apiError, t])

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
        setError(apiError(data.error, 'rematchFailed'))
        return null
      }
      setRoom(data.room ?? null)
      return data.room as RoomDto
    } catch {
      setError(t('network'))
      return null
    } finally {
      setLoading(false)
    }
  }, [room, apiError, t])

  const setReady = useCallback(async (isReady: boolean) => {
    if (!room) return
    try {
      const res = await fetch(`/api/online/rooms/${room.id}/ready`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isReady }),
      })
      const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
      if (res.ok) setRoom(data.room ?? null)
      else setError(apiError(data.error, 'generic'))
    } catch {
      // Sans ce filet, une coupure réseau remontait en rejet non capturé
      // (le clic « Prêt » ne dit rien et la case reste dans l'état d'avant).
      setError(t('network'))
    }
  }, [room, apiError, t])

  const launchGame = useCallback(async () => {
    if (!room) return null
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/online/rooms/${room.id}/launch`, {
        method: 'POST',
        credentials: 'include',
      })
      // `count` : borne de joueurs renvoyée par la route de lancement
      // (min_players / max_players), traduite ici avec le bon nombre.
      const data = await parseApiJson<{ room?: RoomDto; error?: string; count?: number }>(res)
      if (!res.ok) {
        setError(apiError(data.error, 'launchFailed', data.count))
        return null
      }
      setRoom(data.room ?? null)
      return data.room as RoomDto
    } catch {
      setError(t('network'))
      return null
    } finally {
      setLoading(false)
    }
  }, [room, apiError, t])

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
      dilCoquin?: boolean
      pbcRounds?: number
      preManches?: number
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
      setError(apiError(data.error, 'generic'))
      return null
    },
    [room, apiError]
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
      setError(apiError(data.error, 'generic'))
      return null
    },
    [room, apiError]
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
        setError(apiError(data.error, 'inviteFailed'))
        return false
      }
      return true
    },
    [room, apiError]
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

  /**
   * Onglet en arrière-plan (ou téléphone dans la poche) : le sondage est
   * SUSPENDU. Personne ne regarde, et le SSE — qui reste ouvert — rattrapera
   * de toute façon ce qui a bougé. Même mécanisme que les sondages du header
   * (voir usePagePresence) : la visibilité fait partie des dépendances de
   * l'effet, donc le retour au premier plan relance un rafraîchissement
   * immédiat avant de reprendre la boucle.
   */
  const visible = usePagePresence()

  useEffect(() => {
    if (!user || user.playMode !== 'online' || !visible) {
      if (!user || user.playMode !== 'online') setRoom(null)
      pollEnabledRef.current = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      return
    }

    pollEnabledRef.current = true
    void fetchRoom().then(() => schedulePoll())

    return () => {
      // Le verrou tombe AVANT le timer : un fetchRoom encore en vol ne doit
      // pas replanifier un tick sur un onglet passé en arrière-plan.
      pollEnabledRef.current = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [user, user?.playMode, visible, fetchRoom, schedulePoll])

  /** Ré-accélère le polling quand le tour ou le statut change */
  useEffect(() => {
    if (!user || user.playMode !== 'online' || !visible) return
    schedulePoll()
  }, [room?.status, room?.currentTurnUserId, room?.stateVersion, user, user?.playMode, visible, schedulePoll])

  /**
   * Temps réel : SSE pousse les changements ; on rafraîchit immédiatement
   * (polling = secours). La route émet `ready` en premier, puis `changed` /
   * `lobby` / `finished` (data = RoomEvent en JSON), et un événement `ping`
   * toutes les STREAM_HEARTBEAT_MS (cf. api/online/rooms/[roomId]/stream).
   * Onglet caché, aucun handler ne sonde (cf. pollTickIfVisible).
   */
  useEffect(() => {
    const roomId = room?.id
    if (!roomId || !user || user.playMode !== 'online') return
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

    const es = new EventSource(`/api/online/rooms/${roomId}/stream`)
    // Le flux a-t-il été perdu depuis la dernière ouverture ? Une reconnexion
    // n'a pas de rattrapage côté serveur (pas de Last-Event-ID) : ce qui a
    // bougé entre le dernier sondage serré et le `ready` serait perdu.
    let lost = false
    // Chien de garde : un flux « zombie » (Wi-Fi → 4G, coupure TCP que l'OS
    // met des minutes à voir) ne produit ni `error` ni événement. Passé
    // STREAM_WATCHDOG_MS sans rien recevoir — le `ping` serveur compris —, on
    // le tient pour mort : la cadence serrée reprend en ~50 s au lieu de
    // dépendre de l'OS. Le prochain événement reçu (ping, ou `ready` de la
    // reconnexion) le ramène à la cadence longue.
    let watchdog: ReturnType<typeof setTimeout> | null = null
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        watchdog = null
        if (!streamAliveRef.current) return
        streamAliveRef.current = false
        schedulePoll()
      }, STREAM_WATCHDOG_MS)
    }
    // Un événement, quel qu'il soit, prouve que le flux vit : cadence longue.
    const markAlive = () => {
      armWatchdog()
      if (streamAliveRef.current) return
      streamAliveRef.current = true
      schedulePoll()
    }
    // `ready` est le premier message du serveur : il prouve que le flux est
    // bel et bien établi (l'événement `open` de l'EventSource peut précéder
    // un proxy qui coupe juste après). Le sondage passe à la cadence longue
    // tout de suite. Le rattrapage attend un onglet visible — `lost` reste
    // armé jusque-là (le retour au premier plan refait de toute façon un
    // fetchRoom complet).
    const onReady = () => {
      markAlive()
      if (lost && pollEnabledRef.current) {
        lost = false
        void pollTick()
      }
    }
    // L'EventSource se reconnecte tout seul ; en attendant, le sondage
    // reprend sa cadence serrée — sans attendre la fin du délai en cours.
    const onError = () => {
      lost = true
      if (watchdog) clearTimeout(watchdog)
      watchdog = null
      if (!streamAliveRef.current) return
      streamAliveRef.current = false
      schedulePoll()
    }
    const onChanged = (e: Event) => {
      markAlive()
      const decision = roomEventDecision({
        type: 'changed',
        data: (e as MessageEvent).data,
        knownVersion: knownVersionRef.current,
        actionInFlight: actionsInFlightRef.current > 0,
      })
      if (decision.kind === 'ignore') return
      if (decision.kind === 'defer') {
        if (deferredRefreshRef.current) clearTimeout(deferredRefreshRef.current.timer)
        deferredRefreshRef.current = {
          stateVersion: decision.stateVersion,
          timer: setTimeout(resolveDeferredRefresh, DEFERRED_REFRESH_MAX_MS),
        }
        return
      }
      pollTickIfVisible()
    }
    const onLobby = () => {
      markAlive()
      pollTickIfVisible()
    }
    // Fin de partie : le DTO COMPLET tout de suite — il porte les niveaux et
    // l'XP des membres que recordMatchResults vient d'écrire (OnlinePlayerTag
    // les lit dans room.members). pollTick, lui, ne prend la branche complète
    // qu'une fois la vue LOCALE finie, c'est-à-dire au tick suivant : 15 s
    // flux vivant, là où c'était 1,5 s avant le chantier.
    const onFinished = () => {
      markAlive()
      if (!pollEnabledRef.current) return
      void refreshRoom(roomId)
    }
    es.addEventListener('ready', onReady)
    es.addEventListener('ping', markAlive)
    es.addEventListener('changed', onChanged)
    es.addEventListener('lobby', onLobby)
    es.addEventListener('finished', onFinished)
    es.addEventListener('error', onError)

    return () => {
      streamAliveRef.current = false
      if (watchdog) clearTimeout(watchdog)
      if (deferredRefreshRef.current) {
        clearTimeout(deferredRefreshRef.current.timer)
        deferredRefreshRef.current = null
      }
      es.close()
    }
  }, [
    room?.id,
    user,
    user?.playMode,
    pollTick,
    pollTickIfVisible,
    refreshRoom,
    schedulePoll,
    resolveDeferredRefresh,
  ])

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
    applyServerView,
    beginGameAction,
    endGameAction,
  }
}

export type OnlineRoomApi = ReturnType<typeof useOnlineRoomState>

export const OnlineRoomContext = createContext<OnlineRoomApi | null>(null)

/** État salon PARTAGÉ (une seule instance, fournie par OnlineRoomProvider). */
export function useOnlineRoom(): OnlineRoomApi {
  const ctx = useContext(OnlineRoomContext)
  if (!ctx) {
    throw new Error('useOnlineRoom must be used within <OnlineRoomProvider>')
  }
  return ctx
}
