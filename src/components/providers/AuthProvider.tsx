"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import type { PlayerIconFrame, PlayerSpecialEffect } from '@/lib/players'
import { readLocalAmbianceMode } from '@/lib/ambiance-mode'

export type OnlineUserPreferences = {
  color: string
  icon?: string
  specialEffect?: PlayerSpecialEffect
  iconFrame?: PlayerIconFrame
}

export type AuthUser = {
  id: string
  email: string
  displayName: string
  onlineDisplayName: string | null
  onlinePreferences?: OnlineUserPreferences
  accountCode: string
  role: 'user' | 'moderator' | 'admin' | 'superadmin' | 'fondateur'
  locale: string
  playMode: 'local' | 'online'
  ambianceMode: 'alcool' | 'soft'
  /**
   * Compte invité temporaire (scan de QR, « Essayer avec des bots ») — email
   * vide, lié au seul cookie de session de ce navigateur. Purgé après 90 jours
   * sans activité, ou 7 jours après sa dernière activité s'il n'a plus de
   * session valide en base (déconnexion, connexion à un autre compte).
   */
  isGuest?: boolean
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  /**
   * La dernière lecture de session est restée SANS réponse (hors ligne,
   * serveur en panne) : `user` vaut null sans qu'on sache s'il y a un compte.
   * Différent d'une déconnexion franche (401) — les joueurs locaux s'en
   * servent pour noter qu'un geste hors ligne devra rattraper le nuage.
   */
  unavailable: boolean
  login: (email: string, password: string) => Promise<string | null>
  register: (email: string, password: string, displayName: string, locale?: string) => Promise<string | null>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setPlayMode: (mode: 'local' | 'online') => Promise<string | null>
  setAmbianceMode: (mode: 'alcool' | 'soft') => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Réponse de /api/auth/me. Seul un 401 (ou une réponse sans compte) veut dire
 * « pas de session ». Une erreur serveur (5xx), réseau ou une réponse
 * illisible est une panne passagère : la traiter comme une déconnexion
 * faisait réafficher JoinGate / TryBotsGate à un joueur connecté, qui
 * créait alors un SECOND invité et rendait le premier orphelin.
 */
type MeResult =
  | { kind: 'user'; user: AuthUser }
  | { kind: 'signed-out' }
  | { kind: 'unavailable' }

/**
 * Délai au-delà duquel /api/auth/me est tenu pour injoignable. Hors ligne
 * franc, le navigateur échoue tout de suite ; mais un Wi-Fi sans internet
 * laisse la requête PENDRE — et tant qu'elle pend, `loading` reste vrai :
 * bascules cachées, pages de jeu figées sur leur vitrine, jeux locaux (servis
 * par le service worker) injouables. Dix secondes : au-delà, on joue en
 * visiteur et on relira la session au retour du réseau.
 */
const ME_TIMEOUT_MS = 10_000

/** Relances d'une lecture restée sans réponse, hors événement réseau : 15 s, 30 s, 1 min, 2 min, puis on s'arrête. */
const ME_RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000]

async function fetchMe(): Promise<MeResult> {
  let res: Response
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), ME_TIMEOUT_MS) : null
  try {
    res = await fetch('/api/auth/me', { credentials: 'include', signal: controller?.signal })
  } catch {
    return { kind: 'unavailable' }
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (res.status === 401) return { kind: 'signed-out' }
  if (!res.ok) return { kind: 'unavailable' }
  const data = await res.json().catch(() => null)
  if (!data) return { kind: 'unavailable' }
  return data.user ? { kind: 'user', user: data.user } : { kind: 'signed-out' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const tErrors = useTranslations('auth.errors')

  // Dernière lecture restée sans réponse (hors ligne, serveur en panne) : à
  // refaire dès que le réseau revient ou que l'app repasse devant. Sans ça,
  // un compte ouvert hors ligne (jeux locaux) restait « visiteur » — pseudo
  // absent, synchro des joueurs coupée — jusqu'à un rechargement complet.
  const unavailableRef = useRef(false)
  const [unavailable, setUnavailable] = useState(false)

  const refresh = useCallback(async () => {
    const me = await fetchMe()
    unavailableRef.current = me.kind === 'unavailable'
    setUnavailable(me.kind === 'unavailable')
    // Panne passagère : on garde le compte déjà chargé (ou l'absence de
    // compte au premier chargement) plutôt que d'annoncer une déconnexion.
    if (me.kind === 'unavailable') return
    setUser(me.kind === 'user' ? me.user : null)
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    const retry = () => {
      if (!unavailableRef.current || document.visibilityState === 'hidden') return
      void refresh()
    }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', retry)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', retry)
    }
  }, [refresh])

  // Réseau lent mais réel (3G, serveur qui se réveille après un déploiement) :
  // la première lecture a dépassé le délai sans qu'aucun événement « online »
  // ne vienne la relancer. On réessaie de nous-mêmes, de plus en plus
  // espacé, tant que le navigateur ne se dit pas hors ligne — sinon un
  // compte resterait « visiteur » toute la soirée.
  useEffect(() => {
    if (!unavailable) return
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (attempt >= ME_RETRY_DELAYS_MS.length) return
      timer = setTimeout(() => {
        timer = null
        attempt += 1
        if (!unavailableRef.current || navigator.onLine === false || document.visibilityState === 'hidden') {
          schedule()
          return
        }
        void refresh().then(() => {
          if (unavailableRef.current) schedule()
        })
      }, ME_RETRY_DELAYS_MS[attempt])
    }
    schedule()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [unavailable, refresh])

  const login = useCallback(async (email: string, password: string) => {
    let res: Response
    try {
      res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
    } catch {
      return tErrors('network')
    }
    if (res.status >= 500) return tErrors('serviceUnavailable')
    const data = await res.json().catch(() => null)
    if (!res.ok) return data?.error ?? tErrors('generic')
    if (!data?.user) return tErrors('generic')
    setUser(data.user)
    return null
  }, [tErrors])

  const register = useCallback(async (email: string, password: string, displayName: string, locale?: string) => {
    let res: Response
    try {
      res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // Le compte naît avec l'ambiance de l'appareil (« Sans alcool » d'office
        // dans l'app) au lieu de réimposer l'alcool à qui l'avait écarté.
        body: JSON.stringify({ email, password, displayName, locale, ambianceMode: readLocalAmbianceMode() }),
      })
    } catch {
      return tErrors('network')
    }
    if (res.status >= 500) return tErrors('serviceUnavailable')
    const data = await res.json().catch(() => null)
    if (!res.ok) return data?.error ?? tErrors('generic')
    if (!data?.user) return tErrors('generic')
    setUser(data.user)
    return null
  }, [tErrors])

  // Les trois appels ci-dessous partaient sans try/catch : hors ligne, un
  // rejet non attrapé chez des appelants en `void` (bascules, pont de la
  // barre des joueurs) — et rien ne disait au joueur pourquoi rien ne bougeait.
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Hors ligne : la session (cookie HttpOnly) est toujours là, on ne la dit pas fermée.
      return
    }
    setUser(null)
  }, [])

  const setPlayMode = useCallback(async (mode: 'local' | 'online') => {
    let res: Response
    try {
      res = await fetch('/api/auth/mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode }),
      })
    } catch {
      // Sans réseau, un compte resté en mode « en ligne » ne pouvait plus
      // rien ouvrir : tout le catalogue éteint, et la bascule « Local » en
      // échec. Le mode local n'a besoin de rien côté serveur : on l'applique
      // à l'écran pour la session (le compte garde son réglage, relu au
      // prochain chargement en ligne). Le mode en ligne, lui, reste un refus.
      if (mode === 'local' && typeof navigator !== 'undefined' && navigator.onLine === false) {
        setUser((prev) => (prev ? { ...prev, playMode: mode } : prev))
        return null
      }
      return tErrors('network')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return data.error ?? 'Erreur'
    setUser((prev) => (prev ? { ...prev, playMode: mode } : prev))
    return null
  }, [tErrors])

  const setAmbianceMode = useCallback(async (mode: 'alcool' | 'soft') => {
    let res: Response
    try {
      res = await fetch('/api/auth/ambiance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode }),
      })
    } catch {
      return tErrors('network')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return data.error ?? 'Erreur'
    setUser((prev) => (prev ? { ...prev, ambianceMode: mode } : prev))
    return null
  }, [tErrors])

  const value = useMemo(
    () => ({ user, loading, unavailable, login, register, logout, refresh, setPlayMode, setAmbianceMode }),
    [user, loading, unavailable, login, register, logout, refresh, setPlayMode, setAmbianceMode]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const SSR_AUTH_FALLBACK: AuthContextValue = {
  user: null,
  loading: true,
  unavailable: false,
  login: async () => 'Non disponible',
  register: async () => 'Non disponible',
  logout: async () => {},
  refresh: async () => {},
  setPlayMode: async () => 'Non disponible',
  setAmbianceMode: async () => 'Non disponible',
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    if (typeof window === 'undefined') {
      return SSR_AUTH_FALLBACK
    }
    throw new Error('useAuth doit être utilisé dans AuthProvider')
  }
  return ctx
}
