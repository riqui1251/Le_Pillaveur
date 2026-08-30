"use client"

import { useEffect } from 'react'
import { useRouter } from '@/i18n/navigation'

/** Redirige vers le hub qui consomme ?join= (JoinGate/rejointe auto). */
export function InviteRedirect({ code }: { code: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(`/jeux?join=${code}`)
  }, [router, code])
  return null
}
