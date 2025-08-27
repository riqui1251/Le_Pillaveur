"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSelectedPlayers } from '@/hooks/useSelectedPlayers'

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { selectedIds } = useSelectedPlayers()

  useEffect(() => {
    if (!selectedIds || selectedIds.length < 2) {
      router.replace('/joueurs')
    }
  }, [selectedIds, router])

  return (
    <div className="container mx-auto max-w-4xl p-2 sm:p-4">
      <div className="space-y-6 bg-gray-900 p-3 sm:p-6 rounded-md sm:rounded-xl text-white">
        {children}
      </div>
    </div>
  )
} 