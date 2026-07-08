'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

/** Progression du compte (XP/niveau/cosmétiques débloqués) — voir /api/online/progression. */
export type OnlineProgression = {
  xp: number
  level: number
  current: number
  required: number
  unlockedKeys: string[]
  grantedKeys: string[]
}

export function useOnlineProgression() {
  const { user } = useAuth()
  const [progression, setProgression] = useState<OnlineProgression | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/online/progression', { credentials: 'include' })
      if (!res.ok) return
      const json = (await res.json()) as { progression: OnlineProgression }
      setProgression(json.progression)
    } catch {
      // réseau : on garde l'état précédent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setProgression(null)
      setLoading(false)
      return
    }
    void refresh()
  }, [user?.id, refresh])

  return { progression, loading, refresh }
}
