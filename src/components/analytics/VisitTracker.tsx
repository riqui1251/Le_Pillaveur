"use client"

import { useEffect } from 'react'
import { sendVisitPing } from '@/lib/visit-ping-client'

const PING_INTERVAL_MS = 60_000

export function VisitTracker() {
  useEffect(() => {
    let active = true

    const ping = () => {
      if (!active) return
      sendVisitPing()
    }

    ping()
    const id = window.setInterval(ping, PING_INTERVAL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return null
}
