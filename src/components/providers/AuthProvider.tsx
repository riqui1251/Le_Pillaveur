"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

async function fetchMe(): Promise<MeResult> {
  let res: Response
  try {
    res = await fetch('/api/auth/me', { credentials: 'include' })
  } catch {
    return { kind: 'unavailable' }
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

  const refresh = useCallback(async () => {
    const me = await fetchMe()
    // Panne passagère : on garde le compte déjà chargé (ou l'absence de
    // compte au premier chargement) plutôt que d'annoncer une déconnexion.
    if (me.kind === 'unavailable') return
    setUser(me.kind === 'user' ? me.user : null)
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

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

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
  }, [])

  const setPlayMode = useCallback(async (mode: 'local' | 'online') => {
    const res = await fetch('/api/auth/mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mode }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return data.error ?? 'Erreur'
    setUser((prev) => (prev ? { ...prev, playMode: mode } : prev))
    return null
  }, [])

  const setAmbianceMode = useCallback(async (mode: 'alcool' | 'soft') => {
    const res = await fetch('/api/auth/ambiance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mode }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return data.error ?? 'Erreur'
    setUser((prev) => (prev ? { ...prev, ambianceMode: mode } : prev))
    return null
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, setPlayMode, setAmbianceMode }),
    [user, loading, login, register, logout, refresh, setPlayMode, setAmbianceMode]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const SSR_AUTH_FALLBACK: AuthContextValue = {
  user: null,
  loading: true,
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
