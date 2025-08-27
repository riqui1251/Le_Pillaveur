"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function MobileRedirect() {
  const router = useRouter()
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      navigator.userAgent
    ) || window.innerWidth <= 768
    if (isMobile) {
      router.replace('/mobile')
    }
  }, [router])
  return null
}


