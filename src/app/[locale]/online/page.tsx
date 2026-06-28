"use client"

import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'
import { useAuth } from '@/components/providers/AuthProvider'

/** Redirige vers le hub jeux unifié en mode en ligne. */
export default function OnlineRedirectPage() {
  const router = useRouter()
  const { user, loading, setPlayMode } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace('/compte')
      return
    }
    void (async () => {
      if (user.playMode !== 'online') {
        await setPlayMode('online')
      }
      router.replace('/jeux')
    })()
  }, [loading, user, setPlayMode, router])

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-white/60">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
    </div>
  )
}
