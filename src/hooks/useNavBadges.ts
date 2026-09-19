"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import { usePagePresence } from '@/hooks/usePagePresence'
import type { ChatUnread } from '@/hooks/useChatUnread'

/**
 * Cadence du sondage. Les badges vivaient à trois cadences (non-lus 10 s,
 * joueurs actifs 60 s, le reste jamais) : 60 s pour tout, c'est le rythme du
 * ping de visite — un message reçu s'annonce de toute façon quand le panneau
 * de chat est ouvert, qui a son propre sondage.
 */
export const NAV_BADGES_POLL_MS = 60_000

/** Ce que la barre affiche — et rien de plus : le contrat de /api/me/nav. */
export type NavBadges = {
  /** Non-lus du chat, par canal (même calcul que /api/chat/unread). */
  unread: ChatUnread
  /** Demandes d'amis reçues, en attente. */
  pendingRequests: number
  /** Amis « en ligne » (définition partagée de presence.ts). */
  friendsOnline: number
  /** Niveau seul : c'est tout ce que la barre montre de la progression. */
  progression: { level: number } | null
  /** Joueurs actifs sur le site (public) — null tant qu'on ne sait pas. */
  presenceCount: number | null
}

export const EMPTY_NAV_BADGES: NavBadges = {
  unread: { total: 0, room: 0, friends: {} },
  pendingRequests: 0,
  friendsOnline: 0,
  progression: null,
  presenceCount: null,
}

export type NavBadgesEndpoint = '/api/me/nav' | '/api/presence/count'

/**
 * Quelle requête pour qui : un compte connecté a tout en une réponse ; un
 * visiteur sans session ne voit que le compteur public de joueurs actifs, qui
 * reste servi par sa route à lui (/api/me/nav répond 401 sans session).
 */
export function navBadgesEndpoint(userId: string | undefined): NavBadgesEndpoint {
  return userId ? '/api/me/nav' : '/api/presence/count'
}

/**
 * Faut-il sonder maintenant ? Pas tant que la session n'est pas connue (on
 * partirait en visiteur puis en compte : deux requêtes pour une), et pas
 * onglet caché (voir usePagePresence).
 */
export function shouldPollNavBadges(input: { authLoading: boolean; visible: boolean }): boolean {
  return !input.authLoading && input.visible
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/**
 * Lecture défensive d'une réponse : chaque champ absent ou mal typé garde sa
 * valeur précédente plutôt que d'afficher n'importe quoi. Pure, testée.
 */
export function readNavResponse(
  endpoint: NavBadgesEndpoint,
  raw: unknown,
  previous: NavBadges
): NavBadges {
  if (!isRecord(raw)) return previous

  if (endpoint === '/api/presence/count') {
    return isCount(raw.count) ? { ...previous, presenceCount: raw.count } : previous
  }

  const next: NavBadges = { ...previous }
  if (isRecord(raw.unread) && isCount(raw.unread.total) && isCount(raw.unread.room)) {
    const friends: Record<string, number> = {}
    if (isRecord(raw.unread.friends)) {
      for (const [id, n] of Object.entries(raw.unread.friends)) {
        if (isCount(n)) friends[id] = n
      }
    }
    next.unread = { total: raw.unread.total, room: raw.unread.room, friends }
  }
  if (isCount(raw.pendingRequests)) next.pendingRequests = raw.pendingRequests
  if (isCount(raw.friendsOnline)) next.friendsOnline = raw.friendsOnline
  if (raw.progression === null) next.progression = null
  else if (isRecord(raw.progression) && isCount(raw.progression.level)) {
    next.progression = { level: raw.progression.level }
  }
  if (isCount(raw.presenceCount)) next.presenceCount = raw.presenceCount
  return next
}

/**
 * Badges de la barre de navigation : UN fetch au montage, puis un sondage
 * à 60 s tant que l'onglet est visible. Remplace, pour la barre, quatre
 * hooks/fetchs qui partaient chacun de leur côté à chaque page (non-lus,
 * progression, liste d'amis pour un simple compte, joueurs actifs).
 *
 * `refresh()` est exposé pour les moments où on SAIT que quelque chose a
 * changé : fermeture du panneau amis, conversation lue.
 */
export function useNavBadges() {
  const { user, loading: authLoading } = useAuth()
  // Seule l'identité compte : l'objet `user` change de référence à chaque
  // rafraîchissement de session sans que les badges bougent.
  const userId = user?.id
  const visible = usePagePresence()
  const [badges, setBadges] = useState<NavBadges>(EMPTY_NAV_BADGES)
  /**
   * Requête en vol, par ENDPOINT : `refresh` est recréé au changement de
   * compte, mais la ref lui survit. Un drapeau unique court-circuitait le
   * premier fetch du compte si le fetch visiteur était encore en l'air à
   * l'instant de la connexion — les badges restaient vides jusqu'au tick
   * de 60 s.
   */
  const inFlightRef = useRef<NavBadgesEndpoint | null>(null)
  // Identité courante, lue à l'ARRIVÉE d'une réponse : celle d'un autre compte
  // (connexion ou déconnexion pendant le vol) n'a plus rien à afficher.
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const refresh = useCallback(async () => {
    const endpoint = navBadgesEndpoint(userId)
    if (inFlightRef.current === endpoint) return
    inFlightRef.current = endpoint
    try {
      const res = await fetch(endpoint, { credentials: 'include' })
      if (!res.ok) return
      const json: unknown = await res.json()
      if (userIdRef.current !== userId) return
      setBadges((prev) => readNavResponse(endpoint, json, prev))
    } catch {
      // réseau : on garde la dernière valeur
    } finally {
      if (inFlightRef.current === endpoint) inFlightRef.current = null
    }
  }, [userId])

  useEffect(() => {
    // Changement de compte (connexion, déconnexion) : on repart de zéro
    // plutôt que d'afficher un instant les badges de l'autre.
    setBadges(EMPTY_NAV_BADGES)
  }, [userId])

  useEffect(() => {
    if (!shouldPollNavBadges({ authLoading, visible })) return
    // Rafraîchissement immédiat au (re)démarrage : montage, retour au premier
    // plan, changement de compte.
    void refresh()
    const timer = setInterval(refresh, NAV_BADGES_POLL_MS)
    return () => clearInterval(timer)
  }, [authLoading, visible, refresh])

  return { ...badges, refresh }
}
