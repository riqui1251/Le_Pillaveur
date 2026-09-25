"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { RoomDto } from '@/lib/online-room'
import { parseApiJson } from '@/lib/api-response'
import {
  DEPARTURE_MESSAGE_KEYS,
  resolveDepartureReason,
  resolveOnlineErrorCode,
  type DepartureReason,
} from '@/lib/online-errors'
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
import { connectionStatus, serverReached, type ConnectionStatus } from '@/hooks/connection-status'

// Cadences de sondage, tri des événements SSE et garde de version : logique
// pure dans ./online-room-polling.ts (testée sans React ni réseau). Verdict
// « connexion perdue » dit au joueur : ./connection-status.ts, même régime.

/**
 * Délai avant de ROUVRIR un flux SSE que le navigateur a abandonné. Un
 * EventSource ne se reconnecte tout seul qu'après une coupure en cours de
 * route (readyState CONNECTING) ; s'il reçoit un statut non-200 (502 du proxy
 * pendant un redéploiement) ou une réponse qui n'est pas du text/event-stream
 * (portail captif), il passe CLOSED et n'y revient JAMAIS : tous les clients
 * de la table restaient alors au sondage serré (1,5 s) jusqu'au changement de
 * salle ou au rechargement — exactement les requêtes que la cadence longue
 * économise. Cinq secondes : le temps qu'un redéploiement finisse de
 * répondre, sans marteler un serveur qui redémarre.
 */
const STREAM_REOPEN_MS = 5_000

/**
 * Plafond de l'attente entre deux réouvertures refusées d'affilée.
 *
 * Un EventSource ne sait pas lire le STATUT qui l'a fait tomber : un 429 du
 * plafond de flux par compte (stream-registry.ts) le met CLOSED exactement
 * comme un 502 de redéploiement. À cadence fixe, l'onglet au plafond rejouait
 * donc /stream toutes les 5 s indéfiniment — douze requêtes par minute, chacune
 * avec sa lecture de session et de membre — et le refus ne peut PAS se lever
 * tout seul en cinq secondes : une place de flux ne se libère qu'à la mort
 * d'une connexion. On double l'attente à chaque échec consécutif jusqu'à une
 * minute ; le premier événement reçu (`ready`, `ping`…) remet le compteur à
 * zéro. Pendant ce temps le sondage de secours continue : la table reste à
 * jour, elle perd seulement le temps réel.
 */
const STREAM_REOPEN_MAX_MS = 60_000

/**
 * Délai de la seconde relecture de la salle après le signal `finished` : le
 * temps que chaque écran visible ait fait sa propre relecture (qui écrit sa
 * présence). Voir onFinished.
 */
const FINISHED_RECHECK_MS = 2_500

/**
 * REPLI de ce qu'on dit au joueur qui découvre qu'il n'est plus membre de sa
 * table. Le serveur dit POURQUOI quand il le sait (403 de GET /rooms/[roomId]
 * avec `reason` : expulsion, siège d'absent libéré, relance sans lui,
 * remplacement par un bot — voir readDepartureReason) ; sans raison (délai
 * dépassé, redémarrage du serveur, départ déclenché depuis un autre
 * appareil), on la déduit de la table qu'on affichait. En pleine partie,
 * c'est presque toujours le remplacement pour inactivité. Sur l'écran de fin,
 * c'est la relance sans lui : « remplacé par un bot » serait faux, « tu n'es
 * plus dans cette table » reste juste.
 */
function membershipLostKey(room: RoomDto): 'replaced_by_bot' | 'roomLeft' {
  if (room.status !== 'playing') return 'roomLeft'
  const gameId = room.gameId ?? ''
  const state = gameId ? parseOnlineGameState(gameId, room.gameStateJson) : null
  const finished = state ? isOnlineGameFinished(gameId, state) : false
  return finished ? 'roomLeft' : 'replaced_by_bot'
}

/**
 * Raison d'un départ forcé portée par un 403 de GET /rooms/[roomId]
 * (`reason`, online/departures.ts), ou null. Le serveur la CONSOMME en la
 * rendant : seule la première lecture la voit.
 */
async function readDepartureReason(res: Response): Promise<DepartureReason | null> {
  try {
    const data = await parseApiJson<{ reason?: unknown }>(res)
    return resolveDepartureReason(data.reason)
  } catch {
    return null
  }
}

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
   * État de connexion DIT AU JOUEUR (cf. ConnectionBanner). La décision vit
   * dans ./connection-status.ts ; ici on ne fait que relever les signaux :
   * `browserOnlineRef` suit navigator.onLine (événements window
   * online/offline), `streamErroredRef` l'erreur du flux vue par le
   * navigateur depuis le dernier `ready`, `pollFailedRef` une lecture qui n'a
   * pas pu JOINDRE le serveur (fetch a levé, ou 502/503/504 d'une passerelle
   * qui parle pour un processus absent — un 4xx ou un 500, eux, sont des
   * réponses du jeu, cf. serverReached). Des refs et non des états : les
   * signaux bougent dans des handlers et des promesses, seul le verdict est
   * rendu.
   */
  const [connection, setConnection] = useState<ConnectionStatus>('online')
  const browserOnlineRef = useRef(true)
  const streamErroredRef = useRef(false)
  const pollFailedRef = useRef(false)
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

  /**
   * Ce qu'on dit au joueur retiré de sa table : la raison du serveur quand
   * il l'a rendue, sinon la déduction d'après la table qu'on affichait.
   */
  const membershipLostMessage = useCallback(
    (lost: RoomDto | null, reason: DepartureReason | null) => {
      if (reason) return t(DEPARTURE_MESSAGE_KEYS[reason])
      return t(lost ? membershipLostKey(lost) : 'roomLeft')
    },
    [t]
  )

  /** Recalcule le verdict à partir des signaux ; React ne rend que s'il change. */
  const syncConnection = useCallback(() => {
    setConnection(
      connectionStatus({
        browserOnline: browserOnlineRef.current,
        inRoom: roomRef.current !== null,
        streamAlive: streamAliveRef.current,
        streamErrored: streamErroredRef.current,
        pollFailed: pollFailedRef.current,
      })
    )
  }, [])

  /**
   * Issue RÉSEAU d'une lecture (sondage ou relecture) : le serveur du jeu
   * a-t-il répondu, quel que soit le statut ? Une réponse efface aussi
   * l'erreur du flux — si le HTTP passe, la table vit au rythme du sondage
   * serré, il n'y a plus de coupure à annoncer, même si le flux met du temps
   * à rouvrir.
   */
  const notePollReach = useCallback(
    (reached: boolean) => {
      pollFailedRef.current = !reached
      if (reached) streamErroredRef.current = false
      syncConnection()
    },
    [syncConnection]
  )

  /**
   * Adhésion perdue constatée par /rooms/me, qui ne dit pas pourquoi. Le 403
   * de GET /rooms/[roomId] le sait (raison consommée à la lecture) : une
   * requête de plus, seulement dans ce cas. Si le serveur nous y voit de
   * nouveau membre (course avec un retour par le code), rien à annoncer.
   */
  const explainMembershipLost = useCallback(
    async (lost: RoomDto) => {
      let reason: DepartureReason | null = null
      try {
        const res = await fetch(`/api/online/rooms/${lost.id}`, { credentials: 'include' })
        if (res.ok) return
        if (res.status === 403) reason = await readDepartureReason(res)
      } catch {
        // Réseau : le repli (déduction) suffit.
      }
      // Entre-temps le joueur a pu s'asseoir ailleurs : ne pas lui annoncer
      // l'ancienne table par-dessus la nouvelle.
      if (roomRef.current) return
      setError(membershipLostMessage(lost, reason))
    },
    [membershipLostMessage]
  )

  const fetchRoom = useCallback(async () => {
    if (!user || user.playMode !== 'online') {
      setRoom(null)
      return null
    }
    try {
      const res = await fetch('/api/online/rooms/me', { credentials: 'include' })
      notePollReach(serverReached(res.status))
      if (!res.ok) return null
      const data = await parseApiJson<{ room?: RoomDto }>(res)
      // Le serveur nous remet dans la salle qu'on venait de quitter (retour
      // depuis un autre appareil, invitation acceptée) : le verrou de départ
      // doit tomber, sinon le polling de CETTE salle resterait figé pour de
      // bon — plus aucune mise à jour jusqu'au rechargement de la page.
      if (data.room && leavingRoomIdRef.current === data.room.id) {
        leavingRoomIdRef.current = null
      }
      // Adhésion disparue PENDANT qu'on était à une table — siège purgé pour
      // absence, expulsion, lancement forcé ou relance sans nous : autant de
      // cas où l'onglet était CACHÉ, donc ne sondait plus et n'a jamais vu le
      // 403 de GET /rooms/[roomId]. Au retour au premier plan, cette relecture
      // est la seule à passer, et elle rendait le joueur au guichet sans un
      // mot. Départ volontaire exclu (verrou de départ). La raison est
      // demandée à part (explainMembershipLost) : la table disparaît tout de
      // suite, le message suit.
      const current = roomRef.current
      const lost = !data.room && current && leavingRoomIdRef.current !== current.id ? current : null
      setRoom(data.room ?? null)
      if (lost) {
        // roomRef suit au rendu : vidé ici pour que l'explication ne croie pas
        // le joueur déjà assis ailleurs.
        roomRef.current = null
        void explainMembershipLost(lost)
      }
      return data.room as RoomDto | null
    } catch {
      // Raté réseau ponctuel : on retentera au tick de polling suivant.
      notePollReach(false)
      return null
    }
  }, [user, notePollReach, explainMembershipLost])

  /**
   * 403/404 sur la salle courante : on purge l'état, sinon le polling boucle
   * sur l'ancien id jusqu'au rechargement de la page. Et on DIT pourquoi — la
   * table disparaissait sans un mot et le joueur croyait à un bug. Les deux
   * codes ne racontent PAS la même histoire : 404 = la salle n'existe plus
   * (hôte parti, ménage des salles abandonnées), 403 = elle existe mais on n'en
   * est plus membre — la raison vient du serveur quand il la connaît, sinon
   * elle est déduite de la table qu'on affichait (cf. membershipLostMessage) ;
   * annoncer « table fermée » dans ce cas-là serait faux.
   */
  const handleRoomGone = useCallback(
    (status: number, reason: DepartureReason | null = null) => {
      const current = roomRef.current
      // Départ DÉJÀ annoncé : deux relectures étaient en vol (403 de /state
      // relu par le flux ET par le sondage), la seconde arrive sans raison —
      // le serveur l'a consommée à la première. Elle ne remplace pas « L'hôte
      // t'a retiré… » par le message déduit ; une raison, elle, passe toujours.
      if (current === null && reason === null) {
        setRoom(null)
        return
      }
      // roomRef suit au rendu : vidé ici pour que la réponse suivante, dans
      // la même image, sache la table déjà partie.
      roomRef.current = null
      setRoom(null)
      setError(status === 404 ? t('roomClosed') : membershipLostMessage(current, reason))
    },
    [t, membershipLostMessage]
  )

  const refreshRoom = useCallback(async (roomId: string) => {
    if (leavingRoomIdRef.current === roomId) return null
    const seq = ++roomRefreshSeqRef.current
    /** Un refreshRoom plus récent a déjà répondu : cette réponse est périmée. */
    const superseded = () => seq < roomRefreshAppliedRef.current
    try {
      const res = await fetch(`/api/online/rooms/${roomId}`, { credentials: 'include' })
      notePollReach(serverReached(res.status))
      if (leavingRoomIdRef.current === roomId) return null
      if (superseded()) return null
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) {
          // Le 403 d'un départ forcé porte sa raison (lue une seule fois).
          const reason = res.status === 403 ? await readDepartureReason(res) : null
          if (leavingRoomIdRef.current === roomId || superseded()) return null
          roomRefreshAppliedRef.current = seq
          handleRoomGone(res.status, reason)
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
      notePollReach(false)
      return null
    }
  }, [handleRoomGone, notePollReach])

  /** Polling léger — uniquement l'état de partie (plus rapide qu'un refresh complet) */
  const refreshGameState = useCallback(async (roomId: string) => {
    if (leavingRoomIdRef.current === roomId) return null
    // Version connue AU DÉPART de la requête : si elle a bougé à l'arrivée,
    // la réponse a pu se faire doubler (cf. mergePolledState).
    const knownAtRequest = knownVersionRef.current
    try {
      const res = await fetch(`/api/online/rooms/${roomId}/state`, { credentials: 'include' })
      notePollReach(serverReached(res.status))
      if (leavingRoomIdRef.current === roomId) return null
      if (!res.ok) {
        // 403 : /state ne dit pas pourquoi — la relecture de la salle, si
        // (son 403 porte la raison d'un départ forcé, cf. refreshRoom).
        if (res.status === 403) void refreshRoom(roomId)
        else if (res.status === 404) handleRoomGone(res.status)
        return null
      }
      const data = await parseApiJson<{
        stateVersion: number
        currentTurnUserId: string | null
        gameStateJson: string | null
      }>(res)
      // État vidé sous une partie qu'on croyait en cours : la table a changé
      // de statut (retour à la table d'attente, relance qui se distribue) —
      // /state ne porte pas le statut, seule la salle complète le dit.
      if (data.gameStateJson === null && roomRef.current?.status === 'playing') {
        void refreshRoom(roomId)
        return data
      }
      // La version connue suit tout de suite (sans attendre le rendu) : la
      // trame SSE de cet état peut arriver juste derrière la réponse.
      if (mergePolledState(roomRef.current, roomId, data, knownAtRequest) !== roomRef.current) {
        knownVersionRef.current = data.stateVersion
      }
      setRoom((prev) => mergePolledState(prev, roomId, data, knownAtRequest))
      return data
    } catch {
      notePollReach(false)
      return null
    }
  }, [handleRoomGone, notePollReach, refreshRoom])

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

  const launchGame = useCallback(async (opts?: { force?: boolean }) => {
    if (!room) return null
    setLoading(true)
    setError(null)
    try {
      // `force` (hôte) : le serveur retire d'abord les non-prêts, puis lance
      // — « Lancer sans les retardataires ». Le corps n'est envoyé QUE dans
      // ce cas : le lancement ordinaire reste une requête sans corps.
      const res = await fetch(`/api/online/rooms/${room.id}/launch`, {
        method: 'POST',
        credentials: 'include',
        ...(opts?.force
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) }
          : {}),
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

  /**
   * L'hôte retire un joueur de la table (salle en attente) : le siège d'un
   * ami parti sans quitter ne doit pas bloquer le lancement. La route répond
   * `{ ok: true }` sans DTO : on relit la salle tout de suite plutôt que
   * d'attendre l'écho SSE, pour que le siège disparaisse sous le doigt.
   */
  const kickMember = useCallback(
    async (userId: string) => {
      if (!room) return false
      setError(null)
      try {
        const res = await fetch(`/api/online/rooms/${room.id}/members/${userId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) {
          const data = await parseApiJson<{ error?: string }>(res)
          setError(apiError(data.error, 'kickFailed'))
          return false
        }
        void refreshRoom(room.id)
        return true
      } catch {
        setError(t('network'))
        return false
      }
    },
    [room, apiError, t, refreshRoom]
  )

  /**
   * Applique un DTO complet rendu par une ÉCRITURE (retour à la table,
   * changement de jeu) : une relecture partie avant elle répondrait l'état
   * d'avant (partie finie, ancien jeu) — elle est déclarée périmée, comme
   * entre deux refreshRoom (dernier parti gagne).
   */
  const applyWrittenRoom = useCallback((next: RoomDto | null) => {
    roomRefreshAppliedRef.current = ++roomRefreshSeqRef.current
    setRoom(next)
  }, [])

  /**
   * Fin de partie → retour à la table d'attente : même salle, même code (hôte,
   * ou n'importe quel présent si l'hôte s'est absenté — c'est le serveur qui
   * tranche : not_host). Contrat de l'écran de fin : `true` quand la table est
   * de nouveau en attente ; l'erreur traduite est posée sinon.
   */
  const backToTable = useCallback(async (): Promise<boolean> => {
    if (!room) return false
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/online/rooms/${room.id}/back-to-lobby`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await parseApiJson<{ room?: RoomDto; error?: string }>(res)
      if (!res.ok) {
        setError(apiError(data.error, 'backToTableFailed'))
        return false
      }
      applyWrittenRoom(data.room ?? null)
      return true
    } catch {
      setError(t('network'))
      return false
    } finally {
      setLoading(false)
    }
  }, [room, apiError, t, applyWrittenRoom])

  /**
   * L'hôte change le jeu de la table en attente (PUT /settings `gameId`) :
   * même code, mêmes joueurs, réglages du jeu précédent remis à zéro, tout le
   * monde « pas prêt ». La NAVIGATION vers la page du nouveau jeu revient à
   * l'appelant (GameOnlineLobby) ; les autres membres suivent d'eux-mêmes.
   * `count` accompagne max_players (tablée trop nombreuse pour ce jeu).
   */
  const changeGame = useCallback(
    async (gameId: string): Promise<boolean> => {
      if (!room) return false
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/online/rooms/${room.id}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ gameId }),
        })
        const data = await parseApiJson<{ room?: RoomDto; error?: string; count?: number }>(res)
        if (!res.ok) {
          setError(apiError(data.error, 'changeGameFailed', data.count))
          return false
        }
        applyWrittenRoom(data.room ?? null)
        return true
      } catch {
        setError(t('network'))
        return false
      } finally {
        setLoading(false)
      }
    },
    [room, apiError, t, applyWrittenRoom]
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
   * Onglet caché, aucun handler ne sonde (cf. pollTickIfVisible). Le flux
   * est ROUVERT par nos soins quand le navigateur l'a abandonné (CLOSED) ou
   * quand le chien de garde le tient pour zombie — l'EventSource seul ne
   * couvre que la coupure en cours de route.
   */
  useEffect(() => {
    const roomId = room?.id
    if (!roomId || !user || user.playMode !== 'online') return
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

    // Instance COURANTE du flux : `reopen` la remplace (flux abandonné par le
    // navigateur, ou zombie déclaré mort par le chien de garde). Les handlers
    // sont attachés à chaque instance par `open`, plus bas.
    let es: EventSource | null = null
    let reopenTimer: ReturnType<typeof setTimeout> | null = null
    // L'effet est démonté (salle quittée, mode changé) : plus aucune réouverture.
    let unmounted = false
    // Seconde relecture de fin de partie en attente (cf. onFinished).
    let finishedRecheck: ReturnType<typeof setTimeout> | null = null
    // Le flux a-t-il été perdu depuis la dernière ouverture ? Une reconnexion
    // n'a pas de rattrapage côté serveur (pas de Last-Event-ID) : ce qui a
    // bougé entre le dernier sondage serré et le `ready` serait perdu.
    let lost = false
    // Réouvertures ABANDONNÉES d'affilée, sans le moindre événement entre
    // elles : le compteur du recul exponentiel (cf. STREAM_REOPEN_MAX_MS).
    let refusals = 0
    /**
     * Ferme le flux courant et en ouvre un autre après `delay`. Un seul
     * minuteur à la fois : deux causes rapprochées (chien de garde puis
     * `error`) ne font qu'une réouverture.
     */
    const reopen = (delay: number) => {
      if (unmounted) return
      es?.close()
      es = null
      if (reopenTimer) clearTimeout(reopenTimer)
      reopenTimer = setTimeout(() => {
        reopenTimer = null
        if (!unmounted) open()
      }, delay)
    }
    // Chien de garde : un flux « zombie » (Wi-Fi → 4G, coupure TCP que l'OS
    // met des minutes à voir) ne produit ni `error` ni événement. Passé
    // STREAM_WATCHDOG_MS sans rien recevoir — le `ping` serveur compris —, on
    // le tient pour mort : la cadence serrée reprend en ~50 s au lieu de
    // dépendre de l'OS. Et on ne l'attend pas : le zombie est fermé et un flux
    // neuf ouvert tout de suite — par la 4G, le temps réel revient en une
    // poignée de secondes au lieu d'attendre que l'OS constate la coupure. Le
    // `ready` du nouveau flux ramène la cadence longue.
    let watchdog: ReturnType<typeof setTimeout> | null = null
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog)
      watchdog = setTimeout(() => {
        watchdog = null
        if (!streamAliveRef.current) return
        streamAliveRef.current = false
        // Un soupçon, pas une coupure : rien n'est dit au joueur tant que le
        // sondage serré passe (cf. connectionStatus, cas du flux zombie).
        syncConnection()
        schedulePoll()
        // Ce qui a bougé pendant la fenêtre zombie n'a pas été poussé : le
        // `ready` du flux neuf déclenche un rattrapage (onReady) — le tick
        // serré planifié juste au-dessus, lui, est annulé par ce même `ready`
        // qui ramène la cadence longue.
        lost = true
        reopen(0)
      }, STREAM_WATCHDOG_MS)
    }
    // Un événement, quel qu'il soit, prouve que le flux vit : cadence longue.
    const markAlive = () => {
      armWatchdog()
      // Le serveur nous a répondu : le flux suivant repart sans le recul
      // accumulé par une série de refus.
      refusals = 0
      if (streamAliveRef.current) return
      streamAliveRef.current = true
      streamErroredRef.current = false
      syncConnection()
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
    // L'EventSource se reconnecte tout seul (readyState CONNECTING) ; en
    // attendant, le sondage reprend sa cadence serrée — sans attendre la fin
    // du délai en cours. Le navigateur a VU le flux tomber : c'est le signal
    // fort de la coupure dite au joueur (cf. connectionStatus), là où le chien
    // de garde n'est qu'un soupçon. Relevé même si le flux était déjà tenu
    // pour mort — et à chaque tentative ratée de l'EventSource, qui rejoue
    // `error`. Sauf s'il a ABANDONNÉ (CLOSED : statut non-200, mauvais type
    // de contenu) : là, personne ne rouvrira à notre place — on s'en charge
    // (cf. STREAM_REOPEN_MS).
    const onError = () => {
      lost = true
      if (watchdog) clearTimeout(watchdog)
      watchdog = null
      streamErroredRef.current = true
      const wasAlive = streamAliveRef.current
      streamAliveRef.current = false
      syncConnection()
      if (wasAlive) schedulePoll()
      if (es?.readyState === EventSource.CLOSED) {
        // Recul exponentiel, plafonné : le refus peut être un 429 du plafond
        // de flux, que le navigateur nous cache et qui ne se lèvera pas en
        // cinq secondes (cf. STREAM_REOPEN_MAX_MS).
        refusals += 1
        reopen(Math.min(STREAM_REOPEN_MS * 2 ** (refusals - 1), STREAM_REOPEN_MAX_MS))
      }
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
      // Seconde relecture, une fois que chaque écran a fait la sienne : tous
      // les onglets visibles relisent en même temps au signal, et la
      // présence de l'hôte n'est écrite qu'à SA relecture. Lue avant, elle
      // le disait absent — « Retour à la table » offert à tort (refusé
      // not_host) et « Rejouer x/total » trop bas jusqu'au sondage suivant.
      if (finishedRecheck) clearTimeout(finishedRecheck)
      finishedRecheck = setTimeout(() => {
        finishedRecheck = null
        if (pollEnabledRef.current) void refreshRoom(roomId)
      }, FINISHED_RECHECK_MS)
    }
    /** Ouvre le flux et y attache les handlers (première fois, et à chaque `reopen`). */
    function open() {
      const stream = new EventSource(`/api/online/rooms/${roomId}/stream`)
      stream.addEventListener('ready', onReady)
      stream.addEventListener('ping', markAlive)
      stream.addEventListener('changed', onChanged)
      stream.addEventListener('lobby', onLobby)
      stream.addEventListener('finished', onFinished)
      stream.addEventListener('error', onError)
      es = stream
    }
    open()

    return () => {
      unmounted = true
      if (reopenTimer) clearTimeout(reopenTimer)
      if (finishedRecheck) clearTimeout(finishedRecheck)
      streamAliveRef.current = false
      // L'erreur appartient à CE flux : la salle suivante repart sans dette
      // (le verdict est relu par l'effet « la salle change », plus bas).
      streamErroredRef.current = false
      if (watchdog) clearTimeout(watchdog)
      if (deferredRefreshRef.current) {
        clearTimeout(deferredRefreshRef.current.timer)
        deferredRefreshRef.current = null
      }
      es?.close()
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
    syncConnection,
  ])

  /**
   * Ce que dit le navigateur. `offline` est certain (mode avion, Wi-Fi
   * coupé) et se dit au joueur tout de suite — avant que le flux ne tombe ou
   * qu'un sondage n'échoue. `online` déclenche une lecture SANS attendre le
   * tick en cours : jusqu'à 1,5 s de plus sur une table déjà figée, et
   * l'EventSource, lui, ne rouvrira qu'à son propre délai (~3 s). pollTick
   * choisit quoi relire (état de partie, salle complète, ou /rooms/me hors
   * salle) ; pollTickIfVisible respecte l'onglet caché, dont le retour au
   * premier plan refait de toute façon un fetchRoom complet.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sync = () => {
      browserOnlineRef.current = navigator.onLine
      syncConnection()
    }
    const onOnline = () => {
      sync()
      pollTickIfVisible()
    }
    sync()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', sync)
    }
  }, [syncConnection, pollTickIfVisible])

  /** La salle change (entrée, sortie, disparition) : le verdict la suit. */
  useEffect(() => {
    syncConnection()
  }, [room?.id, syncConnection])

  return {
    room,
    loading,
    error,
    connection,
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
    kickMember,
    backToTable,
    changeGame,
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
