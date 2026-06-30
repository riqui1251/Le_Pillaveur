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

export type AuthUser = {
  id: string
  email: string
  displayName: string
  onlineDisplayName: string | null
  accountCode: string
  role: 'user' | 'moderator' | 'admin' | 'superadmin' | 'fondateur'
  locale: string
  playMode: 'local' | 'online'
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  register: (email: string, password: string, displayName: string, locale?: string) => Promise<string | null>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  setPlayMode: (mode: 'local' | 'online') => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' })
  if (!res.ok) return null
  const data = await res.json()
  return data.user ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const tErrors = useTranslations('auth.errors')

  const refresh = useCallback(async () => {
    const me = await fetchMe()
    setUser(me)
  }, [])

  useEffect(() => {
    fetchMe().then(setUser).finally(() => setLoading(false))
  }, [])

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
        body: JSON.stringify({ email, password, displayName, locale }),
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

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, setPlayMode }),
    [user, loading, login, register, logout, refresh, setPlayMode]
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
