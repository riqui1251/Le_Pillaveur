"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TvRoomDto } from '@/lib/online-room'
import type { CastFrame } from '@/lib/cast-types'

/**
 * Abonnement LECTURE SEULE d'un écran TV à une salle, par CODE. Calqué sur le
 * chemin lecture de `useOnlineRoom` mais sans aucune action : fetch de l'état
 * public + SSE temps réel (`/api/tv/[code]/stream`) + polling de secours.
 *
 * Le sondage n'est qu'un FILET : le SSE porte le temps réel. Le garder serré
 * ferait marteler le serveur par chaque télé allumée toute une soirée, pour
 * ne couvrir qu'une perte de connexion au flux — d'où DEUX cadences :
 *  - flux vivant (événement `ready` reçu, pas d'erreur depuis) : une requête
 *    par minute, juste pour rattraper un événement perdu en silence ;
 *  - flux mort (EventSource absent, en erreur, ou pas encore ouvert) : dix
 *    secondes, le sondage redevient le seul canal.
 */
const POLL_STREAM_OK_MS = 60_000
const POLL_FALLBACK_MS = 10_000

/**
 * Rafale d'événements SSE (un lancement de partie en pousse plusieurs d'affilée)
 * : on ne redemande l'état qu'une fois, une fraction de seconde plus tard.
 */
const REFRESH_DEBOUNCE_MS = 250

export function useTvRoom(code: string) {
  const [room, setRoom] = useState<TvRoomDto | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Dernière trame reçue (cast d'un jeu local) — billes Plinko / chevaux PMU.
  const [frame, setFrame] = useState<CastFrame | null>(null)

  const inFlightRef = useRef(false)
  /**
   * Un événement est arrivé PENDANT une requête : l'ancien code le laissait
   * tomber, et la TV restait sur un état périmé jusqu'au tick de sondage
   * suivant. On mémorise qu'il faut refaire un tour dès la réponse reçue.
   */
  const staleRef = useRef(false)
  const lastSigRef = useRef('')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamAliveRef = useRef(false)

  const fetchState = useCallback(async () => {
    if (inFlightRef.current) {
      staleRef.current = true
      return
    }
    inFlightRef.current = true

    const runOnce = async () => {
      try {
        const res = await fetch(`/api/tv/${encodeURIComponent(code)}/state`, { cache: 'no-store' })
        if (res.status === 404 || res.status === 400) {
          setNotFound(true)
          setRoom(null)
          return
        }
        if (!res.ok) {
          // 429 compris : on ne change pas ce qui est à l'écran, le prochain
          // tick (ou le prochain événement) retentera à la cadence normale.
          setError('load-error')
          return
        }
        const data = (await res.json()) as { room?: TvRoomDto }
        const next = data.room ?? null
        setNotFound(false)
        setError(null)
        // Dédup : ne re-render que si quelque chose a réellement changé.
        const sig = next ? JSON.stringify(next) : ''
        if (sig !== lastSigRef.current) {
          lastSigRef.current = sig
          setRoom(next)
        }
      } catch {
        setError('network')
      }
    }

    try {
      // Boucle plutôt que rappel récursif : si un événement est arrivé pendant
      // la requête, on refait UN tour, puis on s'arrête.
      do {
        staleRef.current = false
        await runOnce()
      } while (staleRef.current)
    } finally {
      inFlightRef.current = false
      staleRef.current = false
    }
  }, [code])

  /** Rafraîchissement demandé par le flux : groupé, jamais en doublon. */
  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) return
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void fetchState()
    }, REFRESH_DEBOUNCE_MS)
  }, [fetchState])

  // Sondage de secours : cadence choisie à CHAQUE tick, donc la bascule
  // « flux vivant / flux mort » est prise en compte sans remonter l'effet.
  useEffect(() => {
    let stopped = false
    const tick = async () => {
      if (stopped) return
      await fetchState()
      if (stopped) return
      const delay = streamAliveRef.current ? POLL_STREAM_OK_MS : POLL_FALLBACK_MS
      pollRef.current = setTimeout(tick, delay)
    }
    void tick()
    return () => {
      stopped = true
      if (pollRef.current) clearTimeout(pollRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchState])

  // Temps réel : SSE pousse les changements → on rafraîchit l'état.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return
    const es = new EventSource(`/api/tv/${encodeURIComponent(code)}/stream`)
    const onEvent = () => {
      scheduleRefresh()
    }
    const onFrame = (e: MessageEvent) => {
      try {
        setFrame(JSON.parse(e.data) as CastFrame)
      } catch {
        /* trame illisible ignorée */
      }
    }
    // `ready` est le premier message du serveur : il prouve que le flux est
    // bel et bien établi (l'événement `open` de l'EventSource peut précéder
    // un proxy qui coupe juste après).
    const onReady = () => {
      streamAliveRef.current = true
    }
    const onError = () => {
      // L'EventSource se reconnecte tout seul ; en attendant, le sondage
      // reprend sa cadence serrée.
      streamAliveRef.current = false
    }
    es.addEventListener('ready', onReady)
    es.addEventListener('changed', onEvent)
    es.addEventListener('lobby', onEvent)
    es.addEventListener('finished', onEvent)
    es.addEventListener('castframe', onFrame as EventListener)
    es.addEventListener('error', onError)
    return () => {
      streamAliveRef.current = false
      es.close()
    }
  }, [code, scheduleRefresh])

  return { room, notFound, error, frame }
}
